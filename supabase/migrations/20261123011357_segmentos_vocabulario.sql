-- Vocabulário que faltava nos segmentos, medido na rodada real de 22/11/2026.
-- Dos 78 editais descartados pelo filtro "área da saúde", cerca de 20 eram da saúde: os itens
-- usavam nomes que nenhum segmento conhecia ("maca clínica", "adesivo cirúrgico",
-- "monitor multiparâmetro", "marca-passo" com hífen). Entram como sinônimos: casam itens,
-- mas não aumentam as buscas no PNCP.

with novos (slug, termos) as (
  values
    ('cirurgia-geral', array['adesivo cirúrgico', 'instrumental cirúrgico', 'marcador de instrumental']),
    ('cardiologia-hemodinamica', array['marca-passo']),
    ('neurocirurgia', array['estimulação medular', 'estimulação da medula']),
    ('otorrinolaringologia', array['tubo de ventilação para ouvido']),
    ('uti', array['monitor multiparâmetro', 'central de monitorização']),
    ('consumo-hospitalar', array[
      'avental cirúrgico', 'campo cirúrgico', 'luva nitrílica', 'detergente enzimático',
      'integrador biológico', 'indicador biológico', 'grau cirúrgico'
    ]),
    ('equipamentos', array[
      'monitor multiparâmetro', 'maca clínica', 'maca hidráulica', 'equipamento de ultrassom',
      'espirômetro'
    ]),
    ('laboratorio', array[
      'reagente analítico', 'tira reagente', 'medidor de glicose', 'tubo de laboratório',
      'microtubo', 'pipeta', 'lâmina de laboratório', 'placa de laboratório'
    ])
)
update public.segmentos s
set sinonimos = s.sinonimos || array(
  select t from unnest(n.termos) as t
  where t <> all (s.sinonimos) and t <> all (s.palavras_chave)
)
from novos n
where s.slug = n.slug;

-- Equipamento odontológico não faz parte da taxonomia: sem a exclusão, "equipamento de
-- ultrassom" casaria com a peça de mão de ultrassom do dentista.
update public.segmentos
set exclusoes = exclusoes || array['odontológico']
where slug = 'equipamentos' and 'odontológico' <> all (exclusoes);
