-- Testes de RLS da etapa 3: catálogo, importação, exclusões e arquivos.
-- Roda depois de rls_2_organizacoes.sql: organização A (dono ...c1) e B (dono ...c2) já existem.

select id as org_a from public.organizacoes where cnpj = '11222333000181' \gset
select id as org_b from public.organizacoes where cnpj = '12ABC34501DE35' \gset
select id as seg_uro from public.segmentos where slug = 'urologia' \gset

-- A colega volta para a organização A como membro (para testar que membro mantém o catálogo).
insert into public.membros (org_id, user_id, papel, nome, email)
values (:'org_a', '00000000-0000-0000-0000-0000000000c3', 'membro', 'Colega', 'colega@exemplo.test');

-- Visitante não acessa nada.
set local role anon;
select teste.bloqueia('select 1 from public.produtos', 'visitante não lê produtos');
select teste.bloqueia(
  format($$select public.importar_produtos(%L, 'atualizar', '[]')$$, :'org_a'),
  'visitante não importa');
reset role;

-- Membro (não dono) da A importa a tabela.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3"}';
select public.importar_produtos(:'org_a', 'atualizar', format($$[
  {"codigo":"001","referencia":"DJ-626","nome":"Cateter duplo J 6Fr x 26 cm","preco_proposta":150.5,"lance_minimo":98,"segmento_id":%s,"palavras_chave":["duplo j","pigtail"],"medidas":"6Fr x 26 cm","marca":"Marca X","fabricante":" ","registro_anvisa":"80000000001"},
  {"codigo":"002","referencia":"FG-035","nome":"Fio guia hidrofílico 0,035 x 150 cm","preco_proposta":180,"lance_minimo":120},
  {"codigo":"003","referencia":"BA-1214","nome":"Bainha ureteral 12/14Fr x 35 cm","preco_proposta":700,"lance_minimo":520}
]$$, to_jsonb(:'seg_uro'::text))::jsonb) as r1 \gset
select teste.espera(:'r1'::jsonb = '{"incluidos":3,"alterados":0,"sem_mudanca":0,"excluidos":0}', 'primeira importação inclui 3 produtos');
select teste.espera(
  (select palavras_chave = '{"duplo j",pigtail}' and fabricante is null and segmento_id = :'seg_uro'
   from public.produtos where codigo = '001'),
  'importação grava palavras-chave, segmento e troca texto vazio por nulo');

-- Atualizar pelo ID: 1 muda, 1 igual, 1 novo; o 003 (fora da planilha) continua.
select public.importar_produtos(:'org_a', 'atualizar', $$[
  {"codigo":"001","referencia":"DJ-626","nome":"Cateter duplo J 6Fr x 26 cm","preco_proposta":155,"lance_minimo":98,"palavras_chave":["duplo j","pigtail"],"medidas":"6Fr x 26 cm","marca":"Marca X","registro_anvisa":"80000000001"},
  {"codigo":"002","referencia":"FG-035","nome":"Fio guia hidrofílico 0,035 x 150 cm","preco_proposta":180.0000,"lance_minimo":120},
  {"codigo":"004","referencia":"FL-270","nome":"Fibra laser 270 micra","preco_proposta":2500,"lance_minimo":1900}
]$$) as r2 \gset
select teste.espera(:'r2'::jsonb = '{"incluidos":1,"alterados":1,"sem_mudanca":1,"excluidos":0}', 'atualizar pelo ID: 1 novo, 1 alterado, 1 sem mudança');
select teste.espera((select count(*) from public.produtos) = 4, 'atualizar pelo ID não exclui o que ficou fora da planilha');
select teste.espera(
  (select preco_proposta = 155 and segmento_id is null from public.produtos where codigo = '001'),
  'produto alterado recebe os valores novos (segmento em branco limpa o segmento)');

-- O id interno do produto não muda quando ele é atualizado (arquivos e vínculos continuam).
select id as prod_001 from public.produtos where codigo = '001' \gset
insert into public.produto_arquivos (org_id, produto_id, tipo, nome, caminho, tamanho, enviado_por)
values (:'org_a', :'prod_001', 'catalogo_tecnico', 'catalogo.pdf',
        :'org_a' || '/' || :'prod_001' || '/abc.pdf', 1234, '00000000-0000-0000-0000-0000000000c3');
select teste.falha_com(
  format($$insert into public.produto_arquivos (org_id, produto_id, tipo, nome, caminho, tamanho)
           values (%L, %L, 'outro', 'x.pdf', 'outra-pasta/x.pdf', 1)$$, :'org_a', :'prod_001'),
  'check', 'caminho do arquivo precisa começar pela pasta da organização e do produto');

-- Substituir tudo: fica o que está na planilha e o que está em p_manter.
select public.importar_produtos(:'org_a', 'substituir', $$[
  {"codigo":"001","referencia":"DJ-626","nome":"Cateter duplo J 6Fr x 26 cm","preco_proposta":155,"lance_minimo":98,"palavras_chave":["duplo j","pigtail"],"medidas":"6Fr x 26 cm","marca":"Marca X","registro_anvisa":"80000000001"}
]$$, '{002}') as r3 \gset
select teste.espera(:'r3'::jsonb = '{"incluidos":0,"alterados":0,"sem_mudanca":1,"excluidos":2}', 'substituir tudo exclui 003 e 004, mantém 001 e o 002 (linha com erro)');
select teste.espera(
  (select string_agg(codigo, ',' order by codigo) from public.produtos) = '001,002',
  'restam os produtos 001 e 002');
