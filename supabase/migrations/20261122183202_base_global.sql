-- Etapa 1: base global (plataforma + dados públicos do PNCP).
-- Tabelas por organização entram nas etapas seguintes.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Funções auxiliares ficam fora do schema exposto pela API.
create schema if not exists privado;
grant usage on schema privado to authenticated, service_role;

create or replace function privado.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admins da plataforma
-- ---------------------------------------------------------------------------
create table public.admins_plataforma (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
comment on table public.admins_plataforma is
  'Usuários com acesso ao painel ADMIN. Inserção só via SQL/service role.';

alter table public.admins_plataforma enable row level security;

create or replace function privado.eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins_plataforma a where a.user_id = (select auth.uid())
  );
$$;
revoke all on function privado.eh_admin_plataforma() from public;
grant execute on function privado.eh_admin_plataforma() to authenticated, service_role;

create policy "admin vê o próprio registro"
  on public.admins_plataforma for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Segmentos (taxonomia da saúde)
-- ---------------------------------------------------------------------------
create table public.segmentos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  palavras_chave text[] not null default '{}',
  sinonimos text[] not null default '{}',
  exclusoes text[] not null default '{}',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column public.segmentos.palavras_chave is
  'Termos buscados no PNCP e usados para casar itens com o segmento.';
comment on column public.segmentos.sinonimos is
  'Sinônimos e abreviações; casam itens, mas não são buscados no PNCP.';
comment on column public.segmentos.exclusoes is
  'Termos que impedem o item de casar com este segmento.';

create trigger segmentos_atualizado_em
  before update on public.segmentos
  for each row execute function privado.tocar_atualizado_em();

alter table public.segmentos enable row level security;

create policy "usuário logado lê segmentos"
  on public.segmentos for select
  to authenticated
  using (true);

create policy "admin inclui segmentos"
  on public.segmentos for insert
  to authenticated
  with check ((select privado.eh_admin_plataforma()));

create policy "admin altera segmentos"
  on public.segmentos for update
  to authenticated
  using ((select privado.eh_admin_plataforma()))
  with check ((select privado.eh_admin_plataforma()));

create policy "admin exclui segmentos"
  on public.segmentos for delete
  to authenticated
  using ((select privado.eh_admin_plataforma()));

-- ---------------------------------------------------------------------------
-- Dados públicos do PNCP (globais; escrita só pelo coletor via service role)
-- ---------------------------------------------------------------------------
create table public.orgaos (
  cnpj text primary key check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  razao_social text not null,
  esfera text,
  poder text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger orgaos_atualizado_em
  before update on public.orgaos
  for each row execute function privado.tocar_atualizado_em();

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  controle_pncp text not null unique,
  orgao_cnpj text not null references public.orgaos (cnpj),
  ano integer not null,
  sequencial integer not null,
  numero_compra text,
  processo text,
  unidade_codigo text,
  unidade_nome text,
  uf char(2) not null,
  municipio text,
  codigo_ibge text,
  modalidade_id integer not null,
  modalidade_nome text not null,
  modo_disputa text,
  objeto text not null,
  situacao_id integer not null default 1,
  data_publicacao timestamptz,
  data_abertura_proposta timestamptz,
  data_disputa timestamptz,
  valor_total_estimado numeric(18, 4),
  srp boolean,
  link_sistema_origem text,
  texto_edital text,
  exemplo boolean not null default false,
  coletado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (orgao_cnpj, ano, sequencial)
);
comment on column public.compras.controle_pncp is
  'Chave única do PNCP: {cnpj}-1-{sequencial com 6 dígitos}/{ano}.';
comment on column public.compras.situacao_id is
  '1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa (situacaoCompraId do PNCP).';
comment on column public.compras.data_disputa is
  'dataEncerramentoProposta do PNCP: fim do recebimento de propostas e abertura da sessão.';
comment on column public.compras.exemplo is
  'true = dado fictício do seed; apague com: delete from compras where exemplo.';

create index compras_data_disputa_idx on public.compras (data_disputa);
create index compras_uf_idx on public.compras (uf);
create index compras_orgao_idx on public.compras (orgao_cnpj);

create trigger compras_atualizado_em
  before update on public.compras
  for each row execute function privado.tocar_atualizado_em();

create table public.compra_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras (id) on delete cascade,
  numero_item integer not null,
  descricao text not null,
  quantidade numeric(18, 4),
  unidade text,
  valor_unitario_estimado numeric(18, 4),
  valor_total numeric(18, 4),
  grupo text,
  tipo_beneficio_id integer,
  exclusivo_me_epp boolean not null default false,
  situacao_item text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (compra_id, numero_item)
);
comment on column public.compra_itens.grupo is
  'Lote/grupo do item. A confirmar na API do PNCP (etapa do coletor).';

create trigger compra_itens_atualizado_em
  before update on public.compra_itens
  for each row execute function privado.tocar_atualizado_em();

create table public.compra_arquivos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras (id) on delete cascade,
  sequencial_documento integer not null,
  titulo text,
  tipo_documento text,
  url text not null,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (compra_id, sequencial_documento)
);

alter table public.orgaos enable row level security;
alter table public.compras enable row level security;
alter table public.compra_itens enable row level security;
alter table public.compra_arquivos enable row level security;

create policy "usuário logado lê órgãos"
  on public.orgaos for select to authenticated using (true);
create policy "usuário logado lê compras"
  on public.compras for select to authenticated using (true);
create policy "usuário logado lê itens"
  on public.compra_itens for select to authenticated using (true);
create policy "usuário logado lê arquivos"
  on public.compra_arquivos for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Permissões explícitas: visitante (anon) não acessa nada; usuário logado só lê.
-- ---------------------------------------------------------------------------
revoke all on table
  public.admins_plataforma,
  public.segmentos,
  public.orgaos,
  public.compras,
  public.compra_itens,
  public.compra_arquivos
from anon, authenticated;

grant select on table
  public.admins_plataforma,
  public.orgaos,
  public.compras,
  public.compra_itens,
  public.compra_arquivos
to authenticated;

grant select, insert, update, delete on table public.segmentos to authenticated;

grant all on table
  public.admins_plataforma,
  public.segmentos,
  public.orgaos,
  public.compras,
  public.compra_itens,
  public.compra_arquivos
to service_role;
