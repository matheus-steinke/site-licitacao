-- Cobertura de segurança do banco inteiro. Não depende de dados: confere a estrutura.
-- Roda por último e pega qualquer tabela, view ou função nova que tenha ficado desprotegida.

select teste.espera(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'todas as tabelas de public têm Row Level Security ligado');

select teste.espera(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  'toda tabela com RLS tem pelo menos uma política (nenhuma ficou trancada por esquecimento)');

select teste.espera(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'PUBLIC')),
  'visitante (anon) não tem permissão em nenhuma tabela ou view');

select teste.espera(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  'usuário logado não tem TRUNCATE, REFERENCES nem TRIGGER em nada');

select teste.espera(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'),
  'todas as views respeitam o RLS de quem consulta (security_invoker)');

select teste.espera(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'privado') and has_function_privilege('anon', p.oid, 'execute')),
  'visitante (anon) não executa nenhuma função');

select teste.espera(
  not has_schema_privilege('anon', 'privado', 'usage'),
  'visitante (anon) não entra no schema privado');

select teste.espera(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'privado') and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'),
  'toda função security definer fixa o search_path');

-- Tabelas de cliente: têm org_id e toda política delas passa pela checagem de membro, dono
-- ou admin. As demais (dados do PNCP e da plataforma) são globais.
select teste.espera(
  not exists (
    select 1
    from information_schema.columns col
    join pg_policies p on p.schemaname = 'public' and p.tablename = col.table_name
    where col.table_schema = 'public' and col.column_name = 'org_id'
      and coalesce(p.qual, '') || coalesce(p.with_check, '') !~ 'eh_membro|eh_dono|eh_admin_plataforma|auth\.uid'),
  'toda política de tabela de cliente (com org_id) confere quem é o usuário');

select teste.espera(
  (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'org_id'
     and table_name in (select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r')) >= 10,
  'as tabelas de cliente conhecidas estão na conta (pelo menos 10 com org_id)');
