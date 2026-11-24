-- Testes da etapa 5: triagem em lotes, oportunidades e decisão do cliente.
-- Roda depois dos anteriores: organização A (dono ...c1, membro ...c3, UFs PR/SC/RS) e B (dono ...c2).

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset
select id as seg_uro from public.segmentos where slug = 'urologia' \gset

-- Produtos: um da A e um da B.
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo)
values (:'org_a', 'T1', 'DJ', 'Cateter duplo J 6Fr x 26 cm', 150, 98) returning id as produto_a \gset
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo)
values (:'org_b', 'T1', 'DJ', 'Cateter duplo J 6Fr x 26 cm', 150, 98) returning id as produto_b \gset

-- Duas compras da saúde com disputa futura: uma em SC (estado da A) e uma em SP (fora).
set local role service_role;
select public.coletor_gravar_compra(
  format($${"controle_pncp":"82951229000176-1-000900/2026","orgao_cnpj":"82951229000176",
    "orgao_razao_social":"ESTADO DE SANTA CATARINA","ano":2026,"sequencial":900,"numero_compra":"900","uf":"SC",
    "municipio":"Florianópolis","modalidade_id":6,"modalidade_nome":"Pregão - Eletrônico",
    "objeto":"Aquisição de materiais de urologia","situacao_id":1,"data_disputa":"%s",
    "area_saude":true,"segmento_ids":["%s"]}$$, (now() + interval '10 days')::text, :'seg_uro')::jsonb,
  format($$[
    {"numero_item":1,"descricao":"CATETER DUPLO J 6FR X 26CM","quantidade":10,"unidade":"UN","valor_unitario_estimado":150,"valor_total":1500,"segmento_ids":["%s"]},
    {"numero_item":2,"descricao":"SERINGA 10 ML","quantidade":100,"unidade":"UN","valor_unitario_estimado":1,"valor_total":100,"segmento_ids":[]}
  ]$$, :'seg_uro')::jsonb, '[]'::jsonb);
select public.coletor_gravar_compra(
  format($${"controle_pncp":"46374500000194-1-000901/2026","orgao_cnpj":"46374500000194",
    "orgao_razao_social":"ESTADO DE SAO PAULO","ano":2026,"sequencial":901,"numero_compra":"901","uf":"SP",
    "municipio":"São Paulo","modalidade_id":6,"modalidade_nome":"Pregão - Eletrônico",
    "objeto":"Aquisição de cateteres","situacao_id":1,"data_disputa":"%s",
    "area_saude":true,"segmento_ids":["%s"]}$$, (now() + interval '10 days')::text, :'seg_uro')::jsonb,
  format($$[{"numero_item":1,"descricao":"CATETER DUPLO J 6FR X 26CM","quantidade":10,"unidade":"UN","valor_unitario_estimado":150,"valor_total":1500,"segmento_ids":["%s"]}]$$, :'seg_uro')::jsonb,
  '[]'::jsonb);
reset role;

select id as compra_sc from public.compras where controle_pncp = '82951229000176-1-000900/2026' \gset
select id as compra_sp from public.compras where controle_pncp = '46374500000194-1-000901/2026' \gset
select id as item_sc1 from public.compra_itens where compra_id = :'compra_sc' and numero_item = 1 \gset
select id as item_sc2 from public.compra_itens where compra_id = :'compra_sc' and numero_item = 2 \gset
select id as item_sp1 from public.compra_itens where compra_id = :'compra_sp' and numero_item = 1 \gset

-- A triagem só pega o que foi gravado há mais de 10 segundos: os testes voltam o relógio.
update public.compras set conteudo_alterado_em = now() - interval '5 minutes' where not exemplo;

-- ---------------------------------------------------------------------------
-- O que deixa a triagem desatualizada
-- ---------------------------------------------------------------------------
select triagem_config_em as antes from public.organizacoes where id = :'org_a' \gset
update public.organizacoes set razao_social = razao_social where id = :'org_a';
select teste.espera(
  (select triagem_config_em = :'antes' from public.organizacoes where id = :'org_a'),
  'mudar a razão social não mexe na triagem');
