-- Testes do ajuste do coletor: marcar uma licitação como excluída do PNCP (situação 99).
-- Roda depois dos anteriores; usa a compra da saúde de RO.

select id as compra_ro, situacao_id as situacao_antes from public.compras where controle_pncp = '04092680000171-1-000156/2026' \gset
select count(*) as alteracoes_antes from public.compra_alteracoes where compra_id = :'compra_ro' \gset

-- Só o coletor (chave de serviço) marca.
set local role anon;
select teste.bloqueia(
  $$select public.coletor_marcar_excluida('04092680000171-1-000156/2026')$$, 'visitante não marca licitação como excluída');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select teste.bloqueia(
  $$select public.coletor_marcar_excluida('04092680000171-1-000156/2026')$$, 'cliente não marca licitação como excluída');
reset role;

set local role service_role;
select teste.espera(
  not public.coletor_marcar_excluida('00000000000000-1-000001/2026'),
  'controle desconhecido: nada a marcar');
select teste.espera(
  public.coletor_marcar_excluida('04092680000171-1-000156/2026'),
  'o coletor marca a licitação como excluída do PNCP');
select teste.espera(
  not public.coletor_marcar_excluida('04092680000171-1-000156/2026'),
  'marcar de novo não muda nada');
reset role;

select teste.espera(
  (select situacao_id = 99 and verificado_em > now() - interval '1 minute' and area_saude and objeto <> ''
   from public.compras where id = :'compra_ro'),
  'a licitação continua no banco, com a situação 99');
select teste.espera(
  (select count(*) from public.compra_alteracoes where compra_id = :'compra_ro') = :alteracoes_antes + 1
  and (select valor_anterior = :'situacao_antes' and valor_novo = '99'
       from public.compra_alteracoes where compra_id = :'compra_ro' order by detectado_em desc limit 1),
  'a mudança de situação fica no histórico, uma vez só');

-- O cliente enxerga a nova situação.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1"}';
select teste.espera(
  (select situacao_id = 99 from public.compras where id = :'compra_ro'), 'o cliente vê a licitação como excluída');
reset role;
