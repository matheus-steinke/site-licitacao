-- Dashboard: as licitações que a organização aprovou (ou marcou como ganha ou perdida), com os
-- dados da licitação e o valor pelo LANCE MÍNIMO: soma de quantidade do item x lance mínimo do
-- produto vinculado, só nos itens "compatível" (os "verificar" não entram). O valor é calculado
-- na hora da consulta, então acompanha a tabela de preços do cliente.
--
-- security_invoker: valem as políticas das tabelas de origem para quem consulta, ou seja,
-- cada organização só enxerga as próprias oportunidades.
create view public.oportunidades_aprovadas
with (security_invoker = true)
as
select
  o.id, o.org_id, o.compra_id, o.status, o.decidido_em, o.itens_compativeis, o.itens_a_verificar,
  c.numero_compra, c.uf, c.municipio, c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa,
  c.exemplo,
  g.razao_social as orgao_nome,
  coalesce((
    select sum(i.quantidade * p.lance_minimo)
    from public.oportunidade_itens oi
    join public.compra_itens i on i.id = oi.item_id
    join public.produtos p on p.id = oi.produto_id and p.org_id = oi.org_id
    where oi.oportunidade_id = o.id and oi.nivel = 'compativel'
  ), 0)::numeric(18, 2) as valor_lance_minimo
from public.oportunidades o
join public.compras c on c.id = o.compra_id
left join public.orgaos g on g.cnpj = c.orgao_cnpj
where o.status in ('aprovada', 'ganha', 'perdida');

comment on view public.oportunidades_aprovadas is
  'Base do Dashboard: oportunidades aprovadas, ganhas ou perdidas, com o valor pelo lance mínimo.';

revoke all on table public.oportunidades_aprovadas from public, anon, authenticated;
grant select on table public.oportunidades_aprovadas to authenticated, service_role;
