-- Licitações FICTÍCIAS para testar o app sem esperar o coletor.
-- Todas marcadas com exemplo = true. Para remover:
--   delete from public.compras where exemplo;
--   delete from public.orgaos where cnpj like '99%';
-- As datas são relativas ao dia em que o seed é aplicado.

insert into public.orgaos (cnpj, razao_social, esfera, poder) values
  ('99000001000101', 'Hospital Municipal Exemplo de Curitiba', 'Municipal', 'Executivo'),
  ('99000002000102', 'Fundação Hospitalar Exemplo de Santa Catarina', 'Estadual', 'Executivo'),
  ('99000003000103', 'Prefeitura Municipal Exemplo de Santa Maria', 'Municipal', 'Executivo'),
  ('99000004000104', 'Hospital Universitário Exemplo de São Paulo', 'Federal', 'Executivo'),
  ('99000005000105', 'Secretaria de Estado da Saúde Exemplo de Minas Gerais', 'Estadual', 'Executivo'),
  ('99000006000106', 'Hospital Regional Exemplo de Londrina', 'Estadual', 'Executivo'),
  ('99000007000107', 'Consórcio Intermunicipal de Saúde Exemplo de Maringá', 'Municipal', 'Executivo'),
  ('99000008000108', 'Hospital de Clínicas Exemplo de Porto Alegre', 'Federal', 'Executivo')
on conflict (cnpj) do nothing;

with base as (
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') as hoje
),
dados (
  orgao_cnpj, sequencial, numero_compra, uf, municipio, modalidade_id, modalidade_nome,
  objeto, situacao_id, dias, hora, valor_total_estimado, srp
) as (
  values
  ('99000001000101', 12, '90012/2026', 'PR', 'Curitiba', 6, 'Pregão - Eletrônico',
   'Aquisição de materiais para urologia e endourologia: cateteres duplo J, fios guia hidrofílicos, bainhas de acesso ureteral e fibras laser.',
   1, 3, time '09:00', 359800.00, false),
  ('99000002000102', 45, '45/2026', 'SC', 'Florianópolis', 6, 'Pregão - Eletrônico',
   'Registro de preços para aquisição de materiais de videolaparoscopia, com fornecimento de clipador em regime de comodato.',
   1, 7, time '10:00', 148500.00, true),
  ('99000003000103', 7, '7/2026', 'RS', 'Santa Maria', 6, 'Pregão - Eletrônico',
   'Aquisição de material médico-hospitalar de consumo para as unidades básicas de saúde. Licitação exclusiva para ME/EPP.',
   1, 10, time '08:30', 62350.00, false),
  ('99000004000104', 33, '33/2026', 'SP', 'São Paulo', 8, 'Dispensa',
   'Aquisição de curativos especiais para a comissão de pele: hidrocoloide, alginato de cálcio e espuma com prata.',
   1, 2, time '14:00', 28400.00, false),
  ('99000005000105', 118, '118/2026', 'MG', 'Belo Horizonte', 6, 'Pregão - Eletrônico',
   'Aquisição de materiais para hemodinâmica. Será exigida apresentação de amostra do primeiro colocado.',
   1, 14, time '09:30', 1245000.00, true),
  ('99000006000106', 21, '21/2026', 'PR', 'Londrina', 6, 'Pregão - Eletrônico',
   'Aquisição de equipamentos médico-hospitalares para a UTI adulto. Visita técnica obrigatória.',
   4, 20, time '09:00', 890000.00, false),
  ('99000007000107', 9, '9/2026', 'PR', 'Maringá', 6, 'Pregão - Eletrônico',
   'Aquisição de materiais para endoscopia digestiva.',
   2, 5, time '13:30', 74200.00, false),
  ('99000008000108', 64, '64/2026', 'RS', 'Porto Alegre', 6, 'Pregão - Eletrônico',
   'Aquisição de materiais de laboratório e reagentes para hematologia, com comodato de analisador.',
   1, 25, time '10:00', 412000.00, true),
  ('99000001000101', 3, '3/2026', 'PR', 'Curitiba', 6, 'Pregão - Eletrônico',
   'Aquisição de materiais para anestesia: máscaras laríngeas, tubos endotraqueais e agulhas raquidianas.',
   1, -5, time '09:00', 96700.00, false)
)
insert into public.compras (
  controle_pncp, orgao_cnpj, ano, sequencial, numero_compra, uf, municipio,
  modalidade_id, modalidade_nome, objeto, situacao_id,
  data_publicacao, data_abertura_proposta, data_disputa,
  valor_total_estimado, srp, exemplo
)
select
  d.orgao_cnpj || '-1-' || lpad(d.sequencial::text, 6, '0') || '/2026',
  d.orgao_cnpj, 2026, d.sequencial, d.numero_compra, d.uf, d.municipio,
  d.modalidade_id, d.modalidade_nome, d.objeto, d.situacao_id,
  ((b.hoje + make_interval(days => d.dias - 12)) at time zone 'America/Sao_Paulo'),
  ((b.hoje + make_interval(days => d.dias - 12) + time '08:00') at time zone 'America/Sao_Paulo'),
  ((b.hoje + make_interval(days => d.dias) + d.hora) at time zone 'America/Sao_Paulo'),
  d.valor_total_estimado, d.srp, true
