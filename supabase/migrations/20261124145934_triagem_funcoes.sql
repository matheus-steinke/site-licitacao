-- Etapa 5 (continuação): funções da triagem em lotes e da decisão do cliente.
-- Depende de 20261124145827_triagem.sql (tabelas, gatilhos e a lista de oportunidades).


-- ---------------------------------------------------------------------------
-- Triagem em lotes
-- ---------------------------------------------------------------------------

-- Quem pode triar uma organização: os membros dela e o coletor (service role).
create or replace function privado.pode_triar(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user = 'service_role' or privado.eh_membro(p_org);
$$;

-- Compras que a organização ainda precisa triar: das UFs dela, com disputa futura e
-- alteradas depois da marca. As dos últimos 10 segundos ficam para a próxima chamada,
-- para não pular uma gravação do coletor que ainda não terminou.
create or replace function privado.compras_a_triar(p_org uuid)
returns table (id uuid, conteudo_alterado_em timestamptz)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.conteudo_alterado_em
  from public.organizacoes o
  join public.compras c on c.uf = any (o.ufs)
  where o.id = p_org
    and c.data_disputa >= now()
    -- Dados de exemplo só enquanto o coletor não trouxe nenhuma licitação real.
    and c.exemplo = (not exists (select 1 from public.compras r where not r.exemplo and r.area_saude))
    and (o.triagem_marca is null or c.conteudo_alterado_em > o.triagem_marca)
    and c.conteudo_alterado_em < clock_timestamp() - interval '10 seconds';
$$;

create or replace function privado.triagem_situacao(p_org uuid, p_motor integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'desatualizada',
      o.triagem_feita_config_em is distinct from o.triagem_config_em or o.triagem_motor is distinct from p_motor,
    'pendentes', (select count(*) from privado.compras_a_triar(p_org)),
    'triada_em', o.triada_em
  )
  from public.organizacoes o
  where o.id = p_org;
$$;

-- Entrega o próximo lote de compras a triar, com os itens. Se a configuração da organização
-- mudou (ou o motor), recomeça do zero.
create or replace function privado.triagem_lote(
  p_org uuid,
  p_motor integer,
  p_max_compras integer,
  p_max_itens integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizacoes%rowtype;
  v_marca_ate timestamptz;
  v_compras jsonb;
  v_restantes bigint;
begin
  select * into o from public.organizacoes where id = p_org for update;
  if not found then
    raise exception 'Organização não encontrada.';
  end if;

  if o.triagem_feita_config_em is distinct from o.triagem_config_em or o.triagem_motor is distinct from p_motor then
    update public.organizacoes
    set triagem_feita_config_em = triagem_config_em, triagem_motor = p_motor, triagem_marca = null
    where id = p_org;
    -- Oportunidades ainda não decididas de estados que a organização deixou de atender.
    delete from public.oportunidades op
    using public.compras c
    where op.org_id = p_org and c.id = op.compra_id and op.status = 'nova' and not (c.uf = any (o.ufs));
  end if;

  -- Até p_max_compras compras e cerca de p_max_itens itens, sempre pelo menos uma compra.
  select max(l.conteudo_alterado_em) into v_marca_ate
  from (
    select p.conteudo_alterado_em,
           row_number() over ordem as posicao,
           sum((select count(*) from public.compra_itens i where i.compra_id = p.id)) over ordem as itens_ate_aqui
    from privado.compras_a_triar(p_org) p
    window ordem as (order by p.conteudo_alterado_em, p.id)
    order by p.conteudo_alterado_em, p.id
    limit greatest(p_max_compras, 1)
  ) l
  where l.posicao = 1 or l.itens_ate_aqui <= p_max_itens;

  if v_marca_ate is null then
    update public.organizacoes set triada_em = now() where id = p_org;
    return jsonb_build_object('config_em', o.triagem_config_em, 'marca_ate', null, 'restantes', 0, 'compras', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'objeto', c.objeto,
           'itens', case when c.area_saude is true then coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', i.id,
                      'numero', i.numero_item,
                      'descricao', left(i.descricao, 2000),
                      'quantidade', i.quantidade,
                      'valor', i.valor_unitario_estimado,
                      'me_epp', i.exclusivo_me_epp,
                      'segmentos', coalesce((
                        select jsonb_agg(s.segmento_id) from public.compra_item_segmentos s where s.item_id = i.id
                      ), '[]'::jsonb)
                    ) order by i.numero_item)
             from public.compra_itens i where i.compra_id = c.id
           ), '[]'::jsonb) else '[]'::jsonb end
         )) filter (where c.id is not null), '[]'::jsonb),
         count(*) filter (where p.conteudo_alterado_em > v_marca_ate)
  into v_compras, v_restantes
  from privado.compras_a_triar(p_org) p
  left join public.compras c on c.id = p.id and p.conteudo_alterado_em <= v_marca_ate;

  return jsonb_build_object(
    'config_em', o.triagem_config_em,
    'marca_ate', v_marca_ate,
    'restantes', v_restantes,
    'compras', coalesce(v_compras, '[]'::jsonb)
  );
