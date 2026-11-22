-- Etapa 2: organizações (multiempresa), membros, convites e segmentos de interesse.
-- Tudo aqui pertence a uma organização e é isolado por RLS.

create type public.porte_empresa as enum ('me_epp', 'demais');
create type public.papel_membro as enum ('dono', 'membro');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null check (char_length(btrim(razao_social)) between 2 and 200),
  cnpj text not null unique check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  porte public.porte_empresa not null,
  plano text not null default 'gratuito',
  ufs text[] not null default '{}' check (
    ufs <@ array[
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
      'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    ]::text[]
  ),
  onboarding_concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column public.organizacoes.plano is
  'Reservado para cobrança futura. O cliente não pode alterar (sem grant de update).';
comment on column public.organizacoes.ufs is 'Estados atendidos pela empresa.';

create trigger organizacoes_atualizado_em
  before update on public.organizacoes
  for each row execute function privado.tocar_atualizado_em();

create table public.membros (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel public.papel_membro not null default 'membro',
  nome text,
  email text not null,
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id),
  -- MVP: cada usuário pertence a uma única organização.
  -- Remova esta restrição para permitir mais de uma.
  constraint membros_user_id_unico unique (user_id)
);
comment on column public.membros.nome is
  'Cópia do nome no momento da entrada (auth.users não é visível ao cliente).';
comment on column public.membros.email is
  'Cópia do e-mail no momento da entrada (auth.users não é visível ao cliente).';

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  aceito_em timestamptz,
  unique (org_id, email)
);
comment on table public.convites is
  'Convite por e-mail. Quem entra com esse e-mail (confirmado) pode aceitar.';

create index convites_email_idx on public.convites (email) where aceito_em is null;

create table public.organizacao_segmentos (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  segmento_id uuid not null references public.segmentos (id) on delete restrict,
  criado_em timestamptz not null default now(),
  primary key (org_id, segmento_id)
);

