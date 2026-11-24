-- A coluna conteudo_alterado_em nasceu com o mesmo instante em todas as compras que já existiam
-- (o valor padrão da criação da coluna). A triagem anda por esse instante, em lotes: com todos
-- iguais, o primeiro lote trazia todas as compras de uma vez e estourava o tempo do banco.
-- Cada compra recebe um instante próprio, das disputas mais próximas para as mais distantes,
-- que é também a ordem em que a triagem as processa.
update public.compras c
set conteudo_alterado_em = base.inicio + base.posicao * interval '1 millisecond'
from (
  select id,
         now() - interval '1 hour' as inicio,
         row_number() over (order by data_disputa nulls last, id) as posicao
  from public.compras
) base
where base.id = c.id;
