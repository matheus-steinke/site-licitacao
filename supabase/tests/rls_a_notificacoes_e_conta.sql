-- Testes da etapa 9: preferências do e-mail diário, registro de envios e exclusão da conta.
-- Roda depois dos anteriores: organização A (dono ...c1, membro ...c3) e B (dono ...c2).
-- É o último teste com dados: no fim, o membro da A e a organização B deixam de existir.

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset

select teste.espera(
  (select bool_and(email_diario and email_diario_hora = 7) from public.organizacoes)
  and (select bool_and(recebe_email_diario) from public.membros),
  'por padrão o e-mail diário vem ligado, às 7h, para todos');

-- Preferência pessoal: cada um muda só a sua.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
update public.membros set recebe_email_diario = false where user_id = '00000000-0000-0000-0000-0000000000c3';
select teste.espera(
  (select not recebe_email_diario from public.membros where user_id = '00000000-0000-0000-0000-0000000000c3'),
  'membro deixa de receber o e-mail diário');
select teste.bloqueia(
  $$update public.membros set recebe_email_diario = false where user_id = '00000000-0000-0000-0000-0000000000c1'$$,
  'membro não muda a preferência do colega');
select teste.bloqueia($$update public.membros set papel = 'dono'$$, 'membro não se promove a dono');
select teste.bloqueia($$update public.membros set email = 'outro@exemplo.test'$$, 'membro não troca o e-mail gravado');
select teste.bloqueia($$update public.organizacoes set email_diario = false$$, 'membro comum não desliga o e-mail da empresa');
reset role;

-- Preferência da empresa: só o dono.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select triagem_config_em as config_antes from public.organizacoes where id = :'org_a' \gset
update public.organizacoes set email_diario = false, email_diario_hora = 18 where id = :'org_a';
select teste.espera(
  (select not email_diario and email_diario_hora = 18 from public.organizacoes where id = :'org_a'),
  'o dono desliga o e-mail diário e muda a hora');
select teste.espera(
  (select triagem_config_em = :'config_antes' from public.organizacoes where id = :'org_a'),
  'mexer no e-mail não refaz a triagem');
select teste.falha_com(
  format($$update public.organizacoes set email_diario_hora = 24 where id = %L$$, :'org_a'), 'check', 'hora fora de 0 a 23 é recusada');
select teste.bloqueia(
  format($$update public.organizacoes set email_diario = false where id = %L$$, :'org_b'), 'dono não mexe no e-mail de outra empresa');
select teste.bloqueia($$update public.organizacoes set plano = 'pago'$$, 'e continua sem poder mudar o próprio plano');
reset role;

-- Registro dos envios: só o agendador grava; a empresa lê os dela.
set local role anon;
select teste.bloqueia('select 1 from public.email_envios', 'visitante não lê os envios');
reset role;
set local role service_role;
insert into public.email_envios (org_id, tipo, dia, status, destinatarios, oportunidades)
values (:'org_a', 'diario', current_date, 'enviado', 2, 5), (:'org_b', 'diario', current_date, 'vazio', 0, 0);
select teste.falha_com(
  format($$insert into public.email_envios (org_id, tipo, dia, status) values (%L, 'diario', current_date, 'enviado')$$, :'org_a'),
  'duplicate', 'não há dois envios do mesmo tipo no mesmo dia');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.espera(
  (select count(*) = 1 and bool_and(org_id = :'org_a' and oportunidades = 5) from public.email_envios),
  'membro vê só os envios da própria empresa');
select teste.bloqueia(
  format($$insert into public.email_envios (org_id, tipo, dia, status) values (%L, 'diario', current_date + 1, 'enviado')$$, :'org_a'),
  'cliente não registra envio');
select teste.bloqueia($$delete from public.email_envios$$, 'nem apaga');
reset role;

-- Excluir a conta.
set local role anon;
select teste.bloqueia($$select public.excluir_conta('EXCLUIR')$$, 'visitante não exclui conta');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.falha_com($$select public.excluir_conta('excluir')$$, 'Confirmação', 'sem a confirmação exata, nada é excluído');
select teste.espera(public.excluir_conta('EXCLUIR') = 'usuario', 'membro comum exclui só a própria conta');
reset role;
select teste.espera(
  not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000c3')
  and not exists (select 1 from public.membros where user_id = '00000000-0000-0000-0000-0000000000c3')
  and exists (select 1 from public.organizacoes where id = :'org_a')
  and (select count(*) from public.membros where org_id = :'org_a') = 1,
  'o login e o vínculo dele somem; a empresa e o dono continuam');

-- O dono da B tem dados: tudo vai junto.
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo)
values (:'org_b', 'X1', 'REF-X1', 'Produto da B', 10, 5);
insert into public.buscas_salvas (org_id, nome, filtros, criado_por) values (:'org_b', 'Busca da B', '{}', null);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera(public.excluir_conta('EXCLUIR') = 'empresa', 'o dono exclui a conta e a empresa');
reset role;
select teste.espera(
  not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000c2')
  and not exists (select 1 from public.organizacoes where id = :'org_b')
  and not exists (select 1 from public.produtos where org_id = :'org_b')
  and not exists (select 1 from public.buscas_salvas where org_id = :'org_b')
  and not exists (select 1 from public.email_envios where org_id = :'org_b')
  and not exists (select 1 from public.membros where org_id = :'org_b'),
  'empresa, catálogo, buscas, envios e vínculos da B foram apagados');
select teste.espera(
  exists (select 1 from public.organizacoes where id = :'org_a')
  and exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000c1')
  and (select count(*) from public.compras) > 0,
  'a outra empresa e os dados do PNCP não são tocados');
