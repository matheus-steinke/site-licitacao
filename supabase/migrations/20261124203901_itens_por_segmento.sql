-- Quantos itens de cada segmento de interesse a licitação tem, para o cartão da oportunidade
-- mostrar uma etiqueta colorida por segmento ("Urologia · 14"). Antes só havia o total.
alter table public.oportunidades
  add column itens_por_segmento jsonb not null default '{}'::jsonb;
comment on column public.oportunidades.itens_por_segmento is
  'Itens por segmento de interesse: {"<id do segmento>": quantidade}. Um item de dois segmentos conta nos dois.';

-- A lista ganha a coluna nova (no fim, como o Postgres exige ao recriar uma view).
create or replace view public.oportunidades_lista
with (security_invoker = true)
as
select
  o.id, o.org_id, o.compra_id, o.status, o.motivo_descarte, o.decidido_em,
  o.prioridade, o.score, o.itens_compativeis, o.itens_a_verificar, o.itens_do_segmento,
  o.segmento_ids, o.valor_estimado, o.alertas, o.triada_em, o.criado_em,
  c.controle_pncp, c.orgao_cnpj, c.ano, c.sequencial, c.numero_compra, c.uf, c.municipio,
  c.modalidade_nome, c.objeto, c.situacao_id, c.data_disputa, c.valor_total_estimado, c.exemplo,
  g.razao_social as orgao_nome,
  (select count(*) from public.compra_itens i where i.compra_id = c.id)::integer as total_itens,
  o.itens_por_segmento
from public.oportunidades o
join public.compras c on c.id = o.compra_id
left join public.orgaos g on g.cnpj = c.orgao_cnpj;

-- Grava o resultado de um lote. p_config_em é a configuração com que o lote foi calculado:
-- se a organização mudou algo nesse meio tempo, nada é gravado e o lote é refeito.
create or replace function privado.triagem_gravar(
  p_org uuid,
  p_config_em timestamptz,
  p_marca_ate timestamptz,
  p_resultados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.organizacoes%rowtype;
  v_validos jsonb;
  v_gravadas integer := 0;
  v_removidas integer := 0;
begin
  select * into o from public.organizacoes where id = p_org for update;
  if not found then
    raise exception 'Organização não encontrada.';
  end if;
  if o.triagem_config_em is distinct from p_config_em or o.triagem_feita_config_em is distinct from p_config_em then
    return jsonb_build_object('ok', false, 'motivo', 'config_mudou');
  end if;

  -- Só compras dos estados da organização.
  select coalesce(jsonb_agg(r.linha), '[]'::jsonb) into v_validos
  from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) as r(linha)
  join public.compras c on c.id = (r.linha ->> 'compra_id')::uuid and c.uf = any (o.ufs);

  -- Deixou de casar: a que ainda não foi decidida some; a decidida fica, sem itens.
  with apagadas as (
    delete from public.oportunidades op
    using jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint)
    where op.org_id = p_org and op.compra_id = r.compra_id and r.prioridade = 0 and op.status = 'nova'
    returning 1
  )
  select count(*) into v_removidas from apagadas;

  update public.oportunidades op
  set prioridade = 0, score = 0, itens_compativeis = 0, itens_a_verificar = 0, itens_do_segmento = 0,
      segmento_ids = '{}', itens_por_segmento = '{}'::jsonb, valor_estimado = 0, alertas = '[]'::jsonb,
      triada_em = now()
  from jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint)
  where op.org_id = p_org and op.compra_id = r.compra_id and r.prioridade = 0;

  with gravadas as (
    insert into public.oportunidades as op (
      org_id, compra_id, prioridade, score, itens_compativeis, itens_a_verificar, itens_do_segmento,
      segmento_ids, itens_por_segmento, valor_estimado, alertas, triada_em
    )
    select p_org, r.compra_id, r.prioridade, r.score, r.itens_compativeis, r.itens_a_verificar,
           r.itens_do_segmento, coalesce(r.segmento_ids, '{}'), coalesce(r.itens_por_segmento, '{}'::jsonb),
           coalesce(r.valor_estimado, 0), coalesce(r.alertas, '[]'::jsonb), now()
    from jsonb_to_recordset(v_validos) as r(
      compra_id uuid, prioridade smallint, score smallint, itens_compativeis integer, itens_a_verificar integer,
      itens_do_segmento integer, segmento_ids uuid[], itens_por_segmento jsonb, valor_estimado numeric, alertas jsonb
    )
    where r.prioridade > 0
    on conflict (org_id, compra_id) do update
    set prioridade = excluded.prioridade, score = excluded.score,
        itens_compativeis = excluded.itens_compativeis, itens_a_verificar = excluded.itens_a_verificar,
        itens_do_segmento = excluded.itens_do_segmento, segmento_ids = excluded.segmento_ids,
        itens_por_segmento = excluded.itens_por_segmento,
        valor_estimado = excluded.valor_estimado, alertas = excluded.alertas, triada_em = excluded.triada_em
    returning 1
  )
  select count(*) into v_gravadas from gravadas;

  -- Os itens são sempre refeitos.
  delete from public.oportunidade_itens oi
  using public.oportunidades op, jsonb_to_recordset(v_validos) as r(compra_id uuid)
  where oi.oportunidade_id = op.id and op.org_id = p_org and op.compra_id = r.compra_id;

  insert into public.oportunidade_itens (oportunidade_id, org_id, item_id, produto_id, nivel, score, detalhe, alertas, lote)
  select op.id, p_org, ci.id, pr.id, i.nivel, i.score, coalesce(i.detalhe, '{}'::jsonb), coalesce(i.alertas, '{}'), i.lote
  from jsonb_to_recordset(v_validos) as r(compra_id uuid, prioridade smallint, itens jsonb)
  join public.oportunidades op on op.org_id = p_org and op.compra_id = r.compra_id
  cross join lateral jsonb_to_recordset(coalesce(r.itens, '[]'::jsonb)) as i(
    item_id uuid, produto_id uuid, nivel text, score smallint, detalhe jsonb, alertas text[], lote text
  )
  -- O item tem de ser da compra e o produto, da organização.
  join public.compra_itens ci on ci.id = i.item_id and ci.compra_id = r.compra_id
  join public.produtos pr on pr.id = i.produto_id and pr.org_id = p_org
  where r.prioridade > 0;

  update public.organizacoes
  set triagem_marca = greatest(coalesce(triagem_marca, p_marca_ate), p_marca_ate), triada_em = now()
  where id = p_org and p_marca_ate is not null;

  return jsonb_build_object('ok', true, 'gravadas', v_gravadas, 'removidas', v_removidas);
end;
$$;