update public.produtos set lance_minimo = 99 where id = :'produto_a';
select teste.espera(
  (select triagem_config_em > :'antes' from public.organizacoes where id = :'org_a'),
  'mudar um produto deixa a triagem desatualizada');
select triagem_config_em as antes from public.organizacoes where id = :'org_a' \gset
insert into public.organizacao_exclusoes (org_id, termo) values (:'org_a', 'termo de teste');
select teste.espera(
  (select triagem_config_em > :'antes' from public.organizacoes where id = :'org_a'),
  'incluir uma exclusão deixa a triagem desatualizada');
delete from public.organizacao_exclusoes where org_id = :'org_a' and termo = 'termo de teste';
select triagem_config_em as antes from public.organizacoes where id = :'org_a' \gset
update public.organizacoes set score_compativel = 70 where id = :'org_a';
select teste.espera(
  (select triagem_config_em > :'antes' from public.organizacoes where id = :'org_a'),
  'mudar o limite do score deixa a triagem desatualizada');
select teste.espera(
  (select triagem_config_em from public.organizacoes where id = :'org_b')
    = (select triagem_config_em from public.organizacoes where id = :'org_b'),
  'a organização B não é afetada');
select teste.falha_com(
  format($$update public.organizacoes set score_verificar = 80, score_compativel = 60 where id = %L$$, :'org_a'),
  'organizacoes_scores_validos', 'o limite de "verificar" não pode passar o de "compatível"');

-- ---------------------------------------------------------------------------
-- Quem pode triar e ler
-- ---------------------------------------------------------------------------
set local role anon;
select teste.bloqueia('select 1 from public.oportunidades', 'visitante não lê oportunidades');
select teste.bloqueia('select 1 from public.oportunidades_lista', 'visitante não lê a lista de oportunidades');
select teste.bloqueia(format($$select public.triagem_lote(%L, 1)$$, :'org_a'), 'visitante não pede lote de triagem');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.falha_com(format($$select public.triagem_situacao(%L, 1)$$, :'org_a'), 'Sem permissão', 'B não consulta a triagem da A');
select teste.falha_com(format($$select public.triagem_lote(%L, 1)$$, :'org_a'), 'Sem permissão', 'B não pede lote da A');
select teste.falha_com(
  format($$select public.triagem_gravar(%L, now(), now(), '[]')$$, :'org_a'), 'Sem permissão', 'B não grava triagem da A');
select teste.bloqueia(
  format($$update public.organizacoes set score_compativel = 90 where id = %L$$, :'org_a'), 'B não muda os limites da A');
reset role;

-- ---------------------------------------------------------------------------
-- Um membro da A tria: situação, lote, gravação
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select teste.bloqueia(
  format($$update public.organizacoes set score_compativel = 90 where id = %L$$, :'org_a'),
  'membro que não é responsável não muda os limites');

select public.triagem_situacao(:'org_a', 1) as situacao \gset
select teste.espera((:'situacao'::jsonb ->> 'desatualizada')::boolean, 'triagem nunca feita aparece como desatualizada');
select teste.espera(
  (:'situacao'::jsonb ->> 'pendentes')::int = 2,
  'pendentes para a A: as duas compras de SC (a da saúde e a descartada dos testes anteriores); SP fica fora');

select public.triagem_lote(:'org_a', 1) as lote \gset
select teste.espera(jsonb_array_length(:'lote'::jsonb -> 'compras') = 2, 'o lote traz as compras de SC');
select c as lote_sc from jsonb_array_elements(:'lote'::jsonb -> 'compras') c where c ->> 'id' = :'compra_sc' \gset
select teste.espera(jsonb_array_length(:'lote_sc'::jsonb -> 'itens') = 2, 'a compra da saúde vem com os 2 itens');
select teste.espera(
  :'lote_sc'::jsonb #> '{itens,0,segmentos}' = jsonb_build_array(:'seg_uro'::text)
  and :'lote_sc'::jsonb #> '{itens,1,segmentos}' = '[]'::jsonb,
  'cada item vem com os segmentos com que casou');
select teste.espera(
  (select bool_and(jsonb_array_length(c -> 'itens') = 0)
   from jsonb_array_elements(:'lote'::jsonb -> 'compras') c where c ->> 'id' <> :'compra_sc'),
  'a compra fora da saúde vem sem itens (só para remover o que sobrou dela)');
