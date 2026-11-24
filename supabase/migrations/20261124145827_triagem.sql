-- Etapa 5: triagem por organização e oportunidades.
-- O casamento item x catálogo é feito em TypeScript (src/lib/triagem). O banco guarda o
-- resultado, sabe o que ainda falta triar e entrega/grava a triagem em lotes.

-- ---------------------------------------------------------------------------
-- Compras: quando o conteúdo que interessa à triagem mudou pela última vez
-- ---------------------------------------------------------------------------
alter table public.compras
  add column conteudo_alterado_em timestamptz not null default now();
comment on column public.compras.conteudo_alterado_em is
  'Última mudança de objeto, data, situação, área da saúde, segmentos ou itens. A triagem de cada organização refaz as compras alteradas depois da marca dela.';

create or replace function privado.marcar_conteudo_alterado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.objeto, new.uf, new.data_disputa, new.situacao_id, new.area_saude, new.segmento_ids, new.itens_coletados_em)
        is distinct from
        (old.objeto, old.uf, old.data_disputa, old.situacao_id, old.area_saude, old.segmento_ids, old.itens_coletados_em)
  then
    -- clock_timestamp(): cada compra recebe um instante próprio, mesmo na mesma transação.
    new.conteudo_alterado_em := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger compras_conteudo_alterado
  before insert or update on public.compras
  for each row execute function privado.marcar_conteudo_alterado();

create index compras_uf_conteudo_idx on public.compras (uf, conteudo_alterado_em);

-- ---------------------------------------------------------------------------
-- Organização: limites do score e controle da triagem
-- ---------------------------------------------------------------------------
alter table public.organizacoes
  add column score_compativel smallint not null default 60,
  add column score_verificar smallint not null default 40,
  add column triagem_config_em timestamptz not null default now(),
  add column triagem_feita_config_em timestamptz,
  add column triagem_motor integer,
  add column triagem_marca timestamptz,
  add column triada_em timestamptz,
  add constraint organizacoes_scores_validos check (
    score_verificar between 1 and 100 and score_compativel between score_verificar and 100
  );
comment on column public.organizacoes.score_compativel is
  'Score (0 a 100) a partir do qual um item é "compatível" com um produto do catálogo.';
comment on column public.organizacoes.score_verificar is
  'Score a partir do qual um item aparece como "verificar".';
comment on column public.organizacoes.triagem_config_em is
  'Última mudança no que a triagem usa: catálogo, exclusões, segmentos, UFs, porte e limites.';
comment on column public.organizacoes.triagem_feita_config_em is
  'Valor de triagem_config_em com que as oportunidades atuais foram calculadas.';
comment on column public.organizacoes.triagem_motor is
  'Versão do motor de triagem (VERSAO_DA_TRIAGEM) usada nas oportunidades atuais.';
comment on column public.organizacoes.triagem_marca is
  'Compras com conteudo_alterado_em até aqui já foram triadas para esta organização.';

grant update (score_compativel, score_verificar) on table public.organizacoes to authenticated;

-- Mudou UF, porte ou limite: a triagem da organização fica desatualizada.
create or replace function privado.organizacao_mudou_triagem()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.ufs, new.porte, new.score_compativel, new.score_verificar)
     is distinct from (old.ufs, old.porte, old.score_compativel, old.score_verificar) then
    new.triagem_config_em := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger organizacoes_mudou_triagem
  before update on public.organizacoes
  for each row execute function privado.organizacao_mudou_triagem();

-- Mudou catálogo, exclusões ou segmentos: idem. Um gatilho por comando (não por linha),
-- para uma importação de 5.000 produtos tocar a organização uma vez só.
create or replace function privado.marcar_triagem_desatualizada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizacoes
  set triagem_config_em = clock_timestamp()
  where id in (select distinct org_id from linhas);
  return null;
end;
$$;

create trigger produtos_triagem_ins after insert on public.produtos
  referencing new table as linhas for each statement execute function privado.marcar_triagem_desatualizada();
create trigger produtos_triagem_upd after update on public.produtos
  referencing new table as linhas for each statement execute function privado.marcar_triagem_desatualizada();
create trigger produtos_triagem_del after delete on public.produtos
  referencing old table as linhas for each statement execute function privado.marcar_triagem_desatualizada();

create trigger exclusoes_triagem_ins after insert on public.organizacao_exclusoes
  referencing new table as linhas for each statement execute function privado.marcar_triagem_desatualizada();
create trigger exclusoes_triagem_del after delete on public.organizacao_exclusoes
  referencing old table as linhas for each statement execute function privado.marcar_triagem_desatualizada();

create trigger segmentos_org_triagem_ins after insert on public.organizacao_segmentos
  referencing new table as linhas for each statement execute function privado.marcar_triagem_desatualizada();
