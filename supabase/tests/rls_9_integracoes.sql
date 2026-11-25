-- Testes da etapa 8: integrações (conta conectada) e vínculos (evento e pasta por oportunidade).
-- Roda depois dos anteriores: organização A (dono ...c1, membro ...c3) e B (dono ...c2).

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset
select id as compra_sp from public.compras where controle_pncp = '46374500000194-1-000901/2026' \gset
insert into public.oportunidades (org_id, compra_id, prioridade, status)
values (:'org_a', :'compra_sp', 1, 'aprovada') returning id as op_a \gset

-- Quem não está logado não vê nada.
set local role anon;
select teste.bloqueia('select 1 from public.integracoes', 'visitante não lê integrações');
select teste.bloqueia('select 1 from public.integracao_vinculos', 'visitante não lê vínculos');
select teste.bloqueia(
  format($$select public.integracao_conectar(%L, 'google', 'x@x.test', 'cifrado-cifrado-cifrado-1', '{}')$$, :'org_a'),
  'visitante não conecta integração');
reset role;

-- Membro comum não conecta.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.falha_com(
  format($$select public.integracao_conectar(%L, 'google', 'a@empresa.test', 'cifrado-cifrado-cifrado-1', '{}')$$, :'org_a'),
  'Só o dono', 'membro comum não conecta integração');
reset role;

-- O dono conecta.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select teste.falha_com(
  format($$select public.integracao_conectar(%L, 'google', 'a@empresa.test', 'curto', '{}')$$, :'org_a'),
  'inválidas', 'credenciais vazias ou curtas são recusadas');
select teste.falha_com(
  format($$select public.integracao_conectar(%L, 'orkut', 'a@empresa.test', 'cifrado-cifrado-cifrado-1', '{}')$$, :'org_a'),
  'provedor', 'provedor desconhecido é recusado');
select public.integracao_conectar(:'org_a', 'google', ' a@empresa.test ', 'cifrado-cifrado-cifrado-1', array['agenda', 'drive']) as integ \gset
select teste.espera(
  (select conta = 'a@empresa.test' and credenciais = 'cifrado-cifrado-cifrado-1' and escopos = array['agenda', 'drive']
     and agenda_ativa and agenda_id = 'primary' and drive_ativo and pasta_raiz_nome = 'Licitações'
     and pasta_raiz_id is null and automatico and erro is null
     and conectado_por = '00000000-0000-0000-0000-0000000000c1'
   from public.integracoes where id = :'integ'),
  'o dono conecta a conta, com as preferências padrão');
select teste.bloqueia(
  format($$insert into public.integracoes (org_id, provedor, credenciais) values (%L, 'microsoft', 'cifrado-cifrado-cifrado-9')$$, :'org_a'),
  'nem o dono insere direto na tabela');
select teste.bloqueia($$delete from public.integracoes$$, 'nem o dono apaga direto na tabela');
select teste.bloqueia(
  $$update public.integracoes set credenciais = 'outro-outro-outro-outro-1'$$, 'nem o dono troca as credenciais direto na tabela');
reset role;

-- O dono da outra organização não vê nem mexe.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.integracoes) = 0, 'outra organização não vê a integração');
select teste.falha_com(
  format($$select public.integracao_conectar(%L, 'google', 'b@outra.test', 'cifrado-cifrado-cifrado-2', '{}')$$, :'org_a'),
  'Só o dono', 'dono de outra organização não conecta nesta');
select teste.falha_com(
  format($$select public.integracao_configurar(%L, 'google', false, 'x', false, 'x', false)$$, :'org_a'),
  'Só o dono', 'nem configura');
select teste.falha_com(
  format($$select public.integracao_desconectar(%L, 'google')$$, :'org_a'), 'Só o dono', 'nem desconecta');
select teste.bloqueia($$update public.integracoes set erro = 'x'$$, 'nem registra estado');
reset role;

-- Membro comum lê e registra o estado do uso, mas não muda preferências nem credenciais.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.espera((select count(*) from public.integracoes) = 1, 'membro lê a integração da empresa');
update public.integracoes set pasta_raiz_id = 'pasta-raiz-1', erro = 'acesso revogado' where id = :'integ';
select teste.espera(
  (select pasta_raiz_id = 'pasta-raiz-1' and erro = 'acesso revogado' from public.integracoes where id = :'integ'),
  'membro registra a pasta-raiz criada e o erro de acesso');
select teste.bloqueia($$update public.integracoes set agenda_id = 'outra'$$, 'membro não muda a agenda direto na tabela');
select teste.bloqueia($$update public.integracoes set credenciais = 'outro-outro-outro-outro-1'$$, 'membro não troca as credenciais');
select teste.bloqueia($$update public.integracoes set org_id = gen_random_uuid()$$, 'membro não move a integração de organização');
select teste.falha_com(
  format($$select public.integracao_configurar(%L, 'google', false, 'x', false, 'x', false)$$, :'org_a'),
  'Só o dono', 'membro não configura');
