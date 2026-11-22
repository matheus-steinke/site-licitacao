-- Testes da etapa 4: gravação de compras pelo coletor e visibilidade.
-- Roda depois dos anteriores (admin ...0a, cliente ...0b, dono A ...c1).

select id as seg_uro from public.segmentos where slug = 'urologia' \gset
select id as seg_lap from public.segmentos where slug = 'laparoscopia' \gset

-- Cliente e admin não gravam compras nem leem o log do coletor.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.bloqueia(
  $$select public.coletor_gravar_compra('{"controle_pncp":"x"}'::jsonb)$$,
  'cliente não chama a gravação do coletor');
select teste.espera((select count(*) from public.coletor_rodadas) = 0, 'cliente não lê rodadas do coletor');
select teste.bloqueia($$insert into public.coletor_rodadas default values$$, 'cliente não cria rodada');
reset role;

-- O coletor (service role) grava.
set local role service_role;
insert into public.coletor_rodadas (origem, fonte) values ('manual', 'busca') returning id as rodada \gset
insert into public.coletor_erros (rodada_id, etapa, url, status_http, mensagem)
values (:'rodada', 'itens', 'https://pncp.gov.br/x', 503, 'Service Unavailable');

-- 1) Compra encontrada na busca, itens ainda não baixados (API de itens fora do ar).
select public.coletor_gravar_compra($${
  "controle_pncp":"04092680000171-1-000156/2026","orgao_cnpj":"04092680000171",
  "orgao_razao_social":"MUNICIPIO DE PIMENTA BUENO","orgao_esfera":"Municipal","orgao_poder":"Não se aplica",
  "ano":2026,"sequencial":156,"numero_compra":"98","uf":"RO","municipio":"Pimenta Bueno",
  "modalidade_id":6,"modalidade_nome":"Pregão - Eletrônico","modo_disputa":"Aberto",
  "objeto":"Registro de Preços para Aquisição de Cânulas e Cateteres","situacao_id":1,
  "data_disputa":"2026-12-03T10:00:00-03:00","valor_total_estimado":78619.91,"srp":true,
  "falha_itens":true
}$$::jsonb) as r1 \gset
select teste.espera(:'r1'::jsonb ->> 'resultado' = 'nova', 'compra nova é gravada sem itens');
select teste.espera(
  (select area_saude is null and tentativas_itens = 1 and itens_coletados_em is null
   from public.compras where controle_pncp = '04092680000171-1-000156/2026'),
  'sem itens, a compra fica pendente (area_saude nula) e conta a tentativa');

-- 2) Itens chegam: dois casam com segmentos, um não.
select public.coletor_gravar_compra(
  format($${"controle_pncp":"04092680000171-1-000156/2026","orgao_cnpj":"04092680000171",
    "orgao_razao_social":"MUNICIPIO DE PIMENTA BUENO","situacao_id":1,
    "data_disputa":"2026-12-03T10:00:00-03:00","area_saude":true,"segmento_ids":["%s","%s"]}$$, :'seg_uro', :'seg_lap')::jsonb,
  format($$[
    {"numero_item":1,"descricao":"CATETER DUPLO J 6FR","quantidade":10,"unidade":"UN","valor_unitario_estimado":150,"valor_total":1500,"tipo_beneficio_id":1,"exclusivo_me_epp":true,"segmento_ids":["%s"]},
    {"numero_item":2,"descricao":"TROCARTE 5 MM","quantidade":5,"unidade":"UN","valor_unitario_estimado":100,"valor_total":500,"grupo":"1","segmento_ids":["%s","%s"]},
    {"numero_item":3,"descricao":"CANETA ESFEROGRÁFICA","quantidade":100,"unidade":"UN","valor_unitario_estimado":1,"valor_total":100,"segmento_ids":[]}
  ]$$, :'seg_uro', :'seg_lap', :'seg_uro')::jsonb,
  $$[{"sequencial_documento":1,"titulo":"Edital","tipo_documento":"Edital","url":"https://pncp.gov.br/pncp-api/v1/orgaos/04092680000171/compras/2026/156/arquivos/1","publicado_em":"2026-11-18T14:21:56-03:00"}]$$::jsonb
) as r2 \gset
select teste.espera(:'r2'::jsonb ->> 'resultado' = 'atualizada', 'chegada dos itens conta como atualização');
select id as compra from public.compras where controle_pncp = '04092680000171-1-000156/2026' \gset
select teste.espera(
  (select area_saude and cardinality(segmento_ids) = 2 and itens_coletados_em is not null
   from public.compras where id = :'compra'),
  'com itens, a compra é marcada como área da saúde, com os segmentos');
select teste.espera((select count(*) from public.compra_itens where compra_id = :'compra') = 3, 'os 3 itens são gravados');
select teste.espera(
  (select count(*) from public.compra_item_segmentos s join public.compra_itens i on i.id = s.item_id where i.compra_id = :'compra') = 3,
  'segmentos por item: 1 + 2 + 0');
select teste.espera(
  (select exclusivo_me_epp from public.compra_itens where compra_id = :'compra' and numero_item = 1),
  'item exclusivo ME/EPP é marcado');
select id as item2 from public.compra_itens where compra_id = :'compra' and numero_item = 2 \gset

