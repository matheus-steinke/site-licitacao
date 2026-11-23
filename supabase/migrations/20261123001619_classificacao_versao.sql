-- Guarda com qual regra (versão do casamento + termos dos segmentos) a compra foi classificada.
-- Quando a regra muda, o coletor baixa os itens de novo e reclassifica.
alter table public.compras add column classificacao_versao text;

comment on column public.compras.classificacao_versao is
  'Resumo (hash) da regra de classificação usada: versão do casamento de texto + termos dos segmentos. Diferente do atual = reclassificar.';
