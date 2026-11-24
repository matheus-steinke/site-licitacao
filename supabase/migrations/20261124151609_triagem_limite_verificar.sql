-- Calibração com os itens reais (117 mil itens de 1.711 licitações): com o limite de "verificar"
-- em 40 entravam muitos itens que só tinham em comum o tipo do produto e uma palavra solta
-- ("cateter nasal" para "cateter anti-retropulsão"). O padrão passa a ser 50.
alter table public.organizacoes alter column score_verificar set default 50;
update public.organizacoes set score_verificar = 50 where score_verificar = 40;
