-- Testes de RLS da etapa 2: isolamento entre organizações, papéis e convites.
-- Roda depois de rls_base.sql (usa o admin ...0a e o cliente sem empresa ...0b).

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'dono-a@exemplo.test', now(), '{"nome":"Dono A"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'dono-b@exemplo.test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'colega@exemplo.test', now(), '{"nome":"Colega"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'nao-confirmado@exemplo.test', null, '{}');

-- Visitante não cria organização nem lê nada.
set local role anon;
select teste.bloqueia(
  $$select public.criar_organizacao('Invasora', '11222333000181', 'demais')$$,
  'visitante não cria organização');
select teste.bloqueia('select 1 from public.organizacoes', 'visitante não lê organizações');
select teste.bloqueia('select 1 from public.membros', 'visitante não lê membros');
reset role;

-- Dono A cria a organização A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select public.criar_organizacao('  Distribuidora A Ltda  ', '11222333000181', 'me_epp') as org_a \gset
select teste.espera(privado.eh_dono(:'org_a'), 'quem cria a organização vira dono');
select teste.espera(
  (select razao_social from public.organizacoes where id = :'org_a') = 'Distribuidora A Ltda',
  'razão social é gravada sem espaços nas pontas');
select teste.espera(
  (select nome || '|' || email from public.membros where org_id = :'org_a') = 'Dono A|dono-a@exemplo.test',
  'membro guarda nome e e-mail do usuário');
select teste.falha_com(
  $$select public.criar_organizacao('Outra', '11444777000161', 'demais')$$,
  'JA_TEM_ORGANIZACAO', 'usuário não cria uma segunda organização');
select teste.bloqueia(
  $$insert into public.organizacoes (razao_social, cnpj, porte) values ('Direta', '11444777000161', 'demais')$$,
  'ninguém insere organização direto na tabela');
reset role;

-- Dono B: CNPJ repetido é recusado; com outro CNPJ, cria a organização B.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.falha_com(
  $$select public.criar_organizacao('Copia', '11222333000181', 'demais')$$,
  'CNPJ_JA_CADASTRADO', 'CNPJ já cadastrado é recusado');
select teste.falha_com(
  $$select public.criar_organizacao('Formato', '11.222.333/0001-81', 'demais')$$,
  'check', 'CNPJ fora do formato é recusado');
select public.criar_organizacao('Distribuidora B S.A.', '12ABC34501DE35', 'demais') as org_b \gset
select teste.espera((select count(*) from public.organizacoes) = 1, 'dono B só enxerga a própria organização');
select teste.espera((select count(*) from public.membros) = 1, 'dono B só enxerga os próprios membros');
select teste.bloqueia(
  format($$update public.organizacoes set razao_social = 'Invadida' where id = %L$$, :'org_a'),
  'dono B não altera a organização A');
select teste.bloqueia(
  format($$insert into public.membros (org_id, user_id, email) values (%L, '00000000-0000-0000-0000-0000000000c2', 'x@x.test')$$, :'org_a'),
  'dono B não se inclui na organização A');
select teste.falha_com(
  format($$insert into public.convites (org_id, email, convidado_por) values (%L, 'espiao@exemplo.test', '00000000-0000-0000-0000-0000000000c2')$$, :'org_a'),
  'row-level security', 'dono B não convida para a organização A');
reset role;

-- Dono A altera os próprios dados, mas não o plano.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
update public.organizacoes set ufs = '{PR,SC,RS}', porte = 'demais' where id = :'org_a';
select teste.espera(
  (select ufs from public.organizacoes where id = :'org_a') = '{PR,SC,RS}',
  'dono altera UFs e porte');
select teste.bloqueia(
  format($$update public.organizacoes set plano = 'premium' where id = %L$$, :'org_a'),
  'dono não altera o próprio plano');
select teste.falha_com(
  format($$update public.organizacoes set ufs = '{PR,XX}' where id = %L$$, :'org_a'),
  'check', 'UF inexistente é recusada');

-- Segmentos de interesse.
select public.definir_segmentos_organizacao(
  :'org_a',
  array(select id from public.segmentos where slug in ('urologia', 'laparoscopia')));
select teste.espera(
  (select count(*) from public.organizacao_segmentos where org_id = :'org_a') = 2,
  'dono define dois segmentos');
select public.definir_segmentos_organizacao(
  :'org_a', array(select id from public.segmentos where slug = 'urologia'));
select teste.espera(
  (select count(*) from public.organizacao_segmentos where org_id = :'org_a') = 1,
  'definir de novo substitui a lista');

