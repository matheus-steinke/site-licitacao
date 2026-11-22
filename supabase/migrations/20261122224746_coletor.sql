-- Etapa 4: coletor do PNCP. Tudo aqui é global; a escrita é só do coletor (service role).

-- ---------------------------------------------------------------------------
-- Compras: estado da coleta
-- ---------------------------------------------------------------------------
alter table public.compras
  add column area_saude boolean,
  add column segmento_ids uuid[] not null default '{}',
  add column itens_coletados_em timestamptz,
  add column tentativas_itens integer not null default 0,
  add column pncp_atualizado_em timestamptz,
  add column verificado_em timestamptz;

comment on column public.compras.area_saude is
  'null = itens ainda não coletados; true = pelo menos um item casa com algum segmento; false = nenhum item casa (fica só para não baixar de novo).';
comment on column public.compras.segmento_ids is
  'Segmentos que casaram com algum item (para filtrar sem percorrer os itens).';
comment on column public.compras.pncp_atualizado_em is 'Data de atualização informada pelo PNCP.';
comment on column public.compras.verificado_em is
  'Última vez em que o coletor conferiu situação e datas desta compra.';

update public.compras set area_saude = true where exemplo;

create index compras_area_saude_idx on public.compras (data_disputa) where area_saude is true;
create index compras_pendentes_idx on public.compras (data_disputa) where area_saude is null;
create index compras_segmento_ids_idx on public.compras using gin (segmento_ids);

-- Cliente só enxerga compras da área da saúde; admin da plataforma vê todas.
drop policy "usuário logado lê compras" on public.compras;
create policy "usuário logado lê compras da saúde"
  on public.compras for select to authenticated
  using (area_saude is true or (select privado.eh_admin_plataforma()));

-- ---------------------------------------------------------------------------
-- Segmentos por item e histórico de alterações
-- ---------------------------------------------------------------------------
create table public.compra_item_segmentos (
  item_id uuid not null references public.compra_itens (id) on delete cascade,
  segmento_id uuid not null references public.segmentos (id) on delete cascade,
  primary key (item_id, segmento_id)
);
create index compra_item_segmentos_segmento_idx on public.compra_item_segmentos (segmento_id);

create table public.compra_alteracoes (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras (id) on delete cascade,
  campo text not null check (campo in ('situacao_id', 'data_disputa')),
  valor_anterior text,
  valor_novo text,
  detectado_em timestamptz not null default now()
);
comment on table public.compra_alteracoes is
  'Mudanças de situação (suspensa, revogada...) e de data da disputa (adiada).';
create index compra_alteracoes_compra_idx on public.compra_alteracoes (compra_id, detectado_em desc);
create index compra_alteracoes_recentes_idx on public.compra_alteracoes (detectado_em desc);

alter table public.compra_item_segmentos enable row level security;
alter table public.compra_alteracoes enable row level security;

create policy "usuário logado lê segmentos dos itens"
  on public.compra_item_segmentos for select to authenticated using (true);
create policy "usuário logado lê alterações"
  on public.compra_alteracoes for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Log das rodadas
-- ---------------------------------------------------------------------------
create table public.coletor_rodadas (
  id uuid primary key default gen_random_uuid(),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'sucesso', 'parcial', 'erro')),
  origem text not null default 'agendado' check (origem in ('agendado', 'manual')),
  fonte text check (fonte in ('busca', 'plano_b')),
  termos_buscados integer not null default 0,
  compras_encontradas integer not null default 0,
  compras_novas integer not null default 0,
  compras_atualizadas integer not null default 0,
  compras_descartadas integer not null default 0,
  compras_pendentes integer not null default 0,
  alteracoes integer not null default 0,
  erros integer not null default 0,
  mensagem text
);
comment on column public.coletor_rodadas.status is
  'sucesso = sem erros; parcial = terminou com erros em algumas chamadas ou por tempo; erro = não conseguiu coletar.';
comment on column public.coletor_rodadas.compras_descartadas is
  'Compras cujos itens não casaram com nenhum segmento (fora da área da saúde).';
comment on column public.coletor_rodadas.compras_pendentes is
  'Compras encontradas cujos itens ainda não foram baixados (ficam para a próxima rodada).';
