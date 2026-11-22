-- Imita o mínimo do Supabase num Postgres comum, só para validar migrations
-- e políticas de RLS localmente (scripts/testar-banco.sh). NÃO aplicar no Supabase.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''
  )::uuid;
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ajudantes dos testes (supabase/tests/rls_*.sql)
-- ---------------------------------------------------------------------------
create schema if not exists teste;
grant usage on schema teste to anon, authenticated, service_role;

-- Passa se a condição for verdadeira.
create or replace function teste.espera(condicao boolean, mensagem text)
returns void language plpgsql as $$
begin
  if condicao is not true then
    raise exception 'FALHOU: %', mensagem;
  end if;
  raise notice 'ok: %', mensagem;
end;
$$;

-- Passa se o comando for negado (sem permissão) ou não afetar nenhuma linha (RLS).
create or replace function teste.bloqueia(comando text, mensagem text)
returns void language plpgsql as $$
declare
  linhas bigint;
begin
  begin
    execute comando;
    get diagnostics linhas = row_count;
  exception when insufficient_privilege then
    raise notice 'ok: % (sem permissão)', mensagem;
    return;
  end;
  if linhas > 0 then
    raise exception 'FALHOU: % (% linha(s) afetada(s))', mensagem, linhas;
  end if;
  raise notice 'ok: % (0 linhas)', mensagem;
end;
$$;

-- Passa se o comando falhar com um erro cuja mensagem contenha o trecho.
create or replace function teste.falha_com(comando text, trecho text, mensagem text)
returns void language plpgsql as $$
begin
  begin
    execute comando;
  exception when others then
    if position(lower(trecho) in lower(sqlerrm)) > 0 then
      raise notice 'ok: % (%)', mensagem, trecho;
      return;
    end if;
    raise exception 'FALHOU: % (erro inesperado: %)', mensagem, sqlerrm;
  end;
  raise exception 'FALHOU: % (o comando não falhou)', mensagem;
end;
$$;

grant execute on all functions in schema teste to anon, authenticated, service_role;
