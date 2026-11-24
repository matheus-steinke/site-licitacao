-- Testes da etapa 6: texto de busca, busca de licitações com filtros e buscas salvas.
-- Roda depois dos anteriores: organização A (dono ...c1, UFs PR/SC/RS), B (dono ...c2) e as
-- compras da saúde de RO (rls_4), SC e SP (rls_5), todas com disputa futura.

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset
select id as seg_uro from public.segmentos where slug = 'urologia' \gset
select id as seg_lap from public.segmentos where slug = 'laparoscopia' \gset
select id as compra_sc from public.compras where controle_pncp = '82951229000176-1-000900/2026' \gset
select id as compra_sp from public.compras where controle_pncp = '46374500000194-1-000901/2026' \gset
select id as compra_ro from public.compras where controle_pncp = '04092680000171-1-000156/2026' \gset
select id as item_sc1 from public.compra_itens where compra_id = :'compra_sc' and numero_item = 1 \gset

-- Texto e consulta.
select teste.espera(privado.texto_de_busca('  Cânula  DUPLO-J 6Fr (estéril) ') = 'canula duplo j 6fr esteril', 'texto de busca: minúsculas, sem acento e sem pontuação');
select teste.espera(privado.consulta_de_busca('   ') is null and privado.consulta_de_busca(null) is null, 'busca vazia não vira consulta');
select teste.espera(
  privado.consulta_de_busca('de para com') is null
  and privado.consulta_de_busca('cateter de duplo j')::text = privado.consulta_de_busca('cateter duplo j')::text,
  'palavras de ligação não entram na consulta');
select teste.espera(
  privado.vetor_de_busca('CATETERES URETERAIS DUPLO J 6FR') @@ privado.consulta_de_busca('cateter duplo j'),
  'acha pelo começo da palavra: "cateter" acha "cateteres"');
select teste.espera(
  not (privado.vetor_de_busca('CATETER JELCO 22G') @@ privado.consulta_de_busca('cateter duplo j')),
  'todas as palavras precisam aparecer, e "j" não acha "jelco"');
select teste.espera(
  privado.vetor_de_busca('Cânula de fibra óptica') @@ privado.consulta_de_busca('CANULA optica'),
  'acento e maiúscula não importam');

-- Quem não está logado não busca.
set local role anon;
select teste.bloqueia(format($$select public.buscar_licitacoes(%L, 'cateter')$$, :'org_a'), 'visitante não busca licitações');
select teste.bloqueia('select 1 from public.buscas_salvas', 'visitante não lê buscas salvas');
reset role;

-- Uma oportunidade da A na compra de SC, com item do catálogo, para o filtro "só catálogo".
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo, marca)
values (:'org_a', 'B1', 'REF-ÓPTICA', 'Cânula de fibra óptica 272 µm', 100, 50, 'Dornier') returning id as produto \gset
select teste.espera(
  (select busca = 'b1 ref optica canula de fibra optica 272 m dornier' from public.produtos where id = :'produto'),
  'o produto guarda o texto de busca sem acento');
insert into public.oportunidades (org_id, compra_id, prioridade, score, itens_compativeis, itens_do_segmento, itens_por_segmento)
values (:'org_a', :'compra_sc', 3, 90, 1, 1, jsonb_build_object(:'seg_uro'::text, 1)) returning id as op_sc \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';

-- Palavra-chave nos itens.
select public.buscar_licitacoes(:'org_a', 'CATÉTER duplo') as r \gset
select teste.espera((:'r'::jsonb ->> 'total')::int = 2, 'palavra-chave nos itens: acha as duas compras com cateter duplo J (SC e SP)');
select l as linha_sc from jsonb_array_elements(:'r'::jsonb -> 'linhas') l where l ->> 'id' = :'compra_sc' \gset
select teste.espera(
  (:'linha_sc'::jsonb ->> 'itens_com_termo')::int = 1
  and :'linha_sc'::jsonb #>> '{amostra,0}' = 'CATETER DUPLO J 6FR X 26CM'
  and not (:'linha_sc'::jsonb ->> 'termo_no_objeto')::boolean
  and (:'linha_sc'::jsonb ->> 'total_itens')::int = 2
  and :'linha_sc'::jsonb ->> 'orgao_nome' = 'ESTADO DE SANTA CATARINA',
  'a linha traz quantos itens têm o termo, uma amostra, o total de itens e o órgão');