end;
$$;

-- Grava o resultado de um lote. p_config_em é a configuração com que o lote foi calculado:
-- se a organização mudou algo nesse meio tempo, nada é gravado e o lote é refeito.
create or replace function privado.triagem_gravar(
  p_org uuid,
  p_config_em timestamptz,
  p_marca_ate timestamptz,
  p_resultados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizacoes%rowtype;
  v_validos jsonb;
  v_gravadas integer := 0;
  v_removidas integer := 0;
begin
  select * into o from public.organizacoes where id = p_org for update;
  if not found then
    raise exception 'Organização não encontrada.';
  end if;
  if o.triagem_config_em is distinct from p_config_em or o.triagem_feita_config_em is distinct from p_config_em then
    return jsonb_build_object('ok', false, 'motivo', 'config_mudou');
  end if;

  -- Só compras dos estados da organização.
  select coalesce(jsonb_agg(r.linha), '[]'::jsonb) into v_validos
  from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) as r(linha)
  join public.compras c on c.id = (r.linha ->> 'compra_id')::uuid and c.uf = any (o.ufs);

  -- Deixou de casar: a que ainda não foi decidida some; a decidida fica, sem itens.
  with apagadas as (
    delete from public.oportunidades op
    using jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint)
    where op.org_id = p_org and op.compra_id = r.compra_id and r.prioridade = 0 and op.status = 'nova'
    returning 1
  )
  select count(*) into v_removidas from apagadas;

  update public.oportunidades op
  set prioridade = 0, score = 0, itens_compativeis = 0, itens_a_verificar = 0, itens_do_segmento = 0,
      segmento_ids = '{}', valor_estimado = 0, alertas = '[]'::jsonb, triada_em = now()
  from jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint)
  where op.org_id = p_org and op.compra_id = r.compra_id and r.prioridade = 0;

  with gravadas as (
    insert into public.oportunidades as op (
      org_id, compra_id, prioridade, score, itens_compativeis, itens_a_verificar, itens_do_segmento,
      segmento_ids, valor_estimado, alertas, triada_em
    )
    select p_org, r.compra_id, r.prioridade, r.score, r.itens_compativeis, r.itens_a_verificar,
           r.itens_do_segmento, coalesce(r.segmento_ids, '{}'), coalesce(r.valor_estimado, 0),
           coalesce(r.alertas, '[]'::jsonb), now()
    from jsonb_to_recordset(v_validos) as r(
      compra_id uuid, prioridade smallint, score smallint, itens_compativeis integer, itens_a_verificar integer,
      itens_do_segmento integer, segmento_ids uuid[], valor_estimado numeric, alertas jsonb
    )
    where r.prioridade > 0
    on conflict (org_id, compra_id) do update
    set prioridade = excluded.prioridade, score = excluded.score,
        itens_compativeis = excluded.itens_compativeis, itens_a_verificar = excluded.itens_a_verificar,
        itens_do_segmento = excluded.itens_do_segmento, segmento_ids = excluded.segmento_ids,
        valor_estimado = excluded.valor_estimado, alertas = excluded.alertas, triada_em = excluded.triada_em
    returning 1
  )
  select count(*) into v_gravadas from gravadas;

  -- Os itens são sempre refeitos.
  delete from public.oportunidade_itens oi
  using public.oportunidades op, jsonb_to_recordset(v_validos) as r(compra_id uuid)
  where oi.oportunidade_id = op.id and op.org_id = p_org and op.compra_id = r.compra_id;

  insert into public.oportunidade_itens (oportunidade_id, org_id, item_id, produto_id, nivel, score, detalhe, alertas, lote)
  select op.id, p_org, ci.id, pr.id, i.nivel, i.score, coalesce(i.detalhe, '{}'::jsonb), coalesce(i.alertas, '{}'), i.lote
  from jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint, itens jsonb)
  join public.oportunidades op on op.org_id = p_org and op.compra_id = r.compra_id
  cross join lateral jsonb_to_recordset(coalesce(r.itens, '[]'::jsonb)) as i(
    item_id uuid, produto_id uuid, nivel text, score smallint, detalhe jsonb, alertas text[], lote text
  )
  -- O item tem de ser da compra e o produto, da organização.
  join public.compra_itens ci on ci.id = i.item_id and ci.compra_id = r.compra_id
  join public.produtos pr on pr.id = i.produto_id and pr.org_id = p_org
  where r.prioridade > 0;

  update public.organizacoes
  set triagem_marca = greatest(coalesce(triagem_marca, p_marca_ate), p_marca_ate), triada_em = now()
  where id = p_org and p_marca_ate is not null;

  return jsonb_build_object('ok', true, 'gravadas', v_gravadas, 'removidas', v_removidas);