select teste.espera(
  (select id from public.produtos where codigo = '001') = :'prod_001'
  and (select count(*) from public.produto_arquivos) = 1,
  'produto mantido conserva o id interno e os arquivos');

select teste.falha_com(
  format($$select public.importar_produtos(%L, 'atualizar', '[{"codigo":"9","referencia":"a","nome":"b","preco_proposta":1,"lance_minimo":1},{"codigo":"9","referencia":"a","nome":"b","preco_proposta":1,"lance_minimo":1}]')$$, :'org_a'),
  'CODIGO_REPETIDO', 'ID repetido na mesma importação é recusado');
select teste.falha_com(
  format($$select public.importar_produtos(%L, 'atualizar', '[{"codigo":"9","referencia":"a","nome":"b","preco_proposta":-1,"lance_minimo":1}]')$$, :'org_a'),
  'check', 'preço negativo é recusado pelo banco');
select teste.falha_com(
  format($$select public.importar_produtos(%L, 'atualizar', '[]')$$, :'org_b'),
  'SEM_PERMISSAO', 'membro da A não importa na organização B');

-- Edição direta, exclusões e histórico pelo membro.
update public.produtos set lance_minimo = 99 where codigo = '001';
select teste.espera((select lance_minimo from public.produtos where codigo = '001') = 99, 'membro edita produto');
select teste.falha_com(
  format($$insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo) values (%L, '001', 'r', 'n', 1, 1)$$, :'org_a'),
  'duplicate key', 'ID repetido na organização é recusado');
insert into public.organizacao_exclusoes (org_id, termo) values (:'org_a', 'sonda de foley');
select teste.falha_com(
  format($$insert into public.organizacao_exclusoes (org_id, termo) values (%L, ' Sonda de Foley ')$$, :'org_a'),
  'check', 'exclusão precisa estar limpa e em minúsculas');
insert into public.importacoes (org_id, user_id, arquivo_nome, modo, total_linhas, incluidos)
values (:'org_a', '00000000-0000-0000-0000-0000000000c3', 'tabela.xlsx', 'atualizar', 3, 3);
select teste.falha_com(
  format($$insert into public.importacoes (org_id, user_id, arquivo_nome, modo) values (%L, '00000000-0000-0000-0000-0000000000c1', 'x.csv', 'atualizar')$$, :'org_a'),
  'row-level security', 'importação não pode ser registrada em nome de outro usuário');

-- Storage: membro grava na pasta da própria organização, não na de outra.
insert into storage.objects (bucket_id, name) values ('produtos', :'org_a' || '/' || :'prod_001' || '/abc.pdf');
select teste.falha_com(
  format($$insert into storage.objects (bucket_id, name) values ('produtos', %L)$$, :'org_b' || '/qualquer/x.pdf'),
  'row-level security', 'membro da A não envia arquivo para a pasta da B');
select teste.falha_com(
  $$insert into storage.objects (bucket_id, name) values ('produtos', 'sem-pasta-de-org/x.pdf')$$,
  'row-level security', 'caminho fora do padrão é recusado sem erro de conversão');
reset role;

-- Dono B não enxerga nada da A e não altera nada dela.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2"}';
select teste.espera((select count(*) from public.produtos) = 0, 'organização B não vê produtos da A');
select teste.espera((select count(*) from public.produto_arquivos) = 0, 'organização B não vê arquivos da A');
select teste.espera((select count(*) from public.organizacao_exclusoes) = 0, 'organização B não vê exclusões da A');
select teste.espera((select count(*) from public.importacoes) = 0, 'organização B não vê importações da A');
select teste.espera((select count(*) from storage.objects) = 0, 'organização B não vê arquivos da A no Storage');
select teste.bloqueia($$update public.produtos set lance_minimo = 0$$, 'organização B não altera produtos da A');
select teste.bloqueia($$delete from public.produtos$$, 'organização B não exclui produtos da A');
select teste.bloqueia($$delete from storage.objects$$, 'organização B não exclui arquivos da A no Storage');
select teste.falha_com(
  format($$insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo) values (%L, 'X', 'r', 'n', 1, 1)$$, :'org_a'),
  'row-level security', 'organização B não inclui produto na A');
select teste.falha_com(
  format($$insert into public.produto_arquivos (org_id, produto_id, tipo, nome, caminho, tamanho) values (%L, %L, 'outro', 'x.pdf', %L, 1)$$,
         :'org_b', :'prod_001', :'org_b' || '/' || :'prod_001' || '/x.pdf'),
  'row-level security', 'não dá para anexar arquivo a produto de outra organização');
-- O mesmo ID de produto pode existir em organizações diferentes.
insert into public.produtos (org_id, codigo, referencia, nome, preco_proposta, lance_minimo)
values (:'org_b', '001', 'REF-B', 'Produto da B', 10, 8);
select teste.espera((select count(*) from public.produtos) = 1, 'o mesmo ID pode existir em outra organização');
reset role;

-- Admin da plataforma não lê o catálogo dos clientes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select teste.espera((select count(*) from public.produtos) = 0, 'admin da plataforma não lê catálogo de cliente');
reset role;

-- Excluir o produto apaga os registros de arquivo dele.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
delete from public.produtos where codigo = '001';
select teste.espera((select count(*) from public.produto_arquivos) = 0, 'excluir produto remove os registros de arquivo');
reset role;