select teste.espera(
  :'linha_sc'::jsonb #>> '{oportunidade,id}' = :'op_sc' and (:'linha_sc'::jsonb #>> '{oportunidade,itens_compativeis}')::int = 1,
  'e a oportunidade da própria organização, quando existe');

-- Palavra-chave no objeto.
select public.buscar_licitacoes(:'org_a', 'urologia') as r \gset
select teste.espera(
  (:'r'::jsonb ->> 'total')::int = 1
  and :'r'::jsonb #>> '{linhas,0,id}' = :'compra_sc'
  and (:'r'::jsonb #>> '{linhas,0,termo_no_objeto}')::boolean
  and (:'r'::jsonb #>> '{linhas,0,itens_com_termo}')::int = 0,
  'palavra-chave no objeto: acha a compra mesmo sem item com o termo');
select teste.espera((public.buscar_licitacoes(:'org_a', 'palavrainexistente') ->> 'total')::int = 0, 'termo que não existe não acha nada');
select teste.espera(
  (select r ->> 'total' = '1' and r #>> '{linhas,0,id}' = :'compra_ro' from public.buscar_licitacoes(:'org_a', 'trocarte 10') r),
  'duas palavras no mesmo item (trocarte 10 mm, na compra de RO)');
select teste.espera((public.buscar_licitacoes(:'org_a', 'trocarte seringa') ->> 'total')::int = 0, 'palavras em itens diferentes não contam');

-- Sem palavra-chave: só as compras da saúde (a descartada de SC, dos testes do coletor, não aparece).
select public.buscar_licitacoes(:'org_a') as r \gset
select teste.espera((:'r'::jsonb ->> 'total')::int = 3, 'sem palavra-chave, lista as compras da saúde');
select teste.espera(
  not exists (select 1 from jsonb_array_elements(:'r'::jsonb -> 'linhas') l where l ->> 'controle_pncp' = '01599409000139-1-000031/2026'),
  'compra fora da área da saúde nunca aparece');

-- Filtros.
select teste.espera(
  (select r ->> 'total' = '1' and r #>> '{linhas,0,id}' = :'compra_sp' from public.buscar_licitacoes(:'org_a', 'cateter', array['SP']) r),
  'filtro por estado');
select teste.espera(
  (public.buscar_licitacoes(:'org_a', null, array['SC', 'SP', 'RO'], array[:'seg_lap'::uuid]) ->> 'total')::int = 1,
  'filtro por segmento (só a compra de RO tem laparoscopia)');
select teste.espera(
  (public.buscar_licitacoes(:'org_a', null, null, null, now() + interval '60 days') ->> 'total')::int = 0
  and (public.buscar_licitacoes(:'org_a', null, null, null, null, now() + interval '60 days') ->> 'total')::int = 3
  and (public.buscar_licitacoes(:'org_a', null, null, null, null, now() - interval '1 day') ->> 'total')::int = 0,
  'filtro por período da disputa');
select teste.espera(
  (public.buscar_licitacoes(:'org_a', null, null, null, null, null, array[8]) ->> 'total')::int = 0
  and (public.buscar_licitacoes(:'org_a', null, null, null, null, null, array[6, 8]) ->> 'total')::int = 3,
  'filtro por modalidade');
select teste.espera(
  (public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, array[9]) ->> 'total')::int = 0
  and (public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, array[1]) ->> 'total')::int
      = (select count(*) from public.compras where area_saude and not exemplo and situacao_id = 1)
  and (public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, array[1]) ->> 'total')::int
      + (public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, array[2, 3, 4]) ->> 'total')::int = 3,
  'filtro por situação');