create index organizacao_segmentos_segmento_idx on public.organizacao_segmentos (segmento_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares (schema privado, fora da API)
-- ---------------------------------------------------------------------------
create or replace function privado.eh_membro(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function privado.eh_dono(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.papel = 'dono'
  );
$$;

-- E-mail do usuário logado, só se já estiver confirmado.
create or replace function privado.email_confirmado()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

revoke all on function privado.eh_membro(uuid) from public;
revoke all on function privado.eh_dono(uuid) from public;
revoke all on function privado.email_confirmado() from public;
grant execute on function privado.eh_membro(uuid) to authenticated, service_role;
grant execute on function privado.eh_dono(uuid) to authenticated, service_role;
grant execute on function privado.email_confirmado() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizacoes enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.organizacao_segmentos enable row level security;

-- organizacoes: criação só pela função criar_organizacao().
create policy "membro ou admin lê a organização"
  on public.organizacoes for select to authenticated
  using (privado.eh_membro(id) or (select privado.eh_admin_plataforma()));

create policy "dono altera a organização"
  on public.organizacoes for update to authenticated
  using (privado.eh_dono(id))
  with check (privado.eh_dono(id));

-- membros: entrada só pelas funções criar_organizacao() e aceitar_convite().
create policy "membro ou admin lê os membros"
  on public.membros for select to authenticated
  using (privado.eh_membro(org_id) or (select privado.eh_admin_plataforma()));

create policy "dono remove outros membros"
  on public.membros for delete to authenticated
  using (privado.eh_dono(org_id) and user_id <> (select auth.uid()));

-- convites
create policy "dono lê os convites"
  on public.convites for select to authenticated
  using (privado.eh_dono(org_id));

create policy "dono cria convites"
  on public.convites for insert to authenticated
  with check (privado.eh_dono(org_id) and convidado_por = (select auth.uid()));

create policy "dono cancela convites"
  on public.convites for delete to authenticated
  using (privado.eh_dono(org_id));

-- organizacao_segmentos
create policy "membro ou admin lê os segmentos da organização"
  on public.organizacao_segmentos for select to authenticated
  using (privado.eh_membro(org_id) or (select privado.eh_admin_plataforma()));

create policy "dono inclui segmentos da organização"
  on public.organizacao_segmentos for insert to authenticated
  with check (privado.eh_dono(org_id));

create policy "dono remove segmentos da organização"
  on public.organizacao_segmentos for delete to authenticated
  using (privado.eh_dono(org_id));

-- ---------------------------------------------------------------------------
-- Permissões explícitas
-- ---------------------------------------------------------------------------
revoke all on table
  public.organizacoes, public.membros, public.convites, public.organizacao_segmentos
from anon, authenticated;

grant select on table public.organizacoes to authenticated;
-- "plano" fica de fora: o cliente não muda o próprio plano.
grant update (razao_social, cnpj, porte, ufs, onboarding_concluido_em)
  on table public.organizacoes to authenticated;

grant select, delete on table public.membros to authenticated;
grant select, insert, delete on table public.convites to authenticated;
grant select, insert, delete on table public.organizacao_segmentos to authenticated;

grant all on table
  public.organizacoes, public.membros, public.convites, public.organizacao_segmentos
to service_role;

-- ---------------------------------------------------------------------------
-- Funções chamadas pelo app (RPC)
-- ---------------------------------------------------------------------------

-- Cria a organização e torna o usuário logado o dono, numa única transação.
create or replace function public.criar_organizacao(
  p_razao_social text,
  p_cnpj text,
  p_porte public.porte_empresa
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_email text;
  v_nome text;
begin
  if v_user is null then
    raise exception 'NAO_AUTENTICADO';
  end if;
  if exists (select 1 from public.membros m where m.user_id = v_user) then
    raise exception 'JA_TEM_ORGANIZACAO';
  end if;
  if exists (select 1 from public.organizacoes o where o.cnpj = p_cnpj) then
    raise exception 'CNPJ_JA_CADASTRADO';
  end if;

  select
    lower(u.email),
    coalesce(
      nullif(u.raw_user_meta_data ->> 'nome', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', '')
    )
  into v_email, v_nome
  from auth.users u
  where u.id = v_user;

  insert into public.organizacoes (razao_social, cnpj, porte)
  values (btrim(p_razao_social), p_cnpj, p_porte)
  returning id into v_org;

  insert into public.membros (org_id, user_id, papel, nome, email)
  values (v_org, v_user, 'dono', v_nome, v_email);

  return v_org;
end;
$$;

-- Convites pendentes para o e-mail (confirmado) do usuário logado.
create or replace function public.meus_convites()
returns table (convite_id uuid, organizacao text, criado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, o.razao_social, c.criado_em
  from public.convites c
  join public.organizacoes o on o.id = c.org_id
  where c.email = (select privado.email_confirmado())
    and c.aceito_em is null
    and c.expira_em > now()
  order by c.criado_em desc;
$$;

-- Aceita um convite: só para o dono do e-mail convidado, com e-mail confirmado.
create or replace function public.aceitar_convite(p_convite uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := (select privado.email_confirmado());
  v_convite public.convites%rowtype;
  v_nome text;
begin
  if v_user is null then
    raise exception 'NAO_AUTENTICADO';
  end if;
  if v_email is null then
    raise exception 'EMAIL_NAO_CONFIRMADO';
  end if;
  if exists (select 1 from public.membros m where m.user_id = v_user) then
    raise exception 'JA_TEM_ORGANIZACAO';
  end if;

  select * into v_convite
  from public.convites c
  where c.id = p_convite
    and c.email = v_email
    and c.aceito_em is null
    and c.expira_em > now()
  for update;

  if not found then
    raise exception 'CONVITE_INVALIDO';
  end if;

  select coalesce(
    nullif(u.raw_user_meta_data ->> 'nome', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', '')
  )
  into v_nome
  from auth.users u
  where u.id = v_user;

  insert into public.membros (org_id, user_id, papel, nome, email)
  values (v_convite.org_id, v_user, 'membro', v_nome, v_email);

  update public.convites set aceito_em = now() where id = v_convite.id;

  return v_convite.org_id;
end;
$$;

-- Troca, de uma vez, os segmentos de interesse da organização.
-- Roda com as permissões de quem chama: o RLS garante que só o dono consegue.
create or replace function public.definir_segmentos_organizacao(
  p_org uuid,
  p_segmentos uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not privado.eh_dono(p_org) then
    raise exception 'SEM_PERMISSAO';
  end if;

  delete from public.organizacao_segmentos os
  where os.org_id = p_org and not (os.segmento_id = any (p_segmentos));

  insert into public.organizacao_segmentos (org_id, segmento_id)
  select p_org, s.id
  from public.segmentos s
  where s.id = any (p_segmentos) and s.ativo
  on conflict do nothing;
end;
$$;

revoke all on function public.criar_organizacao(text, text, public.porte_empresa) from public, anon;
revoke all on function public.meus_convites() from public, anon;
revoke all on function public.aceitar_convite(uuid) from public, anon;
revoke all on function public.definir_segmentos_organizacao(uuid, uuid[]) from public, anon;

grant execute on function public.criar_organizacao(text, text, public.porte_empresa)
  to authenticated, service_role;
grant execute on function public.meus_convites() to authenticated, service_role;
grant execute on function public.aceitar_convite(uuid) to authenticated, service_role;
grant execute on function public.definir_segmentos_organizacao(uuid, uuid[])
  to authenticated, service_role;
