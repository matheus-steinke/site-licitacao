-- Retenção: os itens de licitações com disputa encerrada há mais de N dias são apagados, para
-- o banco parar de crescer. A licitação em si fica (objeto, datas, situação, arquivos), assim
-- como as oportunidades e as decisões. Ficam de fora as licitações que alguma organização
-- aprovou (ou marcou como ganha ou perdida): essas guardam os itens.

alter table public.compras add column itens_removidos_em timestamptz;
comment on column public.compras.itens_removidos_em is
  'Quando os itens foram apagados pela retenção. A lista completa continua no PNCP.';

create or replace function public.coletor_remover_itens_antigos(
  p_dias integer default 30,
  p_limite integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_compras integer;
  v_itens bigint;
begin
  if p_dias is null or p_dias < 15 then
    raise exception 'A retenção mínima é de 15 dias depois da disputa.';
  end if;

  with alvo as (
    select c.id
    from public.compras c
    where c.data_disputa < now() - make_interval(days => p_dias)
      and c.itens_removidos_em is null
      and exists (select 1 from public.compra_itens i where i.compra_id = c.id)
      and not exists (
        select 1 from public.oportunidades o
        where o.compra_id = c.id and o.status in ('aprovada', 'ganha', 'perdida')
      )
    order by c.data_disputa
    limit least(greatest(coalesce(p_limite, 300), 1), 2000)
  ),
  apagados as (
    delete from public.compra_itens i
    using alvo a
    where i.compra_id = a.id
    returning 1
  ),
  marcadas as (
    update public.compras c
    set itens_removidos_em = now()
    from alvo a
    where c.id = a.id
    returning 1
  )
  select (select count(*) from marcadas), (select count(*) from apagados)
  into v_compras, v_itens;

  return jsonb_build_object('compras', v_compras, 'itens', v_itens);
end;
$$;

revoke all on function public.coletor_remover_itens_antigos(integer, integer) from public, anon, authenticated;
grant execute on function public.coletor_remover_itens_antigos(integer, integer) to service_role;
