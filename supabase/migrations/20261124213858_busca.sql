-- Etapa 6: busca de licitações por palavra-chave e filtros, buscas salvas e busca do catálogo
-- sem diferenciar acentos.

-- ---------------------------------------------------------------------------
-- Texto e índice de busca
-- ---------------------------------------------------------------------------

-- Minúsculas, sem acento, só letras e números separados por um espaço:
-- "Cânula DUPLO-J 6Fr" -> "canula duplo j 6fr".
create or replace function privado.texto_de_busca(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, ''))),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- As palavras do texto, prontas para a busca. Sem dicionário de idioma ("simple"): quem cuida
-- de plural e variações é a busca por começo de palavra.
create or replace function privado.vetor_de_busca(p_texto text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsvector('simple'::regconfig, privado.texto_de_busca(left(p_texto, 4000)));
$$;

-- O que o usuário digitou vira "todas estas palavras, pelo começo": "cateter duplo j" acha
-- "CATETERES ... DUPLO J". Palavras de até 2 letras valem inteiras ("j" não acha "jelco").
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
    limit 8
  ) p;
$$;

revoke all on function
  privado.texto_de_busca(text), privado.vetor_de_busca(text), privado.consulta_de_busca(text)
from public;
grant execute on function
  privado.texto_de_busca(text), privado.vetor_de_busca(text), privado.consulta_de_busca(text)
to authenticated, service_role;

create index compra_itens_busca_idx on public.compra_itens using gin (privado.vetor_de_busca(descricao));
create index compras_busca_idx on public.compras using gin (privado.vetor_de_busca(objeto));

-- ---------------------------------------------------------------------------
-- Busca de licitações
-- ---------------------------------------------------------------------------
-- Palavra-chave no objeto e na descrição dos itens, mais os filtros. Roda com as permissões
-- de quem chama: só licitações da área da saúde e só as oportunidades da própria organização.
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
    select i.compra_id,
           count(*)::integer as quantidade,
           (array_agg(left(i.descricao, 240) order by i.numero_item))[1:3] as amostra
    from public.compra_itens i
    cross join q
    where q.consulta is not null and privado.vetor_de_busca(i.descricao) @@ q.consulta
    group by i.compra_id
  ),
  achadas as (
    select c.id, c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.uf, c.municipio,
           c.modalidade_id, c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa,
           c.valor_total_estimado, c.segmento_ids, c.exemplo,
           coalesce(it.quantidade, 0) as itens_com_termo,
           coalesce(it.amostra, '{}') as amostra,
           (q.consulta is not null and privado.vetor_de_busca(c.objeto) @@ q.consulta) as termo_no_objeto
    from public.compras c
    cross join q
    left join itens it on it.compra_id = c.id
    where c.area_saude is true
      -- Dados de exemplo só enquanto o coletor não trouxe nenhuma licitação real.
      and c.exemplo = (not exists (select 1 from public.compras r where not r.exemplo and r.area_saude))
      and (q.consulta is null or it.compra_id is not null or privado.vetor_de_busca(c.objeto) @@ q.consulta)
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
      select jsonb_agg(to_jsonb(l) - 'ordem' order by l.ordem)
      from (
        select a.*,
               g.razao_social as orgao_nome,
               (select count(*)::integer from public.compra_itens i where i.compra_id = a.id) as total_itens,
               (
                 select jsonb_build_object(
                   'id', o.id, 'status', o.status, 'prioridade', o.prioridade,
                   'itens_compativeis', o.itens_compativeis, 'itens_a_verificar', o.itens_a_verificar,
                   'itens_por_segmento', o.itens_por_segmento
                 )
                 from public.oportunidades o
                 where o.org_id = p_org and o.compra_id = a.id
               ) as oportunidade,
               -- Disputas futuras primeiro, da mais próxima para a mais distante; depois as
               -- passadas, da mais recente para a mais antiga.
               row_number() over (
                 order by (a.data_disputa >= now()) desc nulls last,
                          case when a.data_disputa >= now() then a.data_disputa end asc,
                          a.data_disputa desc nulls last,
                          a.id
               ) as ordem
        from achadas a
        left join public.orgaos g on g.cnpj = a.orgao_cnpj
        order by ordem
        limit least(greatest(coalesce(p_limite, 20), 1), 100)
        offset greatest(coalesce(p_deslocamento, 0), 0)
      ) l
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.buscar_licitacoes(
  uuid, text, text[], uuid[], timestamptz, timestamptz, integer[], integer[], boolean, integer, integer
) from public, anon;
grant execute on function public.buscar_licitacoes(
  uuid, text, text[], uuid[], timestamptz, timestamptz, integer[], integer[], boolean, integer, integer
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Buscas salvas (por organização)
-- ---------------------------------------------------------------------------
create table public.buscas_salvas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  nome text not null check (nome = btrim(nome) and char_length(nome) between 1 and 80),
  filtros jsonb not null check (jsonb_typeof(filtros) = 'object' and pg_column_size(filtros) <= 4000),
  criado_em timestamptz not null default now(),
  unique (org_id, nome)
);
comment on table public.buscas_salvas is
  'Filtros da tela de Busca guardados com um nome. Valem para todos os usuários da organização.';

alter table public.buscas_salvas enable row level security;

create policy "membro lê buscas salvas" on public.buscas_salvas
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro salva buscas" on public.buscas_salvas
  for insert to authenticated with check (privado.eh_membro(org_id));
create policy "membro exclui buscas salvas" on public.buscas_salvas
  for delete to authenticated using (privado.eh_membro(org_id));

revoke all on table public.buscas_salvas from anon, authenticated;
grant select, insert, delete on table public.buscas_salvas to authenticated;
grant all on table public.buscas_salvas to service_role;

-- ---------------------------------------------------------------------------
-- Catálogo: busca sem diferenciar acentos ("canula" acha "cânula")
-- ---------------------------------------------------------------------------
alter table public.produtos
  add column busca text generated always as (
    privado.texto_de_busca(codigo || ' ' || referencia || ' ' || nome || ' ' || coalesce(marca, ''))
  ) stored;
comment on column public.produtos.busca is
  'ID, referência, nome e marca em minúsculas e sem acento, para a busca do catálogo.';