select teste.espera((:'lote'::jsonb ->> 'restantes')::int = 0, 'não sobra nada para o próximo lote');
select :'lote'::jsonb ->> 'config_em' as config_em \gset
select :'lote'::jsonb ->> 'marca_ate' as marca_ate \gset
select teste.espera(
  (select triagem_feita_config_em = triagem_config_em and triagem_motor = 1 and triagem_marca is null
   from public.organizacoes where id = :'org_a'),
  'pedir o lote registra a configuração e o motor em uso');

-- Resultado com tentativas de trapaça: item de outra compra, produto de outra organização e
-- compra de outro estado. Só o que é legítimo entra.
select public.triagem_gravar(:'org_a', :'config_em', :'marca_ate', format($$[
  {"compra_id":"%s","prioridade":3,"score":95,"itens_compativeis":1,"itens_a_verificar":0,"itens_do_segmento":1,
   "segmento_ids":["%s"],"valor_estimado":1500,"alertas":[{"tipo":"amostra"}],
   "itens":[
     {"item_id":"%s","produto_id":"%s","nivel":"compativel","score":95,"detalhe":{"cobertura":1},"alertas":["exclusivo_me_epp"],"lote":"1"},
     {"item_id":"%s","produto_id":"%s","nivel":"compativel","score":90,"detalhe":{},"alertas":[],"lote":null},
     {"item_id":"%s","produto_id":"%s","nivel":"verificar","score":50,"detalhe":{},"alertas":[],"lote":null}
   ]},
  {"compra_id":"%s","prioridade":3,"score":95,"itens_compativeis":1,"itens_a_verificar":0,"itens_do_segmento":1,
   "segmento_ids":[],"valor_estimado":1500,"alertas":[],"itens":[]}
]$$, :'compra_sc', :'seg_uro', :'item_sc1', :'produto_a', :'item_sp1', :'produto_a', :'item_sc2', :'produto_b', :'compra_sp')::jsonb) as gravou \gset
select teste.espera(:'gravou'::jsonb = '{"ok":true,"gravadas":1,"removidas":0}', 'grava só a compra do estado da organização');
select id as op_sc from public.oportunidades where org_id = :'org_a' and compra_id = :'compra_sc' \gset
select teste.espera(
  (select status = 'nova' and prioridade = 3 and score = 95 and itens_compativeis = 1 and valor_estimado = 1500
     and alertas = '[{"tipo":"amostra"}]' and segmento_ids = array[:'seg_uro'::uuid]
   from public.oportunidades where id = :'op_sc'),
  'a oportunidade nasce como nova, com score, valor, segmentos e alertas');
select teste.espera(
  (select count(*) = 1 and bool_and(item_id = :'item_sc1' and produto_id = :'produto_a' and lote = '1' and alertas = '{exclusivo_me_epp}')
   from public.oportunidade_itens where oportunidade_id = :'op_sc'),
  'item de outra compra e produto de outra organização são ignorados');
select teste.espera((select count(*) from public.oportunidades) = 1, 'nada foi criado para a compra de SP');

select public.triagem_situacao(:'org_a', 1) as situacao \gset
select teste.espera(
  not (:'situacao'::jsonb ->> 'desatualizada')::boolean and (:'situacao'::jsonb ->> 'pendentes')::int = 0,
  'depois de gravar, a triagem está em dia');
select teste.espera(
  (:'situacao'::jsonb ->> 'triada_em') is not null, 'e registra quando foi feita');
select teste.espera(
  (select (public.triagem_situacao(:'org_a', 2) ->> 'desatualizada')::boolean),
  'motor de versão nova deixa a triagem desatualizada');

-- Leitura pelo membro e pela lista.
select teste.espera(
  (select orgao_nome = 'ESTADO DE SANTA CATARINA' and uf = 'SC' and total_itens = 2 and numero_compra = '900'
   from public.oportunidades_lista where id = :'op_sc'),
  'a lista junta a oportunidade com os dados da licitação');
select teste.bloqueia(
  format($$insert into public.oportunidades (org_id, compra_id, prioridade) values (%L, %L, 3)$$, :'org_a', :'compra_sp'),
  'cliente não cria oportunidade direto na tabela');