create index coletor_rodadas_inicio_idx on public.coletor_rodadas (iniciado_em desc);

create table public.coletor_erros (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.coletor_rodadas (id) on delete cascade,
  etapa text not null,
  url text,
  status_http integer,
  mensagem text not null,
  criado_em timestamptz not null default now()
);
create index coletor_erros_rodada_idx on public.coletor_erros (rodada_id, criado_em);

alter table public.coletor_rodadas enable row level security;
alter table public.coletor_erros enable row level security;

create policy "admin lê rodadas"
  on public.coletor_rodadas for select to authenticated
  using ((select privado.eh_admin_plataforma()));
create policy "admin lê erros do coletor"
  on public.coletor_erros for select to authenticated
  using ((select privado.eh_admin_plataforma()));

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on table
  public.compra_item_segmentos, public.compra_alteracoes,
  public.coletor_rodadas, public.coletor_erros
from anon, authenticated;

grant select on table
  public.compra_item_segmentos, public.compra_alteracoes,
  public.coletor_rodadas, public.coletor_erros
to authenticated;

grant all on table
  public.compra_item_segmentos, public.compra_alteracoes,
  public.coletor_rodadas, public.coletor_erros
to service_role;

-- ---------------------------------------------------------------------------
-- Gravação de uma compra pelo coletor (atômica)
-- ---------------------------------------------------------------------------
-- p_compra:   campos da compra e do órgão (ver coletor/mapear.ts).
-- p_itens:    null = não mexe nos itens; array = substitui os itens e os segmentos deles.
--             Cada item traz "segmento_ids" (uuid[]).
-- p_arquivos: null = não mexe; array = substitui os arquivos.
-- Devolve {id, resultado: 'nova' | 'atualizada' | 'igual', alteracoes: n}.
create or replace function public.coletor_gravar_compra(
  p_compra jsonb,
  p_itens jsonb default null,
  p_arquivos jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c record;
  v_antiga public.compras%rowtype;
  v_id uuid;
  v_resultado text;
  v_alteracoes integer := 0;
  v_mudou boolean := false;
begin
  select * into c from jsonb_to_record(p_compra) as x (
    controle_pncp text, orgao_cnpj text, orgao_razao_social text, orgao_esfera text,
    orgao_poder text, ano integer, sequencial integer, numero_compra text, processo text,
    unidade_codigo text, unidade_nome text, uf text, municipio text, codigo_ibge text,
    modalidade_id integer, modalidade_nome text, modo_disputa text, objeto text,
    situacao_id integer, data_publicacao timestamptz, data_abertura_proposta timestamptz,
    data_disputa timestamptz, valor_total_estimado numeric, srp boolean,
    link_sistema_origem text, pncp_atualizado_em timestamptz,
    area_saude boolean, segmento_ids uuid[], falha_itens boolean
  );

  insert into public.orgaos (cnpj, razao_social, esfera, poder)
  values (c.orgao_cnpj, c.orgao_razao_social, c.orgao_esfera, c.orgao_poder)
  on conflict (cnpj) do update set
    razao_social = excluded.razao_social,
    esfera = coalesce(excluded.esfera, public.orgaos.esfera),
    poder = coalesce(excluded.poder, public.orgaos.poder)
  where (public.orgaos.razao_social, public.orgaos.esfera, public.orgaos.poder)
    is distinct from
    (excluded.razao_social, coalesce(excluded.esfera, public.orgaos.esfera),
     coalesce(excluded.poder, public.orgaos.poder));

  select * into v_antiga from public.compras where controle_pncp = c.controle_pncp for update;

  if not found then
    insert into public.compras (
      controle_pncp, orgao_cnpj, ano, sequencial, numero_compra, processo, unidade_codigo,
      unidade_nome, uf, municipio, codigo_ibge, modalidade_id, modalidade_nome, modo_disputa,
      objeto, situacao_id, data_publicacao, data_abertura_proposta, data_disputa,
      valor_total_estimado, srp, link_sistema_origem, pncp_atualizado_em,
      area_saude, segmento_ids, itens_coletados_em, tentativas_itens, verificado_em
    ) values (
      c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.processo,
      c.unidade_codigo, c.unidade_nome, c.uf, c.municipio, c.codigo_ibge, c.modalidade_id,
      c.modalidade_nome, c.modo_disputa, c.objeto, coalesce(c.situacao_id, 1),
      c.data_publicacao, c.data_abertura_proposta, c.data_disputa, c.valor_total_estimado,
      c.srp, c.link_sistema_origem, c.pncp_atualizado_em,
      case when p_itens is null then null else c.area_saude end,
      case when p_itens is null then '{}' else coalesce(c.segmento_ids, '{}') end,
      case when p_itens is null then null else now() end,
      case when coalesce(c.falha_itens, false) then 1 else 0 end,
      now()
    )
    returning id into v_id;
    v_resultado := 'nova';
  else
    v_id := v_antiga.id;

    if c.situacao_id is not null and c.situacao_id is distinct from v_antiga.situacao_id then
      insert into public.compra_alteracoes (compra_id, campo, valor_anterior, valor_novo)
      values (v_id, 'situacao_id', v_antiga.situacao_id::text, c.situacao_id::text);
      v_alteracoes := v_alteracoes + 1;
    end if;
    if c.data_disputa is not null and c.data_disputa is distinct from v_antiga.data_disputa then
      insert into public.compra_alteracoes (compra_id, campo, valor_anterior, valor_novo)
      values (v_id, 'data_disputa', v_antiga.data_disputa::text, c.data_disputa::text);
      v_alteracoes := v_alteracoes + 1;
    end if;

    v_mudou := v_alteracoes > 0
      or p_itens is not null
      or (coalesce(c.objeto, v_antiga.objeto), coalesce(c.valor_total_estimado, v_antiga.valor_total_estimado),
          coalesce(c.numero_compra, v_antiga.numero_compra), coalesce(c.modo_disputa, v_antiga.modo_disputa))
         is distinct from
         (v_antiga.objeto, v_antiga.valor_total_estimado, v_antiga.numero_compra, v_antiga.modo_disputa);

    -- Campos ausentes no JSON (null) não apagam o que já existe.
    update public.compras set
      numero_compra = coalesce(c.numero_compra, numero_compra),
      processo = coalesce(c.processo, processo),
      unidade_codigo = coalesce(c.unidade_codigo, unidade_codigo),
      unidade_nome = coalesce(c.unidade_nome, unidade_nome),
      uf = coalesce(c.uf, uf),
      municipio = coalesce(c.municipio, municipio),
      codigo_ibge = coalesce(c.codigo_ibge, codigo_ibge),
      modalidade_id = coalesce(c.modalidade_id, modalidade_id),
      modalidade_nome = coalesce(c.modalidade_nome, modalidade_nome),
      modo_disputa = coalesce(c.modo_disputa, modo_disputa),
      objeto = coalesce(c.objeto, objeto),
      situacao_id = coalesce(c.situacao_id, situacao_id),
      data_publicacao = coalesce(c.data_publicacao, data_publicacao),
      data_abertura_proposta = coalesce(c.data_abertura_proposta, data_abertura_proposta),
      data_disputa = coalesce(c.data_disputa, data_disputa),
      valor_total_estimado = coalesce(c.valor_total_estimado, valor_total_estimado),
      srp = coalesce(c.srp, srp),
      link_sistema_origem = coalesce(c.link_sistema_origem, link_sistema_origem),
      pncp_atualizado_em = coalesce(c.pncp_atualizado_em, pncp_atualizado_em),
      area_saude = case when p_itens is null then area_saude else c.area_saude end,
      segmento_ids = case when p_itens is null then segmento_ids else coalesce(c.segmento_ids, '{}') end,
      itens_coletados_em = case when p_itens is null then itens_coletados_em else now() end,
      tentativas_itens = tentativas_itens + case when coalesce(c.falha_itens, false) then 1 else 0 end,
      verificado_em = now()
    where id = v_id;

    v_resultado := case when v_mudou then 'atualizada' else 'igual' end;
  end if;

  if p_itens is not null then
    -- Itens que sumiram do PNCP saem; os demais são atualizados no lugar (o id não muda).
    delete from public.compra_itens i
    where i.compra_id = v_id
      and not exists (
        select 1 from jsonb_array_elements(p_itens) e
        where (e ->> 'numero_item')::integer = i.numero_item
      );

    insert into public.compra_itens (
      compra_id, numero_item, descricao, quantidade, unidade, valor_unitario_estimado,
      valor_total, grupo, tipo_beneficio_id, exclusivo_me_epp, situacao_item
    )
    select
      v_id, i.numero_item, i.descricao, i.quantidade, i.unidade, i.valor_unitario_estimado,
      i.valor_total, i.grupo, i.tipo_beneficio_id, coalesce(i.exclusivo_me_epp, false),
      i.situacao_item
    from jsonb_to_recordset(p_itens) as i (
      numero_item integer, descricao text, quantidade numeric, unidade text,
      valor_unitario_estimado numeric, valor_total numeric, grupo text,
      tipo_beneficio_id integer, exclusivo_me_epp boolean, situacao_item text
    )
    on conflict (compra_id, numero_item) do update set
      descricao = excluded.descricao,
      quantidade = excluded.quantidade,
      unidade = excluded.unidade,
      valor_unitario_estimado = excluded.valor_unitario_estimado,
      valor_total = excluded.valor_total,
      grupo = excluded.grupo,
      tipo_beneficio_id = excluded.tipo_beneficio_id,
      exclusivo_me_epp = excluded.exclusivo_me_epp,
      situacao_item = excluded.situacao_item;

    delete from public.compra_item_segmentos s
    using public.compra_itens i
    where s.item_id = i.id and i.compra_id = v_id;

    insert into public.compra_item_segmentos (item_id, segmento_id)
    select i.id, seg.id
    from jsonb_array_elements(p_itens) e
    join public.compra_itens i
      on i.compra_id = v_id and i.numero_item = (e ->> 'numero_item')::integer
    cross join lateral jsonb_array_elements_text(coalesce(e -> 'segmento_ids', '[]'::jsonb)) s (segmento_id)
    join public.segmentos seg on seg.id = s.segmento_id::uuid
    on conflict do nothing;
  end if;

  if p_arquivos is not null then
    delete from public.compra_arquivos a
    where a.compra_id = v_id
      and not exists (
        select 1 from jsonb_array_elements(p_arquivos) e
        where (e ->> 'sequencial_documento')::integer = a.sequencial_documento
      );

    insert into public.compra_arquivos (
      compra_id, sequencial_documento, titulo, tipo_documento, url, publicado_em
    )
    select v_id, a.sequencial_documento, a.titulo, a.tipo_documento, a.url, a.publicado_em
    from jsonb_to_recordset(p_arquivos) as a (
      sequencial_documento integer, titulo text, tipo_documento text, url text,
      publicado_em timestamptz
    )
    on conflict (compra_id, sequencial_documento) do update set
      titulo = excluded.titulo,
      tipo_documento = excluded.tipo_documento,
      url = excluded.url,
      publicado_em = excluded.publicado_em;
  end if;

  return jsonb_build_object('id', v_id, 'resultado', v_resultado, 'alteracoes', v_alteracoes);
end;
$$;

revoke all on function public.coletor_gravar_compra(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.coletor_gravar_compra(jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Ajuste do seed de segmentos: sinônimos genéricos demais para o filtro "área da saúde"
-- (palavras comuns fora da saúde ou siglas que coincidem com outras palavras).
-- Remove só estes termos; o que o admin editou continua como está.
-- ---------------------------------------------------------------------------
update public.segmentos s
set sinonimos = array(
  select t from unnest(s.sinonimos) as t
  where t <> all (array[
    'trocar', 'age', 'crescente', 'carretel', 'preventivo', 'pic', 'peg', 'lio', 'faco',
    'raqui', 'material de consumo', 'descartáveis', 'correlatos', 'coil', 'pam', 'touca',
    'laboratório', 'reagentes', 'microscópio', 'equipo', 'basket', 'ferida', 'traqueal'
  ])
)
where s.sinonimos && array[
  'trocar', 'age', 'crescente', 'carretel', 'preventivo', 'pic', 'peg', 'lio', 'faco',
  'raqui', 'material de consumo', 'descartáveis', 'correlatos', 'coil', 'pam', 'touca',
  'laboratório', 'reagentes', 'microscópio', 'equipo', 'basket', 'ferida', 'traqueal'
];