from dados d cross join base b
on conflict (controle_pncp) do nothing;

with itens (
  orgao_cnpj, sequencial, numero_item, descricao, quantidade, unidade,
  valor_unitario_estimado, grupo, exclusivo_me_epp
) as (
  values
  -- Urologia (PR): medidas certas e erradas, e sonda de Foley para testar exclusão
  ('99000001000101', 12, 1, 'CATETER DUPLO J 6FR X 26 CM, EM POLIURETANO, COM FIO GUIA E POSICIONADOR, ESTÉRIL', 200, 'UN', 185.00, null, false),
  ('99000001000101', 12, 2, 'CATETER DUPLO J 4,8FR X 24 CM, EM POLIURETANO, COM FIO GUIA, ESTÉRIL', 100, 'UN', 185.00, null, false),
  ('99000001000101', 12, 3, 'FIO GUIA HIDROFÍLICO 0,035" X 150 CM, PONTA RETA FLEXÍVEL', 300, 'UN', 210.00, null, false),
  ('99000001000101', 12, 4, 'BAINHA DE ACESSO URETERAL 12/14FR X 35 CM, HIDROFÍLICA', 80, 'UN', 890.00, null, false),
  ('99000001000101', 12, 5, 'FIBRA LASER HOLMIUM 270 µm, REUTILIZÁVEL, CONECTOR SMA', 20, 'UN', 3200.00, null, false),
  ('99000001000101', 12, 6, 'SONDA DE FOLEY 2 VIAS Nº 16, 100% SILICONE, BALÃO 30 ML', 1000, 'UN', 9.80, null, false),
  -- Laparoscopia (SC): dois lotes, para testar lote completo e incompleto
  ('99000002000102', 45, 1, 'TROCARTE DESCARTÁVEL 5 MM X 100 MM, SEM LÂMINA, COM CÂNULA', 300, 'UN', 120.00, '1', false),
  ('99000002000102', 45, 2, 'TROCARTE DESCARTÁVEL 10/12 MM X 100 MM, SEM LÂMINA, COM REDUTOR', 300, 'UN', 150.00, '1', false),
  ('99000002000102', 45, 3, 'AGULHA DE VERESS DESCARTÁVEL 120 MM', 200, 'UN', 60.00, '1', false),
  ('99000002000102', 45, 4, 'BOLSA COLETORA DE ESPÉCIME 200 ML PARA VIDEOLAPAROSCOPIA', 150, 'UN', 110.00, '1', false),
  ('99000002000102', 45, 5, 'CLIPE POLIMÉRICO TAMANHO ML, CARTELA COM 6 UNIDADES', 400, 'CT', 78.00, '2', false),
  ('99000002000102', 45, 6, 'CLIPADOR LAPAROSCÓPICO 10 MM PARA CLIPE POLIMÉRICO ML, EM COMODATO', 4, 'UN', 0.00, '2', false),
  -- Consumo (RS): exclusiva ME/EPP
  ('99000003000103', 7, 1, 'SERINGA DESCARTÁVEL 10 ML, BICO LUER LOCK, SEM AGULHA', 50000, 'UN', 0.42, null, true),
  ('99000003000103', 7, 2, 'AGULHA HIPODÉRMICA 25 X 7 MM, DESCARTÁVEL', 80000, 'UN', 0.12, null, true),
  ('99000003000103', 7, 3, 'LUVA DE PROCEDIMENTO EM LÁTEX, TAMANHO M, CAIXA COM 100 UNIDADES', 1200, 'CX', 21.50, null, true),
  ('99000003000103', 7, 4, 'CATETER INTRAVENOSO PERIFÉRICO 20G, COM DISPOSITIVO DE SEGURANÇA', 6000, 'UN', 1.35, null, true),
  ('99000003000103', 7, 5, 'EQUIPO MACROGOTAS COM INJETOR LATERAL E PINÇA ROLETE', 10000, 'UN', 0.95, null, true),
  -- Curativos (SP): dispensa
  ('99000004000104', 33, 1, 'CURATIVO DE HIDROCOLOIDE 10 X 10 CM, ESTÉRIL', 800, 'UN', 12.50, null, false),
  ('99000004000104', 33, 2, 'CURATIVO DE ALGINATO DE CÁLCIO 10 X 10 CM, ESTÉRIL', 600, 'UN', 14.00, null, false),
  ('99000004000104', 33, 3, 'CURATIVO DE ESPUMA DE POLIURETANO COM PRATA 15 X 15 CM', 200, 'UN', 50.00, null, false),
  -- Hemodinâmica (MG): exigência de amostra
  ('99000005000105', 118, 1, 'CATETER BALÃO PARA ANGIOPLASTIA CORONÁRIA 2,5 X 15 MM, SEMICOMPLACENTE', 300, 'UN', 950.00, null, false),
  ('99000005000105', 118, 2, 'STENT CORONARIANO FARMACOLÓGICO 3,0 X 18 MM', 400, 'UN', 2100.00, null, false),
  ('99000005000105', 118, 3, 'INTRODUTOR VALVULADO 6FR X 11 CM, COM FIO GUIA 0,035"', 800, 'UN', 95.00, null, false),
  ('99000005000105', 118, 4, 'FIO GUIA 0,014" X 190 CM PARA ANGIOPLASTIA, PONTA FLEXÍVEL', 300, 'UN', 140.00, null, false),
  -- Equipamentos (PR): suspensa, visita técnica
  ('99000006000106', 21, 1, 'MONITOR MULTIPARAMÉTRICO COM ECG, SPO2, PNI, TEMPERATURA E CAPNOGRAFIA', 10, 'UN', 38000.00, null, false),
  ('99000006000106', 21, 2, 'DESFIBRILADOR/CARDIOVERSOR BIFÁSICO COM MARCAPASSO EXTERNO', 4, 'UN', 45000.00, null, false),
  ('99000006000106', 21, 3, 'BOMBA DE INFUSÃO VOLUMÉTRICA COM EQUIPO DEDICADO', 30, 'UN', 11000.00, null, false),
  -- Endoscopia (PR): revogada
  ('99000007000107', 9, 1, 'PINÇA DE BIÓPSIA ENDOSCÓPICA DESCARTÁVEL 2,3 MM X 160 CM, OVAL COM ESPÍCULA', 500, 'UN', 62.00, null, false),
  ('99000007000107', 9, 2, 'ALÇA DE POLIPECTOMIA DESCARTÁVEL OVAL 25 MM X 230 CM', 200, 'UN', 145.00, null, false),
  ('99000007000107', 9, 3, 'AGULHA DE ESCLEROTERAPIA 23G X 5 MM, CATETER DE 230 CM', 200, 'UN', 71.00, null, false),
  -- Laboratório (RS): comodato
  ('99000008000108', 64, 1, 'TUBO PARA COLETA DE SANGUE A VÁCUO, EDTA K2, 4 ML, TAMPA ROXA', 200000, 'UN', 0.58, null, false),
  ('99000008000108', 64, 2, 'REAGENTE PARA HEMATOLOGIA, COMPATÍVEL COM ANALISADOR EM COMODATO', 120, 'KIT', 2200.00, null, false),
  ('99000008000108', 64, 3, 'TIRA REAGENTE PARA GLICEMIA CAPILAR, CAIXA COM 50 UNIDADES', 1000, 'CX', 32.00, null, false),
  -- Anestesia (PR): disputa já passada
  ('99000001000101', 3, 1, 'MÁSCARA LARÍNGEA DESCARTÁVEL Nº 4, EM SILICONE', 500, 'UN', 68.00, null, false),
  ('99000001000101', 3, 2, 'TUBO ENDOTRAQUEAL 7,5 MM COM CUFF, DESCARTÁVEL', 4000, 'UN', 6.80, null, false),
  ('99000001000101', 3, 3, 'AGULHA RAQUIDIANA 25G X 90 MM, PONTA QUINCKE', 3000, 'UN', 11.90, null, false)
)
insert into public.compra_itens (
  compra_id, numero_item, descricao, quantidade, unidade,
  valor_unitario_estimado, valor_total, grupo, tipo_beneficio_id, exclusivo_me_epp
)
select
  c.id, i.numero_item, i.descricao, i.quantidade, i.unidade,
  i.valor_unitario_estimado, i.quantidade * i.valor_unitario_estimado, i.grupo,
  case when i.exclusivo_me_epp then 1 else 4 end, i.exclusivo_me_epp
from itens i
join public.compras c
  on c.orgao_cnpj = i.orgao_cnpj and c.ano = 2026 and c.sequencial = i.sequencial
on conflict (compra_id, numero_item) do nothing;

insert into public.compra_arquivos (compra_id, sequencial_documento, titulo, tipo_documento, url, publicado_em)
select c.id, 1, 'Edital (exemplo fictício)', 'Edital', 'https://pncp.gov.br/app/editais', c.data_publicacao
from public.compras c
where c.exemplo
on conflict (compra_id, sequencial_documento) do nothing;
