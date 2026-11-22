-- Seed inicial dos segmentos. Editável depois pelo painel ADMIN.
-- palavras_chave: termos buscados no PNCP e usados no casamento de itens.
-- sinonimos: abreviações e variações usadas só no casamento.
-- exclusoes: termos que impedem o casamento com o segmento.

insert into public.segmentos (slug, nome, ordem, palavras_chave, sinonimos, exclusoes) values
(
  'urologia', 'Urologia/Endourologia', 10,
  array[
    'cateter duplo j', 'cateter ureteral', 'stent ureteral', 'bainha de acesso ureteral',
    'fio guia hidrofílico', 'cesta extratora de cálculos', 'fibra laser holmium',
    'ureteroscópio', 'ureterorrenoscópio', 'nefroscópio', 'cistoscópio', 'ressectoscópio',
    'alça de ressecção', 'dilatador ureteral', 'cateter balão dilatador ureteral',
    'kit de nefrostomia percutânea', 'agulha de punção renal', 'litotritor',
    'sonda de foley', 'sonda uretral'
  ],
  array[
    'duplo jota', 'pigtail', 'pig tail', 'basket', 'dormia', 'ureterolitotripsia',
    'nefrolitotripsia', 'rtu', 'endourologia', 'urológico', 'urologia', 'holmium', 'thulium'
  ],
  array['veterinário', 'veterinária']
),
(
  'cirurgia-geral', 'Cirurgia Geral', 20,
  array[
    'grampeador cirúrgico', 'grampeador linear', 'grampeador circular', 'carga para grampeador',
    'tela cirúrgica', 'tela de polipropileno', 'fio de sutura', 'caneta de bisturi elétrico',
    'placa de eletrocautério', 'bisturi ultrassônico', 'seladora de vasos', 'clipe de titânio',
    'hemostático absorvível', 'cola cirúrgica', 'dreno de sucção', 'dreno de penrose',
    'lâmina de bisturi', 'pinça hemostática', 'afastador cirúrgico'
  ],
  array[
    'stapler', 'eletrocirurgia', 'eletrocautério', 'hemostático', 'sutura mecânica',
    'tesoura ultrassônica', 'fio cirúrgico', 'categute', 'poliglactina', 'polidioxanona'
  ],
  array['veterinário', 'veterinária']
),
(
  'laparoscopia', 'Laparoscopia', 30,
  array[
    'trocarte', 'trocater', 'pinça laparoscópica', 'tesoura laparoscópica',
    'clipador laparoscópico', 'clipe polimérico', 'agulha de veress',
    'bolsa coletora de espécime', 'endogrampeador', 'carga para endogrampeador',
    'ótica laparoscópica', 'insuflador de co2', 'porta-agulha laparoscópico',
    'cânula de aspiração e irrigação', 'videolaparoscopia', 'redutor de trocarte'
  ],
  array[
    'laparoscopia', 'videocirurgia', 'endobag', 'grasper', 'hem-o-lok', 'hemolok',
    'trocar', 'laparoscópico', 'laparoscópica', 'pneumoperitônio'
  ],
  array['veterinário', 'veterinária']
),
(
  'histeroscopia', 'Histeroscopia', 40,
  array[
    'histeroscópio', 'histeroscopia', 'ressectoscópio ginecológico',
    'alça de ressecção histeroscópica', 'camisa de histeroscópio',
    'eletrodo bipolar para histeroscopia', 'pinça de biópsia histeroscópica',
    'morcelador uterino', 'bomba de irrigação para histeroscopia',
    'tesoura histeroscópica', 'kit para histeroscopia'
  ],
  array[
    'histeroscópica', 'histeroscópico', 'histeromat', 'bettocchi', 'shaver uterino',
    'meio de distensão uterina'
  ],
  array['veterinário', 'veterinária']
),
(
  'endoscopia-digestiva', 'Endoscopia Digestiva', 50,
  array[
    'pinça de biópsia endoscópica', 'alça de polipectomia', 'agulha de escleroterapia',
    'clipe hemostático endoscópico', 'kit de ligadura elástica', 'papilótomo',
    'balão dilatador esofágico', 'prótese esofágica', 'prótese biliar', 'fio guia biliar',
    'cesta extratora biliar', 'balão extrator biliar', 'bocal para endoscopia',
    'escova de limpeza de canal endoscópico', 'kit de gastrostomia endoscópica',
    'gastroscópio', 'colonoscópio', 'duodenoscópio', 'cateter para cpre'
  ],
  array[
    'endoscopia', 'endoscópico', 'endoscópica', 'colonoscopia', 'cpre', 'hemoclip',
    'esfincterótomo', 'peg', 'overtube', 'polipectomia', 'videoendoscópio'
  ],
  array['veterinário', 'veterinária']
),
(
  'ortopedia', 'Ortopedia', 60,
  array[
    'placa bloqueada', 'parafuso cortical', 'parafuso esponjoso', 'parafuso canulado',
    'haste intramedular', 'prótese de quadril', 'prótese de joelho', 'fio de kirschner',
    'fixador externo', 'âncora ortopédica', 'cimento ortopédico', 'enxerto ósseo',
    'lâmina de shaver', 'lâmina de serra óssea', 'atadura gessada', 'tala ortopédica',
    'órtese ortopédica'
  ],
  array[
    'opme ortopedia', 'osteossíntese', 'artroplastia', 'artroscopia', 'ortopédico',
    'ortopédica', 'traumatologia', 'fio k', 'haste bloqueada', 'substituto ósseo'
  ],
  array['veterinário', 'veterinária', 'odontológico']
),
(
  'cardiologia-hemodinamica', 'Cardiologia/Hemodinâmica', 70,
  array[
    'cateter balão para angioplastia', 'stent coronariano', 'stent farmacológico',
    'introdutor valvulado', 'cateter guia', 'fio guia 0,014', 'fio guia 0,035',
    'cateter diagnóstico', 'insuflador para angioplastia', 'marcapasso',
    'eletrodo de marcapasso', 'cardiodesfibrilador implantável', 'oxigenador de membrana',
    'válvula cardíaca', 'dispositivo de fechamento vascular', 'cateter de ablação',
    'balão intra-aórtico', 'manifold'
  ],
  array[
    'hemodinâmica', 'angioplastia', 'cateterismo', 'coronariano', 'coronária', 'ptca',
    'judkins', 'indeflator', 'cdi', 'eletrofisiologia', 'cardíaco', 'cardíaca', 'endoprótese'
  ],
  array['veterinário', 'veterinária']
),
(
  'neurocirurgia', 'Neurocirurgia', 80,
  array[
    'válvula de derivação ventricular', 'cateter ventricular', 'drenagem ventricular externa',
    'clipe de aneurisma', 'substituto de dura-máter', 'micromola para embolização',
    'microcateter', 'parafuso pedicular', 'cage cervical', 'cage lombar',
    'sistema de fixação de coluna', 'craniótomo', 'broca craniana',
    'cateter de pressão intracraniana', 'placa para cranioplastia', 'estimulador medular'
  ],
  array[
    'neurocirurgia', 'neurocirúrgico', 'dvp', 'dve', 'pic', 'coil', 'dura-máter',
    'artrodese', 'neuronavegação', 'derivação ventriculoperitoneal', 'espaçador intersomático'
  ],
  array['veterinário', 'veterinária']
),
(
  'oftalmologia', 'Oftalmologia', 90,
  array[
    'lente intraocular', 'viscoelástico', 'bisturi oftálmico', 'kit de facoemulsificação',
    'cassete para facoemulsificação', 'ponteira de facoemulsificação', 'azul de tripan',
    'óleo de silicone oftálmico', 'anel de tensão capsular', 'anel intraestromal',
    'kit de vitrectomia', 'implante de drenagem para glaucoma', 'gás oftalmológico',
    'campo cirúrgico oftálmico', 'cânula oftálmica', 'fio de nylon 10-0'
  ],
  array[
    'oftalmologia', 'oftálmico', 'oftálmica', 'oftalmológico', 'lio', 'faco', 'catarata',
    'vitreófago', 'vitrectomia', 'metilcelulose', 'c3f8', 'sf6', 'crescente', 'keratome'
  ],
  array['veterinário', 'veterinária', 'colírio']
),
(
  'otorrinolaringologia', 'Otorrinolaringologia', 100,
  array[
    'tubo de ventilação timpânica', 'tampão nasal', 'splint nasal', 'lâmina de shaver nasal',
    'implante coclear', 'prótese auditiva', 'prótese ossicular', 'nasofibroscópio',
    'otoscópio', 'espéculo auricular', 'aspirador otológico', 'cânula de traqueostomia',
    'ponteira de radiofrequência', 'audiômetro', 'laringoscópio de suspensão'
  ],
  array[
    'otorrino', 'otorrinolaringologia', 'timpanostomia', 'carretel', 'microdebridador',
    'aparelho auditivo', 'aasi', 'sinusectomia', 'septoplastia', 'coblation', 'otológico'
  ],
  array['veterinário', 'veterinária']
),
(
  'ginecologia-obstetricia', 'Ginecologia/Obstetrícia', 110,
  array[
    'espéculo vaginal', 'dispositivo intrauterino', 'escova cervical', 'espátula de ayre',
    'kit papanicolau', 'pinça de pozzi', 'pinça de cheron', 'amniótomo', 'clamp umbilical',
    'detector fetal', 'cardiotocógrafo', 'colposcópio', 'pessário', 'cureta uterina',
    'cânula para amiu', 'vácuo extrator obstétrico', 'sling suburetral', 'fórceps obstétrico'
  ],
  array[
    'diu', 'ginecologia', 'ginecológico', 'ginecológica', 'obstetrícia', 'obstétrico',
    'sonar fetal', 'amiu', 'colpocitologia', 'preventivo', 'aspiração manual intrauterina'
  ],
  array['veterinário', 'veterinária']
),
(
  'anestesia', 'Anestesia', 120,
  array[
    'máscara laríngea', 'tubo endotraqueal', 'circuito de anestesia', 'circuito respiratório',
    'filtro hme', 'filtro bacteriano viral', 'agulha raquidiana', 'agulha peridural',
    'cateter peridural', 'kit de anestesia peridural', 'agulha para bloqueio de plexo',
    'lâmina de laringoscópio', 'videolaringoscópio', 'cal sodada', 'cânula de guedel',
    'fio guia para intubação', 'máscara facial para anestesia', 'aparelho de anestesia'
  ],
  array[
    'anestesia', 'anestésico', 'raquianestesia', 'raqui', 'quincke', 'whitacre', 'tuohy',
    'bougie', 'intubação', 'orotraqueal', 'traqueal', 'hmef', 'trocador de calor e umidade',
    'cânula orofaríngea'
  ],
  array['veterinário', 'veterinária']
),
(
  'uti', 'UTI/Terapia Intensiva', 130,
  array[
    'cateter venoso central', 'cateter para hemodiálise', 'cateter picc', 'cateter arterial',
    'transdutor de pressão', 'ventilador pulmonar', 'circuito para ventilador',
    'cânula nasal de alto fluxo', 'sistema fechado de aspiração traqueal', 'bomba de infusão',
    'equipo para bomba de infusão', 'monitor multiparamétrico', 'sensor de oximetria',
    'dreno de tórax', 'sistema de drenagem torácica', 'dialisador capilar', 'cuffômetro',
    'colchão pneumático'
  ],
  array[
    'uti', 'terapia intensiva', 'cvc', 'duplo lúmen', 'triplo lúmen', 'pam',
    'pressão arterial invasiva', 'trach care', 'ventilação mecânica', 'hemodiálise',
    'cateter central de inserção periférica', 'spo2'
  ],
  array['veterinário', 'veterinária']
),
(
  'curativos', 'Curativos', 140,
  array[
    'curativo de hidrocoloide', 'alginato de cálcio', 'curativo de espuma de poliuretano',
    'hidrogel', 'curativo com prata', 'curativo de carvão ativado',
    'filme transparente de poliuretano', 'ácidos graxos essenciais', 'bota de unna',
    'curativo de hidrofibra', 'gaze não aderente', 'curativo de silicone',
    'terapia por pressão negativa', 'placa de hidrocoloide', 'curativo com phmb', 'papaína'
  ],
  array[
    'curativo', 'cobertura para feridas', 'age', 'hidrocolóide', 'rayon', 'petrolatum',
    'curativo a vácuo', 'tpn', 'lesão por pressão', 'ferida', 'estomaterapia', 'alginato'
  ],
  array['veterinário', 'veterinária']
),
(
  'consumo-hospitalar', 'Materiais de consumo hospitalar', 150,
  array[
    'seringa descartável', 'agulha hipodérmica', 'luva de procedimento', 'luva cirúrgica',
    'cateter intravenoso periférico', 'equipo macrogotas', 'scalp', 'compressa de gaze',
    'atadura de crepom', 'esparadrapo', 'fita microporosa', 'máscara cirúrgica',
    'avental descartável', 'sonda nasogástrica', 'sonda de aspiração traqueal',
    'coletor de urina', 'coletor de material perfurocortante', 'torneira de três vias',
    'campo cirúrgico descartável', 'eletrodo descartável'
  ],
  array[
    'material médico-hospitalar', 'material hospitalar', 'material de consumo', 'correlatos',
    'jelco', 'abocath', 'equipo', 'gaze', 'atadura', 'n95', 'pff2', 'touca', 'propé',
    'algodão hidrófilo', 'insumos hospitalares', 'descartáveis'
  ],
  array['veterinário', 'veterinária', 'odontológico']
),
(
  'equipamentos', 'Equipamentos médico-hospitalares', 160,
  array[
    'monitor multiparamétrico', 'desfibrilador', 'cardioversor', 'ventilador pulmonar',
    'bomba de infusão', 'eletrocardiógrafo', 'autoclave', 'foco cirúrgico', 'mesa cirúrgica',
    'cama hospitalar', 'maca hospitalar', 'aparelho de ultrassom', 'oxímetro de pulso',
    'aspirador cirúrgico', 'bisturi eletrônico', 'incubadora neonatal', 'berço aquecido',
    'aparelho de raio-x', 'carro de emergência', 'torre de vídeo', 'arco cirúrgico'
  ],
  array[
    'equipamento hospitalar', 'equipamento médico', 'equipamentos médico-hospitalares',
    'dea', 'ecg', 'ultrassonografia', 'esfigmomanômetro', 'cadeira de rodas',
    'sistema de videocirurgia', 'mobiliário hospitalar', 'tomógrafo'
  ],
  array['veterinário', 'veterinária', 'manutenção preventiva', 'manutenção corretiva', 'locação']
),
(
  'laboratorio', 'Laboratório/Diagnóstico', 170,
  array[
    'tubo para coleta de sangue a vácuo', 'reagente para hematologia', 'reagente para bioquímica',
    'teste rápido', 'tira reagente para glicemia', 'tira reagente para urina',
    'lâmina para microscopia', 'ponteira para pipeta', 'analisador hematológico',
    'analisador bioquímico', 'kit diagnóstico', 'meio de cultura', 'swab', 'coletor universal',
    'glicosímetro', 'frasco para hemocultura', 'centrífuga laboratorial', 'placa de petri',
    'reagente para gasometria'
  ],
  array[
    'laboratório', 'laboratorial', 'análises clínicas', 'reagentes', 'diagnóstico in vitro',
    'imunoensaio', 'sorologia', 'lamínula', 'micropipeta', 'lanceta', 'microscópio',
    'controle de qualidade laboratorial'
  ],
  array['veterinário', 'veterinária', 'laboratório de informática', 'laboratório escolar']
)
on conflict (slug) do nothing;
