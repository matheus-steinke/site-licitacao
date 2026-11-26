-- Testes da etapa 10: leitura dos editais (tabela global compra_editais e funções do coletor).
-- Roda depois dos anteriores; cria a própria licitação, com disputa daqui a 10 dias.

select id as seg_uro from public.segmentos where slug = 'urologia' \gset
select id as org from public.organizacoes order by criado_em limit 1 \gset

select teste.espera(
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'compras' and column_name = 'texto_edital'),
  'o texto inteiro do edital não é guardado: a coluna saiu');

set local role service_role;
select public.coletor_gravar_compra(
  format($${"controle_pncp":"11111111000191-1-000010/2026","orgao_cnpj":"11111111000191",
    "orgao_razao_social":"HOSPITAL DE TESTE","orgao_esfera":"Municipal","orgao_poder":"Executivo",
    "ano":2026,"sequencial":10,"numero_compra":"10","uf":"SC","municipio":"Joinville",
    "modalidade_id":6,"modalidade_nome":"Pregão - Eletrônico","objeto":"Aquisição de cateteres",
    "situacao_id":1,"data_disputa":"%s","area_saude":true,"segmento_ids":["%s"]}$$,
    to_char(now() + interval '10 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'), :'seg_uro')::jsonb,
  format($$[{"numero_item":1,"descricao":"CATETER DUPLO J 6FR","quantidade":10,"unidade":"UN","valor_unitario_estimado":150,"valor_total":1500,"segmento_ids":["%s"]}]$$, :'seg_uro')::jsonb,
  $$[{"sequencial_documento":1,"titulo":"Edital PE 10","tipo_documento":"Edital","url":"https://pncp.gov.br/pncp-api/v1/orgaos/11111111000191/compras/2026/10/arquivos/1","publicado_em":"2026-11-18T14:21:56-03:00"},
     {"sequencial_documento":2,"titulo":"TR","tipo_documento":"Termo de Referência","url":"https://pncp.gov.br/pncp-api/v1/orgaos/11111111000191/compras/2026/10/arquivos/2","publicado_em":"2026-11-18T14:22:10-03:00"}]$$::jsonb
);
reset role;
select id as compra from public.compras where controle_pncp = '11111111000191-1-000010/2026' \gset

-- Quem não é o coletor não chama as funções nem grava na tabela.
set local role anon;
select teste.bloqueia($$select public.coletor_editais_pendentes(1, 10)$$, 'visitante não lista editais pendentes');
select teste.bloqueia($$select count(*) from public.compra_editais$$, 'visitante não lê a leitura dos editais');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.bloqueia($$select public.coletor_editais_pendentes(1, 10)$$, 'cliente não lista editais pendentes');
select teste.bloqueia(
  format($$select public.coletor_gravar_edital(%L, 'lido', '[]', '[]', 'x', 1, 1, 1)$$, :'compra'),
  'cliente não grava leitura de edital');
select teste.bloqueia(
  format($$insert into public.compra_editais (compra_id, status, assinatura, versao) values (%L, 'lido', 'x', 1)$$, :'compra'),
  'cliente não insere leitura de edital');
reset role;

-- O coletor vê a licitação como pendente, com os dois arquivos.
set local role service_role;
select public.coletor_editais_pendentes(1, 500) as pend \gset
select teste.espera((:'pend'::jsonb ->> 'restantes')::int >= 1, 'há edital pendente de leitura');
select c as minha from jsonb_array_elements(:'pend'::jsonb -> 'compras') c where c ->> 'compra_id' = :'compra' \gset
select teste.espera(
  jsonb_array_length(:'minha'::jsonb -> 'arquivos') = 2
  and :'minha'::jsonb -> 'arquivos' -> 0 ->> 'tipo' = 'Edital'
  and :'minha'::jsonb -> 'arquivos' -> 1 ->> 'url' like '%/arquivos/2'
  and length(:'minha'::jsonb ->> 'assinatura') = 32,
  'a pendência traz os arquivos em ordem e a assinatura da lista');
select :'minha'::jsonb ->> 'assinatura' as assinatura \gset

select teste.falha_com(
  format($$select public.coletor_gravar_edital(%L, 'talvez', '[]', '[]', 'x', 1, 1, 1)$$, :'compra'),
  'compra_editais_status_check', 'status desconhecido é recusado');

select public.coletor_gravar_edital(
  :'compra', 'lido',
  '[{"tipo":"amostra","nivel":"exige"},{"tipo":"comodato","nivel":"cita"}]',
  '[{"tipo":"amostra","texto":"…será exigida apresentação de amostras…","arquivo":"TR"}]',
  :'assinatura', 1, 2, 2);
select teste.espera(
  (select status = 'lido' and tentativas = 0 and erro is null and arquivos_lidos = 2 and jsonb_array_length(alertas) = 2
   from public.compra_editais where compra_id = :'compra'),
  'a leitura é gravada');
select teste.espera(
  not exists (select 1 from jsonb_array_elements(public.coletor_editais_pendentes(1, 500) -> 'compras') c where c ->> 'compra_id' = :'compra'),
  'edital lido deixa de ser pendente');
