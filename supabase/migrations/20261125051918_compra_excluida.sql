-- Licitação excluída do PNCP: o portal responde "410 - A contratação informada foi excluída"
-- e ela some da busca. O coletor marca com a situação 99, um código nosso (o PNCP usa de 1 a
-- 4), para as telas mostrarem "Excluída do PNCP" e a licitação parar de ser conferida.
comment on column public.compras.situacao_id is
  '1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa (situacaoCompraId do PNCP); 99 Excluída do PNCP (marcada pelo coletor).';

create or replace function public.coletor_marcar_excluida(p_controle text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_antiga integer;
begin
  select id, situacao_id into v_id, v_antiga
  from public.compras
  where controle_pncp = p_controle
  for update;
  if not found then
    return false;
  end if;

  if v_antiga is distinct from 99 then
    insert into public.compra_alteracoes (compra_id, campo, valor_anterior, valor_novo)
    values (v_id, 'situacao_id', v_antiga::text, '99');
  end if;
  update public.compras set situacao_id = 99, verificado_em = now() where id = v_id;
  return v_antiga is distinct from 99;
end;
$$;

revoke all on function public.coletor_marcar_excluida(text) from public, anon, authenticated;
grant execute on function public.coletor_marcar_excluida(text) to service_role;