select teste.espera(
  (select r ->> 'total' = '1' and r #>> '{linhas,0,id}' = :'compra_sc'
   from public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, null, true) r),
  'só com itens do meu catálogo');

-- Paginação.
select public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, null, false, 2, 0) as p1 \gset
select public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, null, false, 2, 2) as p2 \gset
select teste.espera(
  jsonb_array_length(:'p1'::jsonb -> 'linhas') = 2 and jsonb_array_length(:'p2'::jsonb -> 'linhas') = 1
  and (:'p1'::jsonb ->> 'total')::int = 3 and (:'p2'::jsonb ->> 'total')::int = 3
  and not (:'p1'::jsonb -> 'linhas') @> jsonb_build_array(jsonb_build_object('id', :'p2'::jsonb #>> '{linhas,0,id}')),
  'paginação: 2 + 1, sem repetir, com o total em todas as páginas');
select teste.espera(
  (:'p1'::jsonb #>> '{linhas,0,data_disputa}')::timestamptz <= (:'p1'::jsonb #>> '{linhas,1,data_disputa}')::timestamptz,
  'disputas futuras vêm da mais próxima para a mais distante');

-- Buscas salvas.
insert into public.buscas_salvas (org_id, nome, filtros) values (:'org_a', 'Duplo J no Sul', '{"q":"duplo j","ufs":["PR","SC","RS"]}');
select teste.espera(
  (select criado_por = '00000000-0000-0000-0000-0000000000c3' from public.buscas_salvas where nome = 'Duplo J no Sul'),
  'membro salva uma busca, e fica registrado quem salvou');
select teste.falha_com(
  format($$insert into public.buscas_salvas (org_id, nome, filtros) values (%L, 'Duplo J no Sul', '{}')$$, :'org_a'),
  'buscas_salvas_org_id_nome_key', 'nome de busca salva não se repete na organização');
select teste.falha_com(
  format($$insert into public.buscas_salvas (org_id, nome, filtros) values (%L, 'Lista', '[]')$$, :'org_a'),
  'buscas_salvas_filtros_check', 'os filtros precisam ser um objeto');
select teste.bloqueia($$update public.buscas_salvas set nome = 'Outro'$$, 'busca salva não é editada (exclui e salva de novo)');
select teste.bloqueia(
  format($$insert into public.buscas_salvas (org_id, nome, filtros) values (%L, 'Invasão', '{}')$$, :'org_b'),
  'membro da A não salva busca na B');
reset role;

-- A organização B não vê nada da A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.buscas_salvas) = 0, 'B não lê buscas salvas da A');
select teste.bloqueia($$delete from public.buscas_salvas$$, 'B não exclui buscas salvas da A');
select public.buscar_licitacoes(:'org_a', 'cateter duplo', array['SC']) as r \gset
select teste.espera(
  (:'r'::jsonb ->> 'total')::int = 1 and :'r'::jsonb #> '{linhas,0,oportunidade}' = 'null',
  'B busca as mesmas licitações, mas não enxerga a oportunidade da A (nem passando o id da A)');
select teste.espera(
  (public.buscar_licitacoes(:'org_a', null, null, null, null, null, null, null, true) ->> 'total')::int = 0,
  'nem pelo filtro "só catálogo"');
reset role;

-- O dono da A exclui a busca salva.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
delete from public.buscas_salvas where nome = 'Duplo J no Sul';
select teste.espera((select count(*) from public.buscas_salvas) = 0, 'membro da mesma organização exclui a busca salva');
reset role;

delete from public.oportunidades where id = :'op_sc';
delete from public.produtos where id = :'produto';
