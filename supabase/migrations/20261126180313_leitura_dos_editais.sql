-- Etapa 10: leitura do edital e do termo de referência (sem IA) para os alertas de amostra,
-- comodato e visita técnica. O coletor baixa os arquivos do PNCP, extrai o texto e guarda só os
-- trechos encontrados; o texto inteiro não é guardado (não cabe no plano gratuito do banco).
-- É dado global, como o resto do PNCP: uma leitura por licitação, igual para todas as empresas.

-- A coluna prevista para o texto inteiro nunca foi usada.
alter table public.compras drop column texto_edital;

create table public.compra_editais (
  compra_id uuid primary key references public.compras (id) on delete cascade,
  -- lido: há texto; sem_texto: só imagem digitalizada ou formato não lido; erro: nada foi baixado.
  status text not null check (status in ('lido', 'sem_texto', 'erro')),
  -- [{"tipo": "amostra" | "comodato" | "visita_tecnica", "nivel": "exige" | "cita"}]
  alertas jsonb not null default '[]'::jsonb check (jsonb_typeof(alertas) = 'array'),
  -- [{"tipo": ..., "texto": "…trecho…", "arquivo": "título do arquivo no PNCP"}]
  trechos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(trechos) = 'array' and jsonb_array_length(trechos) <= 12),
  -- Lista de arquivos que foi lida: quando o órgão publica outro arquivo, a leitura é refeita.
  assinatura text not null,
  -- Versão das regras (VERSAO_DAS_REGRAS): regra nova, leitura refeita.
  versao integer not null,
  arquivos_lidos integer not null default 0,
  arquivos_total integer not null default 0,
  erro text,
  tentativas integer not null default 0,
  lido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
comment on table public.compra_editais is
  'Leitura automática do edital de cada licitação: alertas e trechos. O sistema nunca afirma que o edital não exige algo.';

alter table public.compra_editais enable row level security;
create policy "usuário logado lê a leitura do edital"
  on public.compra_editais for select to authenticated using (true);

revoke all on table public.compra_editais from anon, authenticated;
grant select on table public.compra_editais to authenticated;
grant all on table public.compra_editais to service_role;

-- A lista de oportunidades ganha os alertas do edital (no fim, como o Postgres exige).
create or replace view public.oportunidades_lista
with (security_invoker = true)
as
select
  o.id, o.org_id, o.compra_id, o.status, o.motivo_descarte, o.decidido_em,
  o.prioridade, o.score, o.itens_compativeis, o.itens_a_verificar, o.itens_do_segmento,
  o.segmento_ids, o.valor_estimado, o.alertas, o.triada_em, o.criado_em,
  c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.uf, c.municipio,
  c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa, c.valor_total_estimado, c.exemplo,
  g.razao_social as orgao_nome,
  (select count(*) from public.compra_itens i where i.compra_id = c.id)::integer as total_itens,
  o.itens_por_segmento,
  e.alertas as alertas_do_edital
from public.oportunidades o
join public.compras c on c.id = o.compra_id
left join public.orgaos g on g.cnpj = c.orgao_cnpj
left join public.compra_editais e on e.compra_id = c.id;

-- Licitações abertas, dos segmentos atendidos, cujo edital falta ler ou precisa ser relido
-- (regra nova, arquivo novo ou falha anterior). Primeiro as que já são oportunidade de alguma
-- empresa; depois, as de disputa mais próxima.
create or replace function public.coletor_editais_pendentes(p_versao integer, p_limite integer default 100)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pendentes as (
    select
      c.id as compra_id, c.controle_pncp, a.assinatura, a.arquivos, c.data_disputa,
      exists (select 1 from public.oportunidades o where o.compra_id = c.id and o.prioridade > 0) as oportunidade
    from public.compras c
    cross join lateral (
      select
        md5(string_agg(
          f.sequencial_documento || '|' || f.url || '|' || coalesce(extract(epoch from f.publicado_em)::bigint::text, ''),
          ',' order by f.sequencial_documento)) as assinatura,
        jsonb_agg(
          jsonb_build_object('sequencial', f.sequencial_documento, 'titulo', f.titulo, 'tipo', f.tipo_documento, 'url', f.url)
          order by f.sequencial_documento) as arquivos
      from public.compra_arquivos f
      where f.compra_id = c.id
    ) a
    left join public.compra_editais e on e.compra_id = c.id
    where c.situacao_id = 1
      and c.data_disputa > now()
      and not c.exemplo
      and cardinality(c.segmento_ids) > 0
      and a.assinatura is not null
      and (
        e.compra_id is null
        or e.versao < p_versao
        or e.assinatura <> a.assinatura
        or (e.erro is not null and e.tentativas < 5 and e.lido_em < now() - interval '3 hours')
      )
  )
  select jsonb_build_object(
    'restantes', (select count(*) from pendentes),
    'compras', coalesce((
      select jsonb_agg(
        jsonb_build_object('compra_id', p.compra_id, 'controle_pncp', p.controle_pncp, 'assinatura', p.assinatura, 'arquivos', p.arquivos)
        order by p.oportunidade desc, p.data_disputa, p.compra_id)
      from (
        select * from pendentes
        order by oportunidade desc, data_disputa, compra_id
        limit least(greatest(coalesce(p_limite, 100), 1), 500)
      ) p
    ), '[]'::jsonb)
  );
$$;

-- Grava a leitura. Com p_erro, conta a tentativa; se nada foi baixado agora (status "erro")
-- mas já havia uma leitura boa, os alertas dela ficam.
create or replace function public.coletor_gravar_edital(
  p_compra uuid,
  p_status text,
  p_alertas jsonb,
  p_trechos jsonb,
  p_assinatura text,
  p_versao integer,
  p_arquivos_lidos integer,
  p_arquivos_total integer,
  p_erro text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.compra_editais as e (
    compra_id, status, alertas, trechos, assinatura, versao, arquivos_lidos, arquivos_total, erro, tentativas, lido_em
  )
  values (
    p_compra, p_status, coalesce(p_alertas, '[]'::jsonb), coalesce(p_trechos, '[]'::jsonb), p_assinatura, p_versao,
    coalesce(p_arquivos_lidos, 0), coalesce(p_arquivos_total, 0), nullif(left(p_erro, 500), ''),
    case when nullif(p_erro, '') is null then 0 else 1 end, now()
  )
  on conflict (compra_id) do update set
    status = case when excluded.status = 'erro' and e.status = 'lido' then e.status else excluded.status end,
    alertas = case when excluded.status = 'erro' and e.status = 'lido' then e.alertas else excluded.alertas end,
    trechos = case when excluded.status = 'erro' and e.status = 'lido' then e.trechos else excluded.trechos end,
    arquivos_lidos = case when excluded.status = 'erro' and e.status = 'lido' then e.arquivos_lidos else excluded.arquivos_lidos end,
    arquivos_total = excluded.arquivos_total,
    assinatura = excluded.assinatura,
    versao = excluded.versao,
    erro = excluded.erro,
    tentativas = case when excluded.erro is null then 0 else e.tentativas + 1 end,
    lido_em = now();
$$;

revoke all on function public.coletor_editais_pendentes(integer, integer) from public, anon, authenticated;
revoke all on function public.coletor_gravar_edital(uuid, text, jsonb, jsonb, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.coletor_editais_pendentes(integer, integer) to service_role;
grant execute on function public.coletor_gravar_edital(uuid, text, jsonb, jsonb, text, integer, integer, integer, text)
  to service_role;