create trigger segmentos_org_triagem_del after delete on public.organizacao_segmentos
  referencing old table as linhas for each statement execute function privado.marcar_triagem_desatualizada();

-- ---------------------------------------------------------------------------
-- Oportunidades
-- ---------------------------------------------------------------------------
create type public.status_oportunidade as enum ('nova', 'aprovada', 'descartada', 'ganha', 'perdida');

alter table public.produtos add constraint produtos_id_org_unico unique (id, org_id);

create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  compra_id uuid not null references public.compras (id) on delete cascade,
  status public.status_oportunidade not null default 'nova',
  motivo_descarte text check (motivo_descarte is null or char_length(motivo_descarte) between 2 and 500),
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_em timestamptz,
  prioridade smallint not null check (prioridade between 0 and 3),
  score smallint not null default 0 check (score between 0 and 100),
  itens_compativeis integer not null default 0 check (itens_compativeis >= 0),
  itens_a_verificar integer not null default 0 check (itens_a_verificar >= 0),
  itens_do_segmento integer not null default 0 check (itens_do_segmento >= 0),
  segmento_ids uuid[] not null default '{}',
  valor_estimado numeric(18, 2) not null default 0,
  alertas jsonb not null default '[]'::jsonb,
  triada_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, compra_id),
  unique (id, org_id)
);
comment on table public.oportunidades is
  'Licitação que interessa a uma organização: casou com o catálogo ou com os segmentos dela.';
comment on column public.oportunidades.prioridade is
  '3 = tem item compatível com o catálogo; 2 = só itens a verificar; 1 = só o segmento; 0 = deixou de casar depois de decidida.';
comment on column public.oportunidades.status is
  '"Disputada" não é gravado: é a aprovada cuja data de disputa já passou.';
comment on column public.oportunidades.valor_estimado is
  'Soma de quantidade x valor de referência dos itens compatíveis.';

create index oportunidades_compra_idx on public.oportunidades (compra_id);
create index oportunidades_org_status_idx on public.oportunidades (org_id, status);

create trigger oportunidades_atualizado_em
  before update on public.oportunidades
  for each row execute function privado.tocar_atualizado_em();

create table public.oportunidade_itens (
  oportunidade_id uuid not null,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  item_id uuid not null references public.compra_itens (id) on delete cascade,
  produto_id uuid not null,
  nivel text not null check (nivel in ('compativel', 'verificar')),
  score smallint not null check (score between 0 and 100),
  detalhe jsonb not null default '{}'::jsonb,
  alertas text[] not null default '{}',
  lote text,
  primary key (oportunidade_id, item_id),
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete cascade,
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete cascade
);
comment on table public.oportunidade_itens is
  'Itens da licitação que casaram com um produto do catálogo, com o produto sugerido e o porquê.';

create index oportunidade_itens_item_idx on public.oportunidade_itens (item_id);
create index oportunidade_itens_produto_idx on public.oportunidade_itens (produto_id, org_id);
create index oportunidade_itens_org_idx on public.oportunidade_itens (org_id);

alter table public.oportunidades enable row level security;
alter table public.oportunidade_itens enable row level security;

create policy "membro lê oportunidades" on public.oportunidades
  for select to authenticated using (privado.eh_membro(org_id));
create policy "membro lê itens de oportunidade" on public.oportunidade_itens
  for select to authenticated using (privado.eh_membro(org_id));

-- O cliente só lê. A triagem grava por triagem_gravar e a decisão por decidir_oportunidade.
revoke all on table public.oportunidades, public.oportunidade_itens from anon, authenticated;
grant select on table public.oportunidades, public.oportunidade_itens to authenticated;
grant all on table public.oportunidades, public.oportunidade_itens to service_role;

-- Lista da caixa de entrada: a oportunidade com os dados da licitação. security_invoker:
-- valem as políticas das tabelas de origem para quem consulta.
create view public.oportunidades_lista
with (security_invoker = true)
as
select
  o.id, o.org_id, o.compra_id, o.status, o.motivo_descarte, o.decidido_em,
  o.prioridade, o.score, o.itens_compativeis, o.itens_a_verificar, o.itens_do_segmento,
  o.segmento_ids, o.valor_estimado, o.alertas, o.triada_em, o.criado_em,
  c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.uf, c.municipio,
  c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa, c.valor_total_estimado, c.exemplo,
  g.razao_social as orgao_nome,
  (select count(*) from public.compra_itens i where i.compra_id = c.id)::integer as total_itens
from public.oportunidades o
join public.compras c on c.id = o.compra_id
left join public.orgaos g on g.cnpj = c.orgao_cnpj;

revoke all on table public.oportunidades_lista from anon, authenticated;
grant select on table public.oportunidades_lista to authenticated, service_role;