select teste.bloqueia($$update public.oportunidades set status = 'aprovada'$$, 'cliente não muda o status direto na tabela');
select teste.bloqueia($$delete from public.oportunidades$$, 'cliente não apaga oportunidade');
select teste.bloqueia($$delete from public.oportunidade_itens$$, 'cliente não apaga itens de oportunidade');

-- ---------------------------------------------------------------------------
-- Decisão
-- ---------------------------------------------------------------------------
select teste.falha_com(
  format($$select public.decidir_oportunidade(%L, 'descartada')$$, :'op_sc'), 'motivo', 'descartar exige motivo');
select teste.falha_com(
  format($$select public.decidir_oportunidade(%L, 'ganha')$$, :'op_sc'), 'aprovada', 'só aprovada vira ganha');
select public.decidir_oportunidade(:'op_sc', 'descartada', '  Fora da nossa região de entrega  ');
select teste.espera(
  (select status = 'descartada' and motivo_descarte = 'Fora da nossa região de entrega'
     and decidido_por = '00000000-0000-0000-0000-0000000000c3' and decidido_em is not null
   from public.oportunidades where id = :'op_sc'),
  'descartar grava o motivo, quem decidiu e quando');
select public.decidir_oportunidade(:'op_sc', 'aprovada');
select teste.espera(
  (select status = 'aprovada' and motivo_descarte is null from public.oportunidades where id = :'op_sc'),
  'aprovar limpa o motivo do descarte');
select teste.falha_com(
  format($$select public.decidir_oportunidade(%L, 'ganha')$$, :'op_sc'), 'ainda não aconteceu', 'ganha só depois da disputa');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.oportunidades) = 0, 'B não lê oportunidades da A');
select teste.espera((select count(*) from public.oportunidades_lista) = 0, 'nem pela lista');
select teste.espera((select count(*) from public.oportunidade_itens) = 0, 'nem os itens');
select teste.falha_com(
  format($$select public.decidir_oportunidade(%L, 'descartada', 'invasão')$$, :'op_sc'),
  'não encontrada', 'B não decide oportunidade da A');
reset role;

-- ---------------------------------------------------------------------------
-- Configuração muda no meio do caminho; compra muda depois de triada
-- ---------------------------------------------------------------------------
-- O cliente mexe no catálogo depois de pedir o lote: a gravação com a configuração antiga é recusada.
update public.produtos set lance_minimo = 100 where id = :'produto_a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select teste.espera(
  (select public.triagem_gravar(:'org_a', :'config_em', :'marca_ate', '[]') = '{"ok":false,"motivo":"config_mudou"}'),
  'gravação calculada com a configuração antiga é recusada');
select teste.espera(
  (select (public.triagem_situacao(:'org_a', 1) ->> 'desatualizada')::boolean),
  'e a triagem volta a ficar desatualizada');

-- Novo lote (recomeça do zero). Desta vez a compra não casa mais: a aprovada fica, sem itens.
select public.triagem_lote(:'org_a', 1) as lote \gset
select teste.espera(jsonb_array_length(:'lote'::jsonb -> 'compras') = 2, 'recomeçar traz as compras de novo');
select public.triagem_gravar(:'org_a', (:'lote'::jsonb ->> 'config_em')::timestamptz, (:'lote'::jsonb ->> 'marca_ate')::timestamptz,
  format($$[{"compra_id":"%s","prioridade":0,"score":0,"itens_compativeis":0,"itens_a_verificar":0,"itens_do_segmento":0,"segmento_ids":[],"valor_estimado":0,"alertas":[],"itens":[]}]$$, :'compra_sc')::jsonb);
select teste.espera(
  (select status = 'aprovada' and prioridade = 0 and itens_compativeis = 0 from public.oportunidades where id = :'op_sc'),
  'oportunidade já decidida não some quando deixa de casar');
select teste.espera(
  (select count(*) from public.oportunidade_itens where oportunidade_id = :'op_sc') = 0, 'mas fica sem itens');

-- Reaberta (nova) e sem casar: some.
select public.decidir_oportunidade(:'op_sc', 'nova');
select teste.espera(
  (select status = 'nova' and decidido_por is null and decidido_em is null from public.oportunidades where id = :'op_sc'),
  'reabrir limpa a decisão');
