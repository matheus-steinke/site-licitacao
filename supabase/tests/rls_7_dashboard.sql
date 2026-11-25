-- Testes da etapa 7: a view do Dashboard (oportunidades aprovadas com o valor pelo lance mínimo).
-- Roda depois dos anteriores: organização A (dono ...c1, membro ...c3), B (dono ...c2) e as
-- compras da saúde de RO, SC e SP.

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset
select id as compra_sc from public.compras where controle_pncp = '82951229000176-1-000900/2026' \gset
select id as compra_sp from public.compras where controle_pncp = '46374500000194-1-000901/2026' \gset
select id as compra_ro from public.compras where controle_pncp = '04092680000171-1-000156/2026' \gset
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo)
values (:'org_a', 'D7', 'REF-D7', 'Cateter duplo J 6 Fr x 26 cm', 100, 50) returning id as produto \gset

-- A compra de SP vai ser disputada daqui a 5 dias e tem dois itens: 10 e 3 unidades.
update public.compras set data_disputa = now() + interval '5 days' where id = :'compra_sp';
update public.compra_itens set quantidade = 10 where compra_id = :'compra_sp' and numero_item = 1
returning id as item_sp1 \gset
insert into public.compra_itens (compra_id, numero_item, descricao, quantidade)
values (:'compra_sp', 2, 'CATETER DUPLO J 4,8FR X 26CM', 3) returning id as item_sp2 \gset

-- A: aprovada em SP (um item compatível e um a verificar), nova em RO e descartada em SC.
insert into public.oportunidades (org_id, compra_id, prioridade, status, itens_compativeis, itens_a_verificar)
values (:'org_a', :'compra_sp', 3, 'aprovada', 1, 1) returning id as op_sp \gset
insert into public.oportunidade_itens (oportunidade_id, org_id, item_id, produto_id, nivel, score)
values (:'op_sp', :'org_a', :'item_sp1', :'produto', 'compativel', 90),
       (:'op_sp', :'org_a', :'item_sp2', :'produto', 'verificar', 55);
insert into public.oportunidades (org_id, compra_id, prioridade, status)
values (:'org_a', :'compra_ro', 1, 'nova') returning id as op_ro \gset
insert into public.oportunidades (org_id, compra_id, prioridade, status, motivo_descarte)
values (:'org_a', :'compra_sc', 1, 'descartada', 'fora da linha');
-- B: aprovada na mesma compra de SP, sem item do catálogo.
insert into public.oportunidades (org_id, compra_id, prioridade, status)
values (:'org_b', :'compra_sp', 1, 'aprovada');

-- Quem não está logado não lê.
set local role anon;
select teste.bloqueia('select 1 from public.oportunidades_aprovadas', 'visitante não lê o Dashboard');
reset role;

-- Membro da A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.espera(
  (select count(*) from public.oportunidades_aprovadas) = 1
  and (select org_id = :'org_a' and compra_id = :'compra_sp' and status = 'aprovada' from public.oportunidades_aprovadas),
  'só entram as aprovadas da própria organização (nova e descartada ficam de fora)');
select teste.espera(
  (select valor_lance_minimo = 500 from public.oportunidades_aprovadas),
  'valor = quantidade x lance mínimo do item compatível (10 x 50); o item a verificar não entra');
select teste.espera(
  (select uf = 'SP' and data_disputa > now() and situacao_id = 1 and orgao_nome is not null and objeto <> ''
   from public.oportunidades_aprovadas),
  'a linha traz os dados da licitação: estado, data da disputa, situação, órgão e objeto');
reset role;

-- Dono da B só vê a dele, com valor zero.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera(
  (select count(*) from public.oportunidades_aprovadas) = 1
  and (select org_id = :'org_b' and valor_lance_minimo = 0 from public.oportunidades_aprovadas),
  'a outra organização só enxerga a própria aprovada, sem valor porque não tem item do catálogo');
reset role;

-- O valor acompanha a tabela de preços, e ganha/perdida também entram.
update public.produtos set lance_minimo = 60.5 where id = :'produto';
update public.oportunidades set status = 'perdida' where id = :'op_ro';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.espera(
  (select valor_lance_minimo = 605 from public.oportunidades_aprovadas where id = :'op_sp'),
  'mudou o lance mínimo do produto, mudou o valor (10 x 60,50)');
select teste.espera(
  (select count(*) from public.oportunidades_aprovadas) = 2
  and (select status = 'perdida' and valor_lance_minimo = 0 from public.oportunidades_aprovadas where id = :'op_ro'),
  'licitação marcada como perdida continua no Dashboard');
reset role;

delete from public.oportunidades where org_id in (:'org_a', :'org_b');
delete from public.produtos where id = :'produto';