-- Convites.
insert into public.convites (org_id, email, convidado_por) values
  (:'org_a', 'colega@exemplo.test', '00000000-0000-0000-0000-0000000000c1'),
  (:'org_a', 'nao-confirmado@exemplo.test', '00000000-0000-0000-0000-0000000000c1');
select id as convite_colega from public.convites where email = 'colega@exemplo.test' \gset
select id as convite_nao_confirmado from public.convites where email = 'nao-confirmado@exemplo.test' \gset
select teste.falha_com(
  format($$insert into public.convites (org_id, email, convidado_por) values (%L, 'Maiusculo@Exemplo.test', '00000000-0000-0000-0000-0000000000c1')$$, :'org_a'),
  'check', 'e-mail do convite precisa estar em minúsculas');
select teste.bloqueia(
  format($$delete from public.membros where org_id = %L and user_id = '00000000-0000-0000-0000-0000000000c1'$$, :'org_a'),
  'dono não remove a si mesmo');
reset role;

-- Dono B não vê nem aceita o convite da organização A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.convites) = 0, 'dono B não vê convites da organização A');
select teste.espera((select count(*) from public.meus_convites()) = 0, 'dono B não tem convites pendentes');
select teste.espera(
  (select count(*) from public.organizacao_segmentos) = 0,
  'dono B não vê os segmentos da organização A');
reset role;

-- Cliente sem empresa e sem convite: tentar aceitar o convite de outro e-mail falha.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.espera((select count(*) from public.organizacoes) = 0, 'usuário sem empresa não vê organizações');
select teste.falha_com(
  format($$select public.aceitar_convite(%L)$$, :'convite_colega'),
  'CONVITE_INVALIDO', 'convite só vale para o e-mail convidado');
reset role;

-- E-mail não confirmado não aceita convite.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c4"}';
select teste.espera((select count(*) from public.meus_convites()) = 0, 'e-mail não confirmado não lista convites');
select teste.falha_com(
  format($$select public.aceitar_convite(%L)$$, :'convite_nao_confirmado'),
  'EMAIL_NAO_CONFIRMADO', 'e-mail não confirmado não aceita convite');
reset role;

-- A colega convidada aceita e vira membro (sem poderes de dono).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.espera(
  (select organizacao from public.meus_convites()) = 'Distribuidora A Ltda',
  'convidada vê o convite pendente com o nome da empresa');
select public.aceitar_convite(:'convite_colega');
select teste.espera(privado.eh_membro(:'org_a') and not privado.eh_dono(:'org_a'), 'convidada vira membro, não dona');
select teste.espera((select count(*) from public.membros) = 2, 'membro vê os colegas da organização');
select teste.espera((select count(*) from public.meus_convites()) = 0, 'convite aceito some da lista');
select teste.falha_com(
  format($$select public.aceitar_convite(%L)$$, :'convite_colega'),
  'JA_TEM_ORGANIZACAO', 'convite não é aceito duas vezes');
select teste.bloqueia(
  format($$update public.organizacoes set razao_social = 'Do membro' where id = %L$$, :'org_a'),
  'membro não altera a organização');
select teste.falha_com(
  format($$select public.definir_segmentos_organizacao(%L, '{}')$$, :'org_a'),
  'SEM_PERMISSAO', 'membro não altera os segmentos');
select teste.falha_com(
  format($$insert into public.convites (org_id, email, convidado_por) values (%L, 'amigo@exemplo.test', '00000000-0000-0000-0000-0000000000c3')$$, :'org_a'),
  'row-level security', 'membro não convida');
select teste.bloqueia(
  format($$delete from public.membros where org_id = %L$$, :'org_a'),
  'membro não remove ninguém');
reset role;

-- Admin da plataforma vê todas as organizações, mas não as altera.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select teste.espera((select count(*) from public.organizacoes) = 2, 'admin vê todas as organizações');
select teste.espera((select count(*) from public.membros) = 3, 'admin vê os membros de todas');
select teste.bloqueia(
  $$update public.organizacoes set razao_social = 'Do admin'$$,
  'admin não altera organizações pelo app');
select teste.falha_com(
  $$delete from public.segmentos where slug = 'urologia'$$,
  'foreign key', 'segmento em uso por uma organização não é excluído');
reset role;

-- Dono A remove a colega.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
delete from public.membros where org_id = :'org_a' and user_id = '00000000-0000-0000-0000-0000000000c3';
select teste.espera((select count(*) from public.membros) = 1, 'dono remove outro membro');
reset role;