-- 3) Mesma coisa de novo: nada muda.
select public.coletor_gravar_compra($${"controle_pncp":"04092680000171-1-000156/2026","orgao_cnpj":"04092680000171",
  "orgao_razao_social":"MUNICIPIO DE PIMENTA BUENO","situacao_id":1,"data_disputa":"2026-12-03T10:00:00-03:00"}$$::jsonb) as r3 \gset
select teste.espera(:'r3'::jsonb = jsonb_build_object('id', :'compra'::uuid, 'resultado', 'igual', 'alteracoes', 0), 'regravar igual não gera alteração');
select teste.espera(
  (select objeto like 'Registro de Preços%' and uf = 'RO' and area_saude from public.compras where id = :'compra'),
  'campos ausentes no JSON não apagam o que já existe');

-- 4) Adiada e suspensa: gera histórico.
select public.coletor_gravar_compra($${"controle_pncp":"04092680000171-1-000156/2026","orgao_cnpj":"04092680000171",
  "orgao_razao_social":"MUNICIPIO DE PIMENTA BUENO","situacao_id":4,"data_disputa":"2026-12-10T09:00:00-03:00"}$$::jsonb) as r4 \gset
select teste.espera((:'r4'::jsonb ->> 'alteracoes')::int = 2 and :'r4'::jsonb ->> 'resultado' = 'atualizada', 'mudança de data e de situação gera 2 alterações');
select teste.espera(
  (select string_agg(campo || ':' || valor_anterior || '>' || valor_novo, ' | ' order by campo)
   from public.compra_alteracoes where compra_id = :'compra' and campo = 'situacao_id') = 'situacao_id:1>4',
  'histórico guarda a situação anterior e a nova');
select teste.espera(
  (select situacao_id = 4 and data_disputa = '2026-12-10T09:00:00-03:00'::timestamptz from public.compras where id = :'compra'),
  'compra fica com a situação e a data novas');

-- 5) Retificação dos itens: item 3 some, item 2 muda; o id do item 2 é preservado.
select public.coletor_gravar_compra(
  format($${"controle_pncp":"04092680000171-1-000156/2026","orgao_cnpj":"04092680000171",
    "orgao_razao_social":"MUNICIPIO DE PIMENTA BUENO","area_saude":true,"segmento_ids":["%s"]}$$, :'seg_lap')::jsonb,
  format($$[{"numero_item":2,"descricao":"TROCARTE 10 MM","quantidade":8,"unidade":"UN","segmento_ids":["%s"]}]$$, :'seg_lap')::jsonb,
  '[]'::jsonb
);
select teste.espera((select count(*) from public.compra_itens where compra_id = :'compra') = 1, 'itens que saíram do PNCP são removidos');
select teste.espera(
  (select id = :'item2' and descricao = 'TROCARTE 10 MM' and quantidade = 8 from public.compra_itens where compra_id = :'compra'),
  'item que continua é atualizado no lugar (mesmo id)');
select teste.espera((select count(*) from public.compra_arquivos where compra_id = :'compra') = 0, 'lista de arquivos vazia remove os arquivos');
select teste.espera((select situacao_id = 4 from public.compras where id = :'compra'), 'situação ausente no JSON é mantida');

-- 6) Compra fora da saúde: gravada com area_saude = false.
select public.coletor_gravar_compra($${
  "controle_pncp":"01599409000139-1-000031/2026","orgao_cnpj":"01599409000139","orgao_razao_social":"MUNICIPIO DE CAPAO ALTO",
  "ano":2026,"sequencial":31,"uf":"SC","modalidade_id":6,"modalidade_nome":"Pregão - Eletrônico",
  "objeto":"Sementes e fertilizantes","situacao_id":1,"data_disputa":"2026-12-01T09:00:00-03:00","area_saude":false,"segmento_ids":[]
}$$::jsonb, '[]'::jsonb, null);
update public.coletor_rodadas set status = 'parcial', finalizado_em = now(), erros = 1 where id = :'rodada';
reset role;

-- Cliente vê só a compra da saúde; admin vê todas e lê o log.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.espera((select count(*) from public.compras where not exemplo) = 1, 'cliente só vê compras da área da saúde');
select teste.espera((select count(*) from public.compras where exemplo) = 9, 'cliente continua vendo as compras de exemplo');
select teste.espera((select count(*) from public.compra_alteracoes) = 2, 'cliente lê o histórico de alterações');
select teste.espera((select count(*) from public.compra_item_segmentos) = 1, 'cliente lê os segmentos dos itens');
select teste.bloqueia($$delete from public.compra_alteracoes$$, 'cliente não apaga histórico');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select teste.espera((select count(*) from public.compras where not exemplo) = 2, 'admin vê também as compras descartadas');
select teste.espera((select count(*) from public.coletor_rodadas) = 1 and (select count(*) from public.coletor_erros) = 1, 'admin lê rodadas e erros');
select teste.bloqueia($$update public.coletor_rodadas set status = 'sucesso'$$, 'admin não altera rodadas');
reset role;

-- Ajuste do seed: sinônimos genéricos saíram, os específicos ficaram.
select teste.espera(
  not exists (select 1 from public.segmentos where sinonimos && array['trocar', 'material de consumo', 'age', 'laboratório']),
  'sinônimos genéricos foram removidos do seed');
select teste.espera(
  (select sinonimos @> array['duplo jota', 'pigtail', 'holmium'] from public.segmentos where slug = 'urologia'),
  'sinônimos específicos continuam');