reset role;

-- O coletor altera a data da disputa: a compra volta a ficar pendente para a organização.
update public.compras set data_disputa = data_disputa + interval '1 day' where id = :'compra_sc';
update public.compras set conteudo_alterado_em = now() - interval '1 minute' where id = :'compra_sc';
update public.compras set verificado_em = now() where id = :'compra_sp';
select teste.espera(
  (select conteudo_alterado_em < now() - interval '4 minutes' from public.compras where id = :'compra_sp'),
  'conferência sem mudança não marca a compra como alterada');

-- O coletor (service role) também tria.
set local role service_role;
select public.triagem_lote(:'org_a', 1) as lote \gset
select teste.espera(
  jsonb_array_length(:'lote'::jsonb -> 'compras') = 1 and :'lote'::jsonb #>> '{compras,0,id}' = :'compra_sc',
  'compra alterada pelo coletor volta no lote, e o coletor pode triar');
select public.triagem_gravar(:'org_a', (:'lote'::jsonb ->> 'config_em')::timestamptz, (:'lote'::jsonb ->> 'marca_ate')::timestamptz,
  format($$[{"compra_id":"%s","prioridade":0,"score":0,"itens_compativeis":0,"itens_a_verificar":0,"itens_do_segmento":0,"segmento_ids":[],"valor_estimado":0,"alertas":[],"itens":[]}]$$, :'compra_sc')::jsonb) as gravou \gset
select teste.espera(:'gravou'::jsonb = '{"ok":true,"gravadas":0,"removidas":1}', 'oportunidade nova que deixou de casar é removida');
reset role;
select teste.espera((select count(*) from public.oportunidades) = 0, 'não sobrou oportunidade');

-- Estado removido: as oportunidades novas daquele estado saem ao recomeçar.
set local role service_role;
select public.triagem_gravar(:'org_a', (:'lote'::jsonb ->> 'config_em')::timestamptz, (:'lote'::jsonb ->> 'marca_ate')::timestamptz,
  format($$[{"compra_id":"%s","prioridade":1,"score":0,"itens_compativeis":0,"itens_a_verificar":0,"itens_do_segmento":1,"segmento_ids":["%s"],"valor_estimado":0,"alertas":[],"itens":[]}]$$, :'compra_sc', :'seg_uro')::jsonb);
reset role;
select teste.espera((select count(*) from public.oportunidades where org_id = :'org_a') = 1, 'oportunidade de SC recriada');
update public.organizacoes set ufs = '{PR,RS}' where id = :'org_a';
set local role service_role;
select public.triagem_lote(:'org_a', 1) as lote \gset
reset role;
select teste.espera(
  (select count(*) from public.oportunidades where org_id = :'org_a') = 0
  and jsonb_array_length(:'lote'::jsonb -> 'compras') = 0,
  'tirar SC dos estados remove as oportunidades novas de SC');
update public.organizacoes set ufs = '{PR,SC,RS}', score_compativel = 60 where id = :'org_a';

-- Excluir o produto apaga os itens de oportunidade que apontavam para ele.
set local role service_role;
select public.triagem_lote(:'org_a', 1) as lote \gset
select public.triagem_gravar(:'org_a', (:'lote'::jsonb ->> 'config_em')::timestamptz, (:'lote'::jsonb ->> 'marca_ate')::timestamptz,
  format($$[{"compra_id":"%s","prioridade":3,"score":90,"itens_compativeis":1,"itens_a_verificar":0,"itens_do_segmento":1,"segmento_ids":[],"valor_estimado":10,"alertas":[],
    "itens":[{"item_id":"%s","produto_id":"%s","nivel":"compativel","score":90,"detalhe":{},"alertas":[],"lote":null}]}]$$,
    :'compra_sc', :'item_sc1', :'produto_a')::jsonb);
reset role;
select teste.espera((select count(*) from public.oportunidade_itens) = 1, 'item de oportunidade gravado');
delete from public.produtos where id in (:'produto_a', :'produto_b');
select teste.espera((select count(*) from public.oportunidade_itens) = 0, 'excluir o produto remove o item de oportunidade');
delete from public.oportunidades where org_id = :'org_a';