select teste.espera(
  exists (select 1 from jsonb_array_elements(public.coletor_editais_pendentes(2, 500) -> 'compras') c where c ->> 'compra_id' = :'compra'),
  'regra nova (versão maior): o edital volta a ser pendente');

-- O órgão publica outro arquivo: a assinatura muda e a leitura é refeita.
insert into public.compra_arquivos (compra_id, sequencial_documento, titulo, tipo_documento, url)
values (:'compra', 3, 'Edital retificado', 'Edital', 'https://pncp.gov.br/pncp-api/v1/orgaos/11111111000191/compras/2026/10/arquivos/3');
select c ->> 'assinatura' as assinatura_nova
from jsonb_array_elements(public.coletor_editais_pendentes(1, 500) -> 'compras') c where c ->> 'compra_id' = :'compra' \gset
select teste.espera(:'assinatura_nova' <> :'assinatura', 'arquivo novo: o edital volta a ser pendente, com outra assinatura');

-- O PNCP falha em tudo: a leitura boa de antes fica, e a tentativa é contada.
select public.coletor_gravar_edital(:'compra', 'erro', '[]', '[]', :'assinatura_nova', 1, 0, 3, 'O PNCP respondeu HTTP 503.');
select teste.espera(
  (select status = 'lido' and jsonb_array_length(alertas) = 2 and jsonb_array_length(trechos) = 1
          and tentativas = 1 and erro like '%503%' and assinatura = :'assinatura_nova' and arquivos_total = 3
   from public.compra_editais where compra_id = :'compra'),
  'falha depois de uma leitura boa: os alertas ficam e a tentativa conta');
select teste.espera(
  not exists (select 1 from jsonb_array_elements(public.coletor_editais_pendentes(1, 500) -> 'compras') c where c ->> 'compra_id' = :'compra'),
  'depois de uma falha, espera 3 horas para tentar de novo');
update public.compra_editais set lido_em = now() - interval '4 hours' where compra_id = :'compra';
select teste.espera(
  exists (select 1 from jsonb_array_elements(public.coletor_editais_pendentes(1, 500) -> 'compras') c where c ->> 'compra_id' = :'compra'),
  'passadas as 3 horas, tenta de novo');
update public.compra_editais set tentativas = 5 where compra_id = :'compra';
select teste.espera(
  not exists (select 1 from jsonb_array_elements(public.coletor_editais_pendentes(1, 500) -> 'compras') c where c ->> 'compra_id' = :'compra'),
  'na quinta falha, desiste');

select public.coletor_gravar_edital(:'compra', 'sem_texto', '[]', '[]', :'assinatura_nova', 1, 3, 3);
select teste.espera(
  (select status = 'sem_texto' and tentativas = 0 and erro is null and alertas = '[]'::jsonb
   from public.compra_editais where compra_id = :'compra'),
  'leitura sem erro zera as tentativas e substitui a anterior');
select public.coletor_gravar_edital(
  :'compra', 'lido', '[{"tipo":"amostra","nivel":"exige"}]',
  '[{"tipo":"amostra","texto":"…será exigida apresentação de amostras…","arquivo":"TR"}]', :'assinatura_nova', 1, 3, 3);
reset role;

-- A lista de oportunidades mostra os alertas do edital; as que já são oportunidade vêm primeiro.
insert into public.oportunidades (org_id, compra_id, prioridade) values (:'org', :'compra', 2);
update public.compra_editais set versao = 0 where compra_id = :'compra';
set local role service_role;
select teste.espera(
  (public.coletor_editais_pendentes(1, 1) -> 'compras' -> 0 ->> 'compra_id') = :'compra',
  'a licitação que é oportunidade de alguma empresa é lida primeiro');
reset role;
update public.compra_editais set versao = 1 where compra_id = :'compra';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select teste.espera(
  (select alertas -> 0 ->> 'nivel' = 'exige' and trechos -> 0 ->> 'arquivo' = 'TR'
   from public.compra_editais where compra_id = :'compra'),
  'usuário logado lê a leitura do edital (dado público do PNCP)');
select teste.espera(
  (select count(*) from public.oportunidades_lista where compra_id = :'compra') = 0,
  'quem não é da empresa continua sem ver a oportunidade dela');
select teste.bloqueia(
  format($$update public.compra_editais set alertas = '[]' where compra_id = %L$$, :'compra'), 'cliente não altera a leitura');
select teste.bloqueia(
  format($$delete from public.compra_editais where compra_id = %L$$, :'compra'), 'cliente não apaga a leitura');
reset role;
select teste.espera(
  (select alertas_do_edital = '[{"tipo":"amostra","nivel":"exige"}]'::jsonb
   from public.oportunidades_lista where compra_id = :'compra' and org_id = :'org'),
  'a lista de oportunidades traz os alertas do edital');

-- A leitura some junto com a licitação.
delete from public.compras where id = :'compra';
select teste.espera(
  not exists (select 1 from public.compra_editais where compra_id = :'compra'), 'apagada a licitação, a leitura vai junto');