reset role;

-- O dono configura.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select public.integracao_configurar(:'org_a', 'google', false, ' comercial@group.calendar.google.com ', true, ' Pregões ', false);
select teste.espera(
  (select not agenda_ativa and agenda_id = 'comercial@group.calendar.google.com' and drive_ativo
     and pasta_raiz_nome = 'Pregões' and not automatico and pasta_raiz_id = 'pasta-raiz-1'
   from public.integracoes where id = :'integ'),
  'o dono muda as preferências');
select public.integracao_configurar(:'org_a', 'google', true, '  ', true, '  ', true);
select teste.espera(
  (select agenda_ativa and agenda_id = 'primary' and pasta_raiz_nome = 'Pregões' and automatico
   from public.integracoes where id = :'integ'),
  'agenda em branco volta para a principal; nome em branco mantém o atual');
select teste.falha_com(
  format($$select public.integracao_configurar(%L, 'microsoft', true, 'x', true, 'x', true)$$, :'org_a'),
  'não encontrada', 'não configura integração que não existe');

-- Reconectar a mesma conta mantém a pasta-raiz e limpa o erro; trocar de conta esquece a pasta.
select public.integracao_conectar(:'org_a', 'google', 'a@empresa.test', 'cifrado-cifrado-cifrado-3', array['agenda']);
select teste.espera(
  (select credenciais = 'cifrado-cifrado-cifrado-3' and escopos = array['agenda'] and pasta_raiz_id = 'pasta-raiz-1'
     and erro is null and pasta_raiz_nome = 'Pregões'
   from public.integracoes where id = :'integ'),
  'reconectar a mesma conta mantém a pasta-raiz e as preferências, e limpa o erro');
select public.integracao_conectar(:'org_a', 'google', 'outra@empresa.test', 'cifrado-cifrado-cifrado-4', array['agenda', 'drive']);
select teste.espera(
  (select conta = 'outra@empresa.test' and pasta_raiz_id is null and (select count(*) from public.integracoes) = 1
   from public.integracoes where id = :'integ'),
  'trocar de conta esquece a pasta-raiz (continua uma integração só)');
reset role;

-- Vínculos: o membro grava em nome da empresa.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
insert into public.integracao_vinculos (org_id, oportunidade_id, provedor, tipo)
values (:'org_a', :'op_a', 'google', 'evento') returning id as vinculo \gset
select teste.espera(
  (select situacao = 'pendente' and id_externo is null from public.integracao_vinculos where id = :'vinculo'),
  'membro reserva o vínculo antes de criar o evento');
select teste.falha_com(
  format($$insert into public.integracao_vinculos (org_id, oportunidade_id, provedor, tipo) values (%L, %L, 'google', 'evento')$$, :'org_a', :'op_a'),
  'duplicate', 'não existem dois eventos para a mesma oportunidade');
update public.integracao_vinculos
set id_externo = 'evento-1', link = 'https://agenda.exemplo/evento-1', situacao = 'ok', dados = '{"data_disputa":"2026-12-03T13:00:00Z"}'
where id = :'vinculo';
select teste.espera(
  (select situacao = 'ok' and dados ->> 'data_disputa' = '2026-12-03T13:00:00Z' from public.integracao_vinculos where id = :'vinculo'),
  'e grava o evento criado');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.integracao_vinculos) = 0, 'outra organização não vê os vínculos');
select teste.bloqueia($$update public.integracao_vinculos set link = 'https://golpe.exemplo'$$, 'nem altera');
select teste.bloqueia($$delete from public.integracao_vinculos$$, 'nem apaga');
select teste.bloqueia(
  format($$insert into public.integracao_vinculos (org_id, oportunidade_id, provedor, tipo) values (%L, %L, 'google', 'pasta')$$, :'org_a', :'op_a'),
  'nem cria vínculo na oportunidade de outra organização');
select teste.falha_com(
  format($$insert into public.integracao_vinculos (org_id, oportunidade_id, provedor, tipo) values (%L, %L, 'google', 'pasta')$$, :'org_b', :'op_a'),
  'foreign key', 'nem vincula a oportunidade alheia à própria organização');
reset role;

-- Desconectar apaga as credenciais e mantém os vínculos; apagar a oportunidade leva os vínculos.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select teste.espera(public.integracao_desconectar(:'org_a', 'google'), 'o dono desconecta');
select teste.espera(not public.integracao_desconectar(:'org_a', 'google'), 'desconectar de novo não faz nada');
select teste.espera(
  (select count(*) from public.integracoes) = 0 and (select count(*) from public.integracao_vinculos) = 1,
  'as credenciais somem; os vínculos ficam');
reset role;

delete from public.oportunidades where id = :'op_a';
select teste.espera(
  (select count(*) from public.integracao_vinculos) = 0, 'apagar a oportunidade apaga os vínculos dela');
