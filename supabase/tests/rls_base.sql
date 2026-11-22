-- Testes de RLS da base global. Falha (exception) se alguma regra estiver errada.
-- Rodado por scripts/testar-banco.sh depois das migrations e do seed.

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@exemplo.test', now()),
  ('00000000-0000-0000-0000-00000000000b', 'cliente@exemplo.test', now());

insert into public.admins_plataforma (user_id)
values ('00000000-0000-0000-0000-00000000000a');

-- Visitante (anon): não lê nada.
set local role anon;
select teste.bloqueia('select 1 from public.compras', 'visitante não lê compras');
select teste.bloqueia('select 1 from public.segmentos', 'visitante não lê segmentos');
select teste.bloqueia('select 1 from public.admins_plataforma', 'visitante não lê admins');
reset role;

-- Cliente comum: lê dados globais, não escreve.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.espera((select count(*) from public.compras) = 9, 'cliente lê as 9 compras de exemplo');
select teste.espera((select count(*) from public.compra_itens) = 36, 'cliente lê os 36 itens de exemplo');
select teste.espera((select count(*) from public.segmentos) = 17, 'cliente lê os 17 segmentos');
select teste.espera((select count(*) from public.admins_plataforma) = 0, 'cliente não vê quem é admin');
select teste.espera(not privado.eh_admin_plataforma(), 'cliente não é admin');
select teste.bloqueia($$update public.segmentos set nome = 'x'$$, 'cliente não altera segmentos');
select teste.bloqueia($$delete from public.segmentos$$, 'cliente não exclui segmentos');
select teste.bloqueia($$update public.compras set objeto = 'x'$$, 'cliente não altera compras');
select teste.bloqueia($$delete from public.compra_itens$$, 'cliente não exclui itens');
select teste.bloqueia(
  $$insert into public.admins_plataforma (user_id) values ('00000000-0000-0000-0000-00000000000b')$$,
  'cliente não se promove a admin'
);
reset role;

-- A tentativa de inserir segmento como cliente deve falhar por RLS.
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
  begin
    insert into public.segmentos (slug, nome) values ('invasor', 'Invasor');
    raise exception 'FALHOU: cliente conseguiu incluir segmento';
  exception when insufficient_privilege then
    raise notice 'ok: cliente não inclui segmentos';
  end;
  reset role;
end
$$;

-- Admin da plataforma: edita segmentos, mas não escreve em dados do PNCP.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select teste.espera(privado.eh_admin_plataforma(), 'admin é reconhecido');
insert into public.segmentos (slug, nome) values ('teste-admin', 'Teste admin');
update public.segmentos set nome = 'Teste admin 2' where slug = 'teste-admin';
select teste.espera(
  (select nome from public.segmentos where slug = 'teste-admin') = 'Teste admin 2',
  'admin inclui e altera segmento'
);
delete from public.segmentos where slug = 'teste-admin';
select teste.espera(
  not exists (select 1 from public.segmentos where slug = 'teste-admin'),
  'admin exclui segmento'
);
select teste.bloqueia($$update public.compras set objeto = 'x'$$, 'admin não altera compras pelo app');
reset role;