end;
$$;

revoke all on function
  privado.marcar_conteudo_alterado(), privado.organizacao_mudou_triagem(), privado.marcar_triagem_desatualizada(),
  privado.pode_triar(uuid), privado.compras_a_triar(uuid), privado.triagem_situacao(uuid, integer),
  privado.triagem_lote(uuid, integer, integer, integer),
  privado.triagem_gravar(uuid, timestamptz, timestamptz, jsonb)
from public;
grant execute on function
  privado.pode_triar(uuid), privado.triagem_situacao(uuid, integer),
  privado.triagem_lote(uuid, integer, integer, integer),
  privado.triagem_gravar(uuid, timestamptz, timestamptz, jsonb)
to authenticated, service_role;

-- Portas de entrada (API): conferem quem chama e repassam.
create or replace function public.triagem_situacao(p_org uuid, p_motor integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.pode_triar(p_org) then
    raise exception 'Sem permissão para esta organização.' using errcode = '42501';
  end if;
  return privado.triagem_situacao(p_org, p_motor);
end;
$$;

create or replace function public.triagem_lote(
  p_org uuid,
  p_motor integer,
  p_max_compras integer default 100,
  p_max_itens integer default 10000
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not privado.pode_triar(p_org) then
    raise exception 'Sem permissão para esta organização.' using errcode = '42501';
  end if;
  return privado.triagem_lote(p_org, p_motor, least(greatest(p_max_compras, 1), 500), least(greatest(p_max_itens, 1), 50000));
end;
$$;

create or replace function public.triagem_gravar(
  p_org uuid,
  p_config_em timestamptz,
  p_marca_ate timestamptz,
  p_resultados jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not privado.pode_triar(p_org) then
    raise exception 'Sem permissão para esta organização.' using errcode = '42501';
  end if;
  return privado.triagem_gravar(p_org, p_config_em, p_marca_ate, p_resultados);
end;
$$;

revoke all on function
  public.triagem_situacao(uuid, integer),
  public.triagem_lote(uuid, integer, integer, integer),
  public.triagem_gravar(uuid, timestamptz, timestamptz, jsonb)
from public, anon;
grant execute on function
  public.triagem_situacao(uuid, integer),
  public.triagem_lote(uuid, integer, integer, integer),
  public.triagem_gravar(uuid, timestamptz, timestamptz, jsonb)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisão do cliente: aprovar, descartar, reabrir, ganha/perdida
-- ---------------------------------------------------------------------------
create or replace function public.decidir_oportunidade(
  p_oportunidade uuid,
  p_status public.status_oportunidade,
  p_motivo text default null
)
returns public.status_oportunidade
language plpgsql
security definer
set search_path = ''
as $$
declare
  op public.oportunidades%rowtype;
  v_disputa timestamptz;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into op from public.oportunidades where id = p_oportunidade for update;
  if not found or not privado.eh_membro(op.org_id) then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  select data_disputa into v_disputa from public.compras where id = op.compra_id;

  if p_status = 'descartada' and (v_motivo is null or char_length(v_motivo) < 2) then
    raise exception 'Informe o motivo do descarte.';
  end if;
  if p_status in ('ganha', 'perdida') then
    if op.status not in ('aprovada', 'ganha', 'perdida') then
      raise exception 'Só uma oportunidade aprovada pode ser marcada como ganha ou perdida.';
    end if;
    if v_disputa is null or v_disputa > now() then
      raise exception 'A disputa ainda não aconteceu.';
    end if;
  end if;

  update public.oportunidades
  set status = p_status,
      motivo_descarte = case when p_status = 'descartada' then left(v_motivo, 500) else null end,
      decidido_por = case when p_status = 'nova' then null else (select auth.uid()) end,
      decidido_em = case when p_status = 'nova' then null else now() end
  where id = p_oportunidade;
  return p_status;
end;
$$;

revoke all on function public.decidir_oportunidade(uuid, public.status_oportunidade, text) from public, anon;
grant execute on function public.decidir_oportunidade(uuid, public.status_oportunidade, text) to authenticated;
