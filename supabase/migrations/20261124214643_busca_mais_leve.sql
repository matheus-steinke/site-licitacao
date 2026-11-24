-- A busca ficou mais leve, sem mudar o resultado:
-- - palavras de ligação ("de", "para", "com") saem da consulta: sozinhas casavam com quase
--   todos os itens e não ajudam a achar nada;
-- - a amostra de itens com o termo é buscada só para as linhas da página exibida, e não para
--   todas as licitações encontradas;
-- - o termo no objeto usa o índice, em vez de ser conferido licitação por licitação.

create or replace function privado.consulta_de_busca(p_termo text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsquery(
    'simple'::regconfig,
    string_agg(p.palavra || case when length(p.palavra) > 2 then ':*' else '' end, ' & ')
  )
  from (
    select palavra
    from regexp_split_to_table(privado.texto_de_busca(left(p_termo, 200)), ' ') as palavra
    where palavra <> ''
      and palavra <> all (array[
        'a', 'o', 'as', 'os', 'e', 'ou', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
        'para', 'por', 'com', 'sem', 'um', 'uma', 'ao', 'aos', 'p', 'c'
      ])
    limit 8
  ) p;
$$;

create or replace function public.buscar_licitacoes(
  p_org uuid,
  p_termo text default null,
  p_ufs text[] default null,
  p_segmentos uuid[] default null,
  p_de timestamptz default null,
  p_ate timestamptz default null,
  p_modalidades integer[] default null,
  p_situacoes integer[] default null,
  p_so_catalogo boolean default false,
  p_limite integer default 20,
  p_deslocamento integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with q as (
    select privado.consulta_de_busca(p_termo) as consulta
  ),
  itens as materialized (
    select i.compra_id, count(*)::integer as quantidade
    from public.compra_itens i
    cross join q
    where q.consulta is not null and privado.vetor_de_busca(i.descricao) @@ q.consulta
    group by i.compra_id
  ),
  objetos as materialized (
    select c.id
    from public.compras c
    cross join q
    where q.consulta is not null and privado.vetor_de_busca(c.objeto) @@ q.consulta
  ),
  achadas as (
    select c.id, c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.uf, c.municipio,
           c.modalidade_id, c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa,
           c.valor_total_estimado, c.segmento_ids, c.exemplo,
           coalesce(it.quantidade, 0) as itens_com_termo,
           (ob.id is not null) as termo_no_objeto,
           q.consulta
    from public.compras c
    cross join q
    left join itens it on it.compra_id = c.id
    left join objetos ob on ob.id = c.id
    where c.area_saude is true
      -- Dados de exemplo só enquanto o coletor não trouxe nenhuma licitação real.
      and c.exemplo = (not exists (select 1 from public.compras r where not r.exemplo and r.area_saude))
      and (q.consulta is null or it.compra_id is not null or ob.id is not null)
      and (p_ufs is null or c.uf = any (p_ufs))
      and (p_segmentos is null or c.segmento_ids && p_segmentos)
      and (p_de is null or c.data_disputa >= p_de)
      and (p_ate is null or c.data_disputa <= p_ate)
      and (p_modalidades is null or c.modalidade_id = any (p_modalidades))
      and (p_situacoes is null or c.situacao_id = any (p_situacoes))
      and (
        not coalesce(p_so_catalogo, false)
        or exists (
          select 1 from public.oportunidades o
          where o.org_id = p_org and o.compra_id = c.id and o.prioridade >= 2
        )
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from achadas),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(l) - 'ordem' - 'consulta' order by l.ordem)
      from (
        -- As colunas caras (contagens, amostra, oportunidade) só para as linhas desta página.
        select p.*,
               g.razao_social as orgao_nome,
               (select count(*)::integer from public.compra_itens i where i.compra_id = p.id) as total_itens,
               coalesce((
                 select array_agg(s.descricao order by s.numero_item)
                 from (
                   select left(i.descricao, 240) as descricao, i.numero_item
                   from public.compra_itens i
                   where p.itens_com_termo > 0
                     and i.compra_id = p.id
                     and privado.vetor_de_busca(i.descricao) @@ p.consulta
                   order by i.numero_item
                   limit 3
                 ) s
               ), '{}') as amostra,
               (
                 select jsonb_build_object(
                   'id', o.id, 'status', o.status, 'prioridade', o.prioridade,
                   'itens_compativeis', o.itens_compativeis, 'itens_a_verificar', o.itens_a_verificar,
                   'itens_por_segmento', o.itens_por_segmento
                 )
                 from public.oportunidades o
                 where o.org_id = p_org and o.compra_id = p.id
               ) as oportunidade
        from (
          -- Disputas futuras primeiro, da mais próxima para a mais distante; depois as
          -- passadas, da mais recente para a mais antiga.
          select a.*,
                 row_number() over (
                   order by (a.data_disputa >= now()) desc nulls last,
                            case when a.data_disputa >= now() then a.data_disputa end asc,
                            a.data_disputa desc nulls last,
                            a.id
                 ) as ordem
          from achadas a
          order by ordem
          limit least(greatest(coalesce(p_limite, 20), 1), 100)
          offset greatest(coalesce(p_deslocamento, 0), 0)
        ) p
        left join public.orgaos g on g.cnpj = p.orgao_cnpj
      ) l
    ), '[]'::jsonb)
  );
$$;
