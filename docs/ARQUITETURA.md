# Arquitetura e plano (aprovado em 22/11/2026)

Complementa [`ESPECIFICACAO.md`](ESPECIFICACAO.md). Em caso de conflito, vale a especificação, exceto nas decisões registradas abaixo, que foram aprovadas depois dela.

## Visão geral

```
 Navegador ──► Next.js (Vercel): telas + API ──► Supabase
                    │                            ├─ Postgres + RLS
                    │                            ├─ Auth (e-mail/senha, Google)
                    │                            └─ Storage (arquivos de produto)
                    ├──► Google Agenda / Drive (OAuth próprio da integração)
                    └──► Resend (e-mail diário)

 GitHub Actions (cron) ──► Coletor Node/TS ──► PNCP ──► Supabase (dados globais)
                              └─ triagem por organização ao fim de cada rodada
```

- **Front + API:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, na Vercel.
- **Banco, login, arquivos:** Supabase, com RLS em todas as tabelas.
- **Coletor em Node/TypeScript:** usa o mesmo código de normalização e casamento de texto que a triagem e os testes.
- **Agendamento no GitHub Actions:** gratuito (repositório público), aceita execuções longas e permite instalar `pdftotext`. O coletor é um script independente e pode migrar para Railway sem reescrita.
- **Motor de triagem em TypeScript puro:** normalização, regex de medidas, similaridade por trigramas e pontuação numa biblioteca testável sem banco. O `pg_trgm` do Postgres fica para a tela de Busca.
- **Quando a triagem roda:** ao fim de cada rodada do coletor (para todas as organizações) e no app, ao abrir Oportunidades, quando o cliente mudou catálogo, exclusões, UFs, segmentos, porte ou limites.
- **Integrações:** interface comum por provedor (conectar, desconectar, reagir a "oportunidade aprovada" e "data mudou"). Google é o primeiro; Outlook, WhatsApp e webhook ficam como provedores vazios.

## Modelo de dados

### Globais (PNCP e plataforma)

Leitura para qualquer usuário logado; escrita só pelo coletor (service role) ou por admin da plataforma.

| Tabela | Conteúdo | Relações |
|---|---|---|
| `orgaos` | CNPJ, razão social, esfera | — |
| `compras` | Controle PNCP (único), UF, município, modalidade, número, objeto, situação, datas, valor estimado | → `orgaos` |
| `compra_itens` | nº, descrição, quantidade, unidade, valor unitário, lote/grupo, benefício ME/EPP, medidas extraídas | → `compras` |
| `compra_arquivos` | título, tipo, URL do PNCP | → `compras` |
| `compra_editais` | leitura automática do edital: alertas (amostra, comodato, visita técnica), trechos, quais arquivos foram lidos e com que versão das regras | → `compras` |
| `compra_item_segmentos` | quais segmentos casaram com cada item | → `compra_itens`, `segmentos` |
| `compra_alteracoes` | histórico de mudança de data e situação | → `compras` |
| `segmentos` | nome, palavras-chave, sinônimos, exclusões | — |
| `coletor_rodadas`, `coletor_erros` | início, fim, fonte (busca ou plano B), contagens, erros por chamada | erros → rodadas |
| `admins_plataforma` | quem é admin | → usuário |

### Por organização (todas com `org_id` e RLS)

| Tabela | Conteúdo | Relações |
|---|---|---|
| `organizacoes` | razão social, CNPJ, porte, plano, UFs, limites do score, controle da triagem (configuração, marca, versão do motor), e-mail diário (ligado, hora) | — |
| `membros`, `convites` | usuário, papel (dono ou membro), preferência de receber o e-mail diário; convites por e-mail | → `organizacoes`, usuário |
| `organizacao_segmentos` | segmentos de interesse | → `segmentos` |
| `organizacao_exclusoes` | termos que a empresa não fornece (opcionalmente por segmento) | → `segmentos` |
| `produtos` | ID do cliente (único na organização), referência, produto, preço proposta, lance mínimo e colunas opcionais | → `segmentos` |
| `produto_arquivos` | catálogo técnico, registro ANVISA (caminho no Storage) | → `produtos` |
| `importacoes` | arquivo, modo, relatório do que entrou, mudou e deu erro | — |
| `oportunidades` | status, motivo do descarte, quem e quando decidiu, prioridade (catálogo, verificar ou segmento), score, contagens de itens (total e por segmento), segmentos, alertas, valor estimado; única por organização e compra | → `compras` |
| `oportunidade_itens` | item, produto sugerido, nível (compatível ou verificar), score e detalhe do casamento, alertas, lote | → `oportunidades`, `compra_itens`, `produtos` |
| `buscas_salvas` | nome e filtros (palavra-chave, estados, segmentos, período, modalidade, situação, só catálogo); da organização | — |
| `integracoes` | provedor, conta, credenciais cifradas, agenda e pasta-raiz | — |
| `integracao_vinculos` | ID do evento ou da pasta já criados, para não duplicar e poder atualizar | → `oportunidades` |
| `email_envios` | registro do e-mail diário: um por empresa e por dia, com o resultado | — |

As tabelas são criadas na etapa que as usa, não todas de uma vez.

## Telas

- **Públicas:** entrar, cadastrar, recuperar senha, Termos de Uso, Política de Privacidade.
- **Onboarding:** empresa, UFs, segmentos, tabela de preços.
- **Oportunidades** (tela inicial): caixa de entrada e página de detalhe.
- **Busca:** filtros e buscas salvas.
- **Catálogo:** tabela editável, importação com pré-visualização, arquivos do produto, exclusões.
- **Dashboard.**
- **Integrações:** Google Agenda e Drive.
- **Configurações:** empresa, UFs, segmentos, triagem (limites do score), notificações, usuários, excluir conta.
- **Admin:** segmentos, rodadas do coletor, organizações.

## Plano em etapas

| # | Etapa | Teste ao fim |
|---|---|---|
| 1 | Base: projeto, banco com RLS, login (e-mail e Google), menu, seed de segmentos e de licitações de exemplo, páginas LGPD | Cadastrar, entrar, ver o app publicado |
| 2 | Onboarding, Configurações, usuários da organização, admin de segmentos | Criar empresa, convidar usuário, editar segmento |
| 3 | Catálogo: tabela, importação Excel/CSV, arquivos, exclusões (com testes da importação) | Importar a planilha real |
| 4 | Coletor do PNCP, plano B, log de rodadas, admin de rodadas | Ver licitações reais entrando a cada 2 horas |
| 5 | Triagem e Oportunidades: caixa de entrada, detalhe, aprovar/descartar (com testes da triagem) | Conferir os casamentos contra a triagem manual |
| 6 | Busca e buscas salvas | Pesquisar e salvar filtros |
| 7 | Dashboard | Conferir cartões e valor estimado |
| 8 | Integrações Google Agenda e Drive | Aprovar e ver evento e pastas criados |
| 9 | E-mail diário, convite por e-mail, excluir conta, testes de RLS, README final | Receber o e-mail; revisão geral |
| 10 | Leitura do edital (`pdftotext`) para os alertas, com os trechos | Alertas de amostra, comodato e visita técnica com o trecho do edital |
| 11 | Monitoramento das licitações (Compras.gov.br e Licitações-e), incluído em 26/11/2026. Estudo e plano em [`MONITORAMENTO.md`](MONITORAMENTO.md), aprovados pelo dono do projeto em 26/11/2026; começa por uma validação, antes de construir | Receber o aviso de uma mensagem do pregoeiro em segundos |

## Decisões aprovadas

1. **Data da disputa** = `dataEncerramentoProposta` do PNCP (fim do recebimento de propostas, abertura da sessão), interpretada em `America/Sao_Paulo`.
2. **Modalidades coletadas:** Pregão Eletrônico e Dispensa Eletrônica, com filtro por modalidade.
3. **O que vira oportunidade:** toda licitação nas UFs do cliente que case com o catálogo **ou** com os segmentos dele; as de catálogo aparecem no topo.
4. **Status "Disputada"** é calculado (aprovada com data de disputa passada), não gravado. Gravados: nova, aprovada, descartada, ganha, perdida.
5. **Google Agenda:** agenda principal por padrão, com campo para informar o ID de outra agenda (o escopo `calendar.events` não lista agendas).
6. **Google Drive:** o app cria a pasta-raiz (nome configurável); o cliente pode movê-la depois. Escolher pasta existente fica para depois.
7. **Agendador:** GitHub Actions (repositório público, sem custo de minutos). Atenção: em repositório público, o GitHub desativa workflows agendados após 60 dias sem atividade no repositório.
8. **Infra:** projetos Supabase e Vercel criados pelo Claude nas contas do dono do projeto.

## Decisões tomadas na etapa 2

9. **Um usuário, uma organização:** o banco tem a restrição `membros_user_id_unico`. Para
   permitir mais de uma organização por usuário no futuro, basta removê-la e adicionar um
   seletor de organização.
10. **Papéis:** `dono` (responsável, quem criou a organização) e `membro`. Só o dono altera
    dados da empresa, estados, segmentos e usuários.
11. **Convites por link:** o convite fica vinculado ao e-mail; quem entra com esse e-mail,
    já confirmado, pode aceitar. Desde a etapa 9 o convite também vai por e-mail (decisão 95).
12. **CNPJ único:** cada CNPJ pertence a uma organização. Quem tentar cadastrar um CNPJ já
    usado é orientado a pedir convite ao responsável.
13. **Nome e e-mail do membro** são copiados para `membros` na entrada, porque `auth.users`
    não é visível ao cliente.
14. **Admin sem empresa** acessa o painel Admin normalmente, mas precisa passar pelo
    onboarding para usar as telas de cliente.

## Decisões tomadas na etapa 3

15. **Qualquer membro mantém o catálogo** (produtos, importação, arquivos, exclusões), não só
    o responsável. Dados da empresa e usuários continuam só com o responsável.
16. **Planilhas sem o pacote `xlsx` do npm:** ele está parado na versão 0.18.5, com
    vulnerabilidades conhecidas (as correções só saem pelo CDN do SheetJS). Usamos
    `read-excel-file`, `write-excel-file` e `papaparse`.
17. **A planilha é lida no navegador** para a prévia, e as células seguem para o servidor,
    que valida tudo de novo com o mesmo código antes de gravar.
18. **Importação atômica** pela função `importar_produtos` do banco. O id interno do produto
    não muda numa atualização, então arquivos e vínculos futuros (oportunidades) se mantêm.
19. **ID repetido na planilha:** nenhuma das linhas repetidas entra, para não gravar a errada.
20. **"Substituir tudo" preserva** os produtos cujas linhas vieram com erro (não exclui por
    causa de um erro de digitação) e exige confirmar a quantidade a excluir.
21. **Upload direto do navegador para o Storage**, porque a Vercel limita o corpo das
    requisições a 4,5 MB. Pelo mesmo motivo a importação aceita até 5.000 produtos por vez.
22. **Edição de produto numa página própria**, não em células da tabela: funciona melhor no
    celular e comporta os campos opcionais e os arquivos.
23. **Busca do catálogo** ainda diferencia acentos ("canula" não acha "cânula"). A busca sem
    acento entra na etapa 6, junto com a busca de licitações.

## Decisões tomadas na etapa 4

24. **Descoberta pela busca, com filtro por itens.** A busca do PNCP enxerga a descrição dos
    itens; depois de baixar os itens, só fica o edital com pelo menos um item que case com
    algum segmento. O edital descartado fica gravado sem itens (`area_saude = false`), só
    para não ser baixado a cada rodada.
25. **Edital sem itens ainda fica invisível** (`area_saude` nulo) até a API de itens responder.
26. **Plano B só quando a busca falha:** ele precisa paginar todas as contratações abertas
    (centenas de chamadas) e filtra pelo objeto, então é mais pesado e menos preciso.
27. **Gravação por função do banco** (`coletor_gravar_compra`): uma transação por edital, com
    histórico de mudança de situação e de data. Itens são atualizados no lugar, mantendo o
    id (as oportunidades da etapa 5 vão apontar para eles).
28. **Casamento de termos por palavras inteiras e próximas**, sem preposições e no singular,
    em `src/lib/texto`. É a base da triagem da etapa 5.
29. **Sinônimos genéricos removidos do seed** (ex.: "trocar", "material de consumo", "age",
    "laboratório"): deixavam passar editais fora da saúde.
30. **Chave de serviço do Supabase só no GitHub Actions**, como segredo. O app web continua
    usando apenas a chave pública.

31. **Na descrição de um item, o casamento não exige palavras próximas.** A primeira rodada
    real descartou editais de seringas e aventais porque muitos órgãos usam o formato do
    catálogo federal, com as palavras do termo distantes. A proximidade ficou só para
    textos longos.
32. **Reclassificação automática:** cada compra guarda um resumo da regra com que foi
    classificada (`classificacao_versao`). Se os segmentos ou o casamento mudam, a rodada
    seguinte baixa os itens de novo e reclassifica, inclusive o que foi descartado.
33. **Busca com 2 chamadas simultâneas e segunda passada** nos termos que falham.
34. **Falha no banco não encerra a rodada:** gravações são repetidas e, se uma falhar de
    vez, a compra fica para a próxima rodada.
35. **Quedas de conexão contam à parte:** até 10 tentativas com espera curta, sem gastar as
    4 tentativas das falhas lentas (ver "O que a API do PNCP mostrou").
36. **Vocabulário dos segmentos ajustado com dados reais.** Dos 78 editais descartados na
    rodada de 22/11/2026, 22 eram da saúde: os itens usavam nomes que nenhum segmento
    conhecia ("maca clínica", "adesivo cirúrgico", "monitor multiparâmetro", "marca-passo"
    com hífen). Entraram 29 sinônimos (migration `segmentos_vocabulario`), testados contra
    esses itens antes de gravar. Outros 3 só esperavam a reclassificação da decisão 32. Os
    53 restantes continuam fora, como devem: cozinha, obras, limpeza, veterinário,
    manutenção, medicina do trabalho, odontologia.
37. **Odontologia fica fora.** A taxonomia da especificação não tem segmento odontológico;
    por isso instrumental e equipamento de dentista são descartados, e o segmento de
    equipamentos ganhou a exclusão "odontológico". Se for de interesse, basta criar o
    segmento em Admin > Segmentos.
38. **Lista de Oportunidades mostra as 200 disputas mais próximas** e avisa quando há
    mais. Filtros e paginação entram com a triagem (etapa 5). Valor estimado zero no PNCP
    aparece como "não informado" (o órgão não informou ou o valor é sigiloso).
39. **Aviso de navegação instantânea no modo de desenvolvimento.** O `next dev` acusa
    "uncached data outside of Suspense" em todas as páginas logadas: elas leem a sessão e
    depois o banco, cobertas só pelo `loading.tsx` do grupo `(app)`. É um aviso (nível
    `warning`, só em desenvolvimento): o build passa e a navegação mostra o esqueleto
    enquanto os dados chegam. O ajuste fino (um `<Suspense>` por bloco da página, como
    descreve `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`) fica
    para a etapa 5, quando a tela de Oportunidades for refeita.
40. **A busca tem teto de tempo próprio** (60% da rodada) e a lista de termos gira a cada
    rodada. Com 294 termos a busca leva uns 20 minutos num dia normal; sem o teto, num dia
    ruim ela consumiria a rodada inteira e nenhum item seria baixado. Os termos que não
    couberem ficam para a rodada seguinte, que começa a lista de outro ponto.

## Decisões tomadas na etapa 5

41. **O motor lê tudo do nome do produto.** O catálogo real que serviu de base (129 produtos)
    não tinha palavras-chave, medidas nem segmento preenchidos: só o nome, com marca,
    fabricante, medidas e frases de embalagem. O motor separa as palavras que definem o
    produto, descobre as marcas pelo próprio catálogo ("MARCA: X / FABRICANTE: Y") e lê as
    medidas do nome. Palavras-chave e o campo de medidas, quando existem, somam.
42. **O item precisa ser do mesmo tipo do produto.** Na primeira calibração, com 117 mil
    itens reais, "ter palavras em comum" dava 428 itens compatíveis, quase todos errados
    ("cateter intravenoso com agulha" casando com "agulha de punção"). A regra passou a ser:
    a primeira palavra da descrição do item tem de estar no nome do produto, e o tipo do
    produto tem de estar no começo do item. Resultado: 33 compatíveis, quase todos certos.
43. **A medida ajusta o score do texto, não soma pontos.** Somando, uma medida igual
    compensava um texto fraco ("cateter venoso 4 Fr" para "cateter duplo J 4 Fr").
    Medida diferente nunca é "compatível": fica para verificar, com a diferença explicada.
44. **Três níveis de oportunidade:** item compatível com o catálogo (prioridade 3), só itens
    a verificar (2) e só segmento de interesse (1). A lista mostra nessa ordem.
45. **Limites padrão do score: 60 (compatível) e 50 (verificar)**, ajustáveis em
    Configurações > Triagem. Com 40 para verificar entrava ruído demais.
46. **A triagem roda em lotes e sabe o que falta.** Cada compra tem `conteudo_alterado_em`
    e cada organização uma marca (`triagem_marca`): só é triado o que mudou depois da marca.
    Gatilhos no banco marcam a triagem como desatualizada quando catálogo, exclusões,
    segmentos, estados, porte ou limites mudam, e ela recomeça.
47. **Quem executa:** o coletor, ao fim de cada rodada (chave de serviço), e o app, com a
    sessão do usuário, quando a empresa mudou algo, ao abrir Oportunidades, com andamento na
    tela. As mesmas funções do banco atendem os dois e conferem a permissão. Assim a chave
    de serviço continua só no GitHub Actions (decisão 30) e o cliente não espera 2 horas
    para ver o efeito de uma mudança no catálogo.
48. **Mudança de configuração no meio de um lote não grava resultado velho:** o lote leva o
    instante da configuração com que foi calculado; se a organização mudou algo, a gravação
    é recusada e o lote é refeito.
49. **Decisão do cliente é preservada.** Uma oportunidade nova que deixa de casar some; uma
    já aprovada ou descartada fica (sem itens), para não apagar o histórico.
50. **O cliente não escreve nas tabelas de oportunidade:** só lê. Triagem e decisão passam
    por funções do banco (`triagem_gravar`, `decidir_oportunidade`), que conferem que o item
    é da compra, o produto é da organização e a compra é de um estado atendido.
51. **Lote pelo começo da descrição** ("LOTE 1 - ...", "GRUPO 2 - ...", "(L3) ..."), já que o
    PNCP não informa o lote do item. Sem isso na descrição, não há alerta de lote.
52. **"Disputada" não é gravado:** é a aprovada cuja data de disputa passou (decisão 4).
    Ganha e Perdida só podem ser marcadas depois da data.
53. **Valor estimado da oportunidade** = soma de quantidade x valor de referência dos itens
    compatíveis. O valor pelo lance mínimo aparece no detalhe e será a base do Dashboard.
54. **Páginas de Oportunidades em blocos (`<Suspense>`):** o título aparece na hora e a lista
    chega em seguida. Com isso o aviso de navegação do `next dev` (decisão 39) não aparece
    mais nessas duas páginas; as demais continuam como estavam.
55. **Calibração com dados reais antes de publicar:** uma organização temporária com cópia
    do catálogo e todos os estados, os 117 mil itens baixados para um arquivo local e o
    motor rodado sobre eles a cada ajuste. A organização temporária foi apagada no fim.
56. **Sigla "rtu" removida da Urologia.** Na primeira triagem real, uma licitação de
    eletrônica apareceu como Urologia porque um item citava "Modbus RTU". Siglas curtas que
    têm outro sentido fora da saúde não devem ser sinônimo de segmento.
57. **Itens dos segmentos pintados no detalhe** (pedido do dono do projeto em 24/11/2026,
    incluído na especificação). Uma cor por segmento de interesse da empresa, pela ordem dos
    segmentos; a etiqueta com o nome acompanha a cor, para não depender só dela. Os itens
    dos segmentos são carregados à parte, sem o limite de 300 da lista geral, e o filtro
    "Só dos meus segmentos" troca na própria tela, sem recarregar.
58. **Contagem por segmento gravada na oportunidade** (`itens_por_segmento`), para o cartão
    da lista mostrar uma etiqueta colorida por segmento com a quantidade de itens (pedido
    em 24/11/2026). A triagem já sabia a contagem; antes gravava só o total. Contar na hora
    da listagem exigiria reaplicar as exclusões da empresa em milhares de itens a cada
    abertura da tela. A versão do motor passou para 2, o que refaz a triagem de todas as
    organizações na próxima rodada ou ao abrir Oportunidades.

## Decisões tomadas na etapa 6

59. **Busca por índice de texto do Postgres, não por trigramas.** O plano falava em `pg_trgm`,
    mas o banco já estava com 102 MB em três dias de coleta e um índice de trigramas sobre
    146 mil descrições ocuparia quase o tamanho da tabela. O índice de texto
    (`to_tsvector('simple', ...)` sobre o texto sem acento) ficou com 13 MB e responde em
    0,2 a 0,6 s. A busca por começo de palavra cobre plural e variações ("cateter" acha
    "cateteres") sem depender de dicionário de idioma.
60. **Todas as palavras no mesmo item (ou no objeto).** "cateter duplo j" não acha uma
    licitação que tem "cateter" num item e "duplo" em outro. Palavras de ligação saem da
    consulta; palavras de até 2 letras valem inteiras ("j" não acha "jelco").
61. **A busca cobre todas as licitações da saúde, inclusive de outros estados e com disputa
    passada.** O padrão da tela é: estados da empresa, de hoje em diante.
62. **Filtros no endereço da página.** A tela é um formulário comum (GET): funciona sem
    JavaScript, o link pode ser compartilhado e a busca salva guarda os mesmos filtros.
63. **Buscas salvas são da organização**, não do usuário, e guardam "hoje" como "hoje" (não
    a data do dia em que foram salvas). Limite de 30 por organização.
64. **"Só com itens do meu catálogo" usa as oportunidades já triadas** (estados da empresa,
    disputa futura). Triar sob demanda licitações de outros estados ficou fora.
65. **Licitação que não é oportunidade tem página própria** (`/busca/licitacao/[id]`), com o
    mesmo componente da oportunidade, sem ações e sem itens do catálogo.
66. **Busca do catálogo sem acento** por uma coluna gerada (`produtos.busca`), com as
    palavras do ID, da referência, do nome e da marca em minúsculas e sem acento. Fecha a
    decisão 23.
67. **Retenção dos itens (aprovada em 24/11/2026).** O coletor traz cerca de 200 licitações
    e 12 mil itens por dia. Quase todo o espaço é dos itens (0,64 KB cada, com índices e
    segmentos): uns 7,7 MB por dia. O plano gratuito do Supabase tem 500 MB e, sem limpeza,
    encheria em cerca de dois meses. Regra: ao fim de cada rodada o coletor chama
    `coletor_remover_itens_antigos`, que apaga os itens das licitações com disputa encerrada há
    mais de N dias que nenhuma organização aprovou (nem marcou como ganha ou perdida). Ficam a
    licitação (objeto, datas, situação, arquivos), as oportunidades e as decisões; a página de
    detalhe avisa que a lista completa está no PNCP. A função só pode ser chamada com a chave
    de serviço, recusa menos de 15 dias e limpa no máximo 200 licitações por rodada.
    - **Por que 30 dias, e não os 90 cogitados:** uma licitação fica no banco cerca de 12 dias
      antes da disputa mais os N dias depois. Com 90 dias seriam (12 + 90) × 7,7 ≈ 785 MB, mais
      do que o plano inteiro. Com 30 dias, (12 + 30) × 7,7 ≈ 323 MB.
    - **O que continua crescendo:** o cabeçalho e os arquivos de cada licitação (uns 0,65 MB
      por dia, 235 MB por ano) nunca são apagados. Com 30 dias de retenção, o plano gratuito
      deve durar de 6 a 8 meses, em vez de 2. Quando apertar, as saídas são: reduzir os dias
      (`COLETOR_DIAS_DE_RETENCAO`), apagar também as licitações antigas que não viraram
      oportunidade de ninguém, ou mudar de plano (decisão do usuário: avaliar o plano pago
      quando chegar a hora).
    - **Disputa remarcada:** se uma licitação já limpa reaparece com disputa futura, o coletor
      baixa os itens de novo e a marca `itens_removidos_em` é apagada.
    - A limpeza não muda `conteudo_alterado_em`, então não dispara triagem de novo.

## Decisões tomadas na etapa 7

68. **O Dashboard só conta o que a empresa aprovou.** Disputada = aprovada, ganha ou perdida
    com a data da disputa já passada; agendada = aprovada com disputa futura. São as mesmas
    regras das abas "Disputadas" e "Agendadas" de Oportunidades, então os números batem
    (com o período "Tudo").
69. **Valor em disputa = quantidade × lance mínimo, só nos itens "compatível"** das
    agendadas. Itens "verificar" não entram, porque o casamento ainda não foi conferido por
    ninguém. O cálculo é feito na consulta (view `oportunidades_aprovadas`, com
    `security_invoker`), então acompanha a tabela de preços na hora: mudou o lance mínimo,
    mudou o valor. Agendada sem item compatível conta na quantidade e soma zero; o cartão
    avisa quantas são.
70. **Um filtro de período só, sobre a data da disputa, para tudo** (cartões, gráficos e
    lista). Atalhos: últimos 12 meses (padrão), este mês, este ano e tudo, mais datas livres.
    "Últimos 12 meses" vai do começo do mês de 11 meses atrás **em diante**, sem data final,
    para as agendadas aparecerem no padrão. A tela escreve o período por extenso ("Disputas
    de 01/12/2025 em diante"). O período fica no endereço, como na Busca.
71. **Agendada suspensa, revogada ou anulada continua na conta**, como manda a especificação
    (agendada = aprovada com disputa futura), mas a tela avisa quantas são e a lista de
    próximas disputas mostra a situação. Para tirar da conta, o cliente desfaz a aprovação.
72. **Gráficos sem biblioteca:** colunas e barras em HTML e CSS, renderizadas no servidor.
    Por mês (colunas empilhadas, até 12 meses, no horário de Brasília, com os meses vazios
    preenchidos) e por estado (barras, os 8 maiores e "Outros"). Duas cores conferidas para
    daltonismo e contraste (`--grafico-disputadas`, `--grafico-agendadas`), legenda, total na
    ponta de cada barra, detalhe ao passar o mouse ou focar com o teclado, e "Ver em tabela"
    com os mesmos números.
73. **A agregação é feita no app** (`src/lib/dashboard/resumo.ts`), a partir das linhas da
    view: uma empresa aprova dezenas ou centenas de licitações, não milhares, e assim a regra
    fica coberta por testes unitários. Há um teto de 10 mil linhas por consulta.

## Ajuste do coletor depois da etapa 7 (25/11/2026)

74. **A conferência das licitações conhecidas passou do detalhe para a busca.** O detalhe
    (`/api/consulta/v1/orgaos/...`) tem um limite de requisições baixo: chamado a partir do
    GitHub Actions, respondia 429 ("Limite de requisições excedido") em quase tudo. Numa
    rodada, 395 de 400 conferências falharam, depois de 22 minutos de tentativas, e isso
    vinha acontecendo havia pelo menos um dia: mudanças de situação demoravam a aparecer.
    A busca do portal aceita o número de controle entre aspas, com `status=todos`, e devolve a
    licitação em qualquer situação (suspensa, revogada, anulada). Várias de uma vez:
    `"A" OR "B" OR ...`. O coletor confere em **lotes de 20 controles por chamada**: 400
    conferências viram 20 chamadas, numa API que não bloqueia o GitHub. Conferido na API real
    com 25 controles: voltaram os 23 existentes e nenhum estranho.
75. **O detalhe só entra para o que a busca não conhece**, um por vez, para descobrir se a
    licitação foi excluída. A API de consulta (detalhe e plano B) ganhou uma fila própria,
    com 1,2 s entre chamadas, e espera longa depois de um 429 (5 s, 10 s, 20 s). Depois de
    três recusas seguidas, a rodada para de chamar o detalhe e avisa no resumo. O limite
    exato do PNCP não é publicado e não foi possível medi-lo a partir do GitHub; a fila lenta
    é uma margem de segurança, e o plano B (que também usa a consulta) pode continuar lento
    quando a busca estiver fora do ar.
76. **Licitação excluída do PNCP** (o detalhe responde 410, "A contratação informada foi
    excluída") é marcada com a **situação 99**, um código nosso (o PNCP usa de 1 a 4), pela
    função `coletor_marcar_excluida` (só a chave de serviço). Ela continua no banco, aparece
    como "Excluída do PNCP" nas telas, entra no histórico de alterações e deixa de ser
    conferida. A resposta 410 não conta como erro da rodada.

## Decisões tomadas na etapa 8

77. **Uma conta do Google por empresa**, conectada pelo responsável e usada nas aprovações de
    qualquer membro (tabela `integracoes`, uma linha por provedor). OAuth próprio da
    integração, separado do "Entrar com Google" do Supabase; o mesmo cliente OAuth serve aos
    dois.
78. **Sem SDK do Google:** chamadas REST diretas (token, eventos da Agenda, arquivos do
    Drive), que rodam igual na Vercel e no GitHub Actions e são testadas com um Google falso.
79. **Token cifrado com chave derivada do segredo do cliente OAuth** (AES-256-GCM, HKDF).
    Evita mais um segredo para cadastrar em dois lugares; o token já seria inútil sem o
    segredo do cliente. Custo: trocar o segredo no Google obriga a reconectar.
80. **Quem escreve o quê:** conectar, configurar e desconectar são funções do banco, só para
    o dono. O membro lê a integração (o app precisa do token cifrado para agir quando ele
    aprova) e só atualiza o estado do uso (`pasta_raiz_id`, `erro`). Os vínculos
    (`integracao_vinculos`) são gravados pelo app com a sessão do membro.
81. **Reservar antes de criar.** O vínculo entra no banco como "pendente" (único por
    oportunidade, provedor e tipo) antes da chamada ao Google; é isso que impede duplicar.
    Uma reserva sem resultado há mais de 90 segundos é retomada.
82. **O evento acompanha a licitação por uma assinatura do conteúdo** (data, itens, alertas,
    situação): mudou, atualiza. A especificação pede a atualização quando a data muda; o
    resto vem junto. Se o evento foi apagado da agenda, é recriado na atualização.
83. **Sair de "aprovada" remove o evento** (desfazer ou descartar), para a agenda não ficar
    com disputa que a empresa desistiu. As pastas ficam. A especificação não trata do caso.
84. **A pasta do Drive não é renomeada nem movida quando a data muda** (o nome leva o dia e o
    mês, e ela fica na pasta do mês original): o cliente pode já ter organizado os arquivos.
85. **Título do evento e nome da pasta:** "PE" para pregão, como na especificação;
    "Dispensa" para dispensa eletrônica. Quando o número do PNCP já traz o ano ("0975/26"),
    ele não é repetido.
86. **Sincronização em dois lugares, com o mesmo código** (`src/lib/integracoes/sincronizar.ts`):
    no app, na hora, com a sessão do usuário (evento e pastas dentro da requisição; arquivos
    do edital depois da resposta, por até 45 segundos, com limite de 25 MB por arquivo); e
    no coletor (`pnpm integracoes`), a cada rodada, com a chave de serviço, para acompanhar as
    mudanças de data detectadas no PNCP e terminar os envios (limite de 150 MB por arquivo).
    Por isso as credenciais do Google ficam também no GitHub Actions.
    O link da oportunidade na descrição do evento fica gravado no vínculo: o coletor, que não
    sabe o endereço do app, reaproveita esse link. Sem isso, app e coletor montavam descrições
    diferentes e um "corrigia" o evento do outro a cada rodada (visto em produção em 25/11/2026).
87. **Acesso revogado para de insistir:** a integração guarda o erro, o coletor a ignora e a
    tela pede para conectar de novo. O botão "Sincronizar" tenta e, se der certo, limpa o erro.
88. **Agenda escolhida pelo ID** (decisão 5): em branco, a principal. O evento guarda em qual
    agenda foi criado; trocar a agenda nas preferências vale para os próximos.

## Decisões tomadas na etapa 9

89. **Agendador do e-mail diário: um workflow próprio no GitHub Actions, de hora em hora**
    (`email-diario.yml`, minuto 7), separado do coletor (que roda a cada 2 horas e pode levar
    meia hora). A hora é da empresa, no horário de Brasília; o envio sai na primeira execução
    depois dela. A chave de serviço continua só no GitHub: o app web não lê dados de outras
    empresas. A Vercel gratuita só agenda uma vez por dia, por isso não serve aqui.
90. **O que entra no e-mail:** oportunidades novas (status "nova", prioridade de 1 a 3, ainda
    por disputar, fora as revogadas, anuladas e excluídas) criadas desde o último e-mail.
    Primeiro e-mail: últimas 24 horas. Depois de dias sem envio: no máximo 72 horas, para não
    despejar um mês de uma vez. Até 15 no corpo; o resto fica no link da lista.
91. **Dia sem oportunidade nova não gera e-mail** (registro "vazio"). Escolha do Claude, a
    confirmar com o dono do projeto: e-mail vazio todo dia ensina a pessoa a ignorar o aviso.
92. **Um registro por empresa e por dia, criado antes de enviar** (`email_envios`, único por
    empresa, tipo e dia). O `criado_em` dele, no relógio do banco, fecha a janela: o que
    chegar depois fica para o dia seguinte e uma nova tentativa usa a mesma janela. Enquanto
    não termina, o registro fica como "erro" ("O envio não foi concluído."), e o agendador
    tenta de novo na hora seguinte. A chave de idempotência do Resend
    (`diario/{empresa}/{dia}/{pessoa}`) evita que alguém receba duas vezes.
93. **Duas chaves de liga e desliga:** a empresa (responsável) liga ou desliga e escolhe a hora;
    cada pessoa escolhe se recebe (`membros.recebe_email_diario`, a única coluna de `membros`
    que o próprio usuário altera). Um e-mail por pessoa, sem expor os endereços dos colegas.
94. **Resend por REST, sem SDK,** como no Google: o mesmo código roda na Vercel (convite e
    e-mail de teste) e no GitHub Actions (e-mail diário) e é testado com um Resend falso. Sem
    `RESEND_API_KEY` o app funciona e avisa. Sem domínio verificado, o Resend só entrega para
    o e-mail da própria conta: o app traduz esse erro e mantém o link do convite para copiar.
95. **O convite por e-mail não substitui o link:** o convite é criado primeiro e o link
    continua na tela; o e-mail é um acréscimo que pode falhar sem perder o convite.
96. **E-mail de teste** pelo botão em Notificações: usa a sessão de quem clicou (RLS), vai só
    para essa pessoa e não mexe no registro do dia.
97. **Excluir a conta é uma função do banco** (`excluir_conta`, com a confirmação "EXCLUIR"):
    o responsável leva a empresa junto, em cascata; o membro só sai. O app apaga antes os
    arquivos do Storage (pela lista do banco e pela pasta da empresa) e, depois, pede ao Google
    para invalidar o acesso. As outras pessoas da empresa ficam com o login, sem empresa.
    Transferir a empresa para outro responsável fica como ponto de extensão.
98. **Teste de cobertura do RLS** (`rls_z_cobertura.sql`): em vez de depender de lembrar de
    cada tabela, confere a estrutura inteira (RLS ligado, regras existentes, visitante sem
    permissão, views com `security_invoker`, funções com `search_path` fixo, regras por
    `org_id`). As mesmas consultas foram rodadas na produção em 26/11/2026, sem achados.

## Medição da etapa 10.0: texto dos editais (26/11/2026)

Antes de construir a etapa 10, medimos uma amostra real: 60 licitações abertas da área da
saúde (as 8 oportunidades da primeira empresa e 52 sorteadas), 121 arquivos do PNCP, texto
extraído com `pdftotext`. Nada foi gravado no banco.

- **Texto legível: 59 de 60 licitações.** A que faltou foi erro do próprio PNCP ao baixar
  (HTTP 422). Dos 120 arquivos baixados, 104 eram PDF, 13 ZIP (quase sempre com PDFs dentro;
  um com páginas HTML) e 3 DOCX. Só 11 arquivos eram imagem digitalizada, e em todos os casos
  outro documento da mesma licitação tinha texto.
- **A palavra "amostra" sozinha não serve de alerta:** aparece em 50 das 59 (85%), quase
  sempre em cláusula padrão ("caso o termo de referência exija", lista de infrações) ou na
  descrição de produto ("volume de amostra sanguínea").
- **Frases inteiras separam bem os casos claros.** Com regras como "será exigida amostra",
  "deverá apresentar amostra no prazo de N dias", "as amostras deverão ser entregues em" e
  "não há exigência de amostra": 18 editais (31%) exigem, 3 (5%) dizem que não exigem, 29
  (49%) só citam e 9 (15%) não citam. Lidos um a um, 16 dos 18 "exige" estavam certos e 2
  eram modelos com campo em branco; os 3 "não exige" estavam certos. Há exigência real que as
  regras não pegam (achamos uma em três editais conferidos e corrigimos a regra), então o
  grupo "só cita" continua precisando do trecho para a pessoa conferir.
- **O alerta atual (objeto e itens) erra:** marcou "amostra" em 10 das 60, nenhuma delas entre
  as que exigem, e uma em que o edital diz que não há exigência. Das 18 que exigem, não
  marcou nenhuma.
- **Comodato é um alerta bom:** 10 editais citam (17%) e, nos 7 com "em regime de comodato" e
  variações, todos tratavam de comodato de verdade. O alerta atual não marcou nenhum.
- **Visita técnica ou vistoria:** 18 citam (31%); 7 dizem que não é exigida, 2 parecem exigir
  (um deles é cláusula condicional).
- **Exclusiva ME/EPP pelo texto não compensa:** 77% dos editais citam, e o PNCP já informa o
  benefício item a item.
- **Lote:** 26% citam "lote N" ou "grupo N" no texto. Não medimos se dá para ligar itens a
  lotes; continua sem promessa.
- **Peso:** edital e termo de referência somam 1,1 MB na mediana (3,1 MB na média, 25 MB o
  maior) e 61 páginas na mediana. O texto tem 240 KB em média (65 KB comprimido); os trechos
  dos alertas, cerca de 2 KB. Baixar leva 3,7 s por licitação em média e extrair, 0,3 s.
- **Conta do banco:** guardar o texto inteiro das cerca de 1.700 licitações abertas daria
  uns 400 MB brutos, num banco que hoje tem 124 MB e limite de 500 MB. Guardar só os trechos
  dá poucos MB.

## Decisões tomadas na etapa 10

99. **Só os trechos são guardados** (decisão do dono do projeto, 26/11/2026): o texto inteiro
    do edital é lido na memória do coletor e descartado. A coluna `compras.texto_edital`,
    prevista no início e nunca usada, saiu. Consequência aceita: não dá para pesquisar dentro
    dos editais na Busca.
100. **O sistema nunca afirma que o edital não exige** (decisão do dono do projeto,
    26/11/2026). Há dois níveis: "exige" (frase clara) e "cita" (a pessoa confere). A frase
    "não há exigência de amostra" entra como citação, com o trecho na frente dos outros.
    Edital lido sem nenhuma citação não gera aviso de "nada encontrado": a ausência de alerta
    não é uma garantia. Os textos estão em `src/lib/triagem/alertas.ts` e têm teste que
    proíbe "não exige", "sem exigência" e "dispensa".
101. **A leitura é global, não por empresa:** uma linha por licitação em `compra_editais`,
    feita pelo coletor, como os outros dados do PNCP. A triagem de cada empresa não muda: os
    alertas do edital são combinados com os da triagem na hora de mostrar (lista, detalhe,
    e-mail diário e evento da agenda), pela view `oportunidades_lista`. O alerta do edital
    substitui o do mesmo tipo vindo do objeto; nenhum alerta some.
102. **Quais arquivos:** os do tipo Edital, Termo de Referência e Aviso de Contratação Direta
    (até 8, 40 MB cada). Sem nenhum deles, lê o que houver. Na medição, incluir os outros
    anexos quase não mudou o resultado.
103. **Formatos:** PDF pelo `pdftotext` (pacote `poppler-utils`), DOCX, ODT, HTML, texto puro e
    ZIP com esses formatos dentro (biblioteca `fflate`). Imagem digitalizada fica "sem texto":
    OCR está fora do MVP. Arquivo de fora não é confiável: há limite de tamanho e de
    quantidade, o endereço tem de ser `https` do `pncp.gov.br`, e o `pdftotext` roda sem as
    variáveis de ambiente do coletor (onde está a chave de serviço).
104. **Regras por frase, com versão** (`src/lib/edital/regras.ts`, `VERSAO_DAS_REGRAS`): as
    mesmas da medição. Quando a versão sobe, os editais abertos são relidos. Visita técnica
    nunca sobe para "exige": na medição, as frases que pareciam exigir eram condicionais.
105. **Quando relê:** arquivo novo na licitação (a assinatura da lista de arquivos muda), regra
    nova ou falha anterior (até 5 tentativas, com 3 horas de intervalo). Só licitações
    abertas, dos segmentos atendidos; primeiro as que já são oportunidade de alguma empresa.
106. **Falha do PNCP não apaga o que se sabia:** se nada foi baixado e já havia uma leitura boa,
    os alertas dela ficam. Três licitações seguidas sem nenhum arquivo entregue param o passo
    (o PNCP está fora do ar) e essas falhas não contam como tentativa.
107. **Passo próprio no workflow do coletor** (`pnpm editais`, depois da triagem e antes das
    integrações), com 10 minutos por rodada; o que não couber fica para a próxima. A entrada
    `editais_minutos` do disparo manual serve para a primeira carga.
108. **Lote continua fora:** não medimos se o texto do edital permite ligar itens a lotes.

## O que a API do PNCP mostrou (conferido em 22/11/2026)

- **Busca** (`/api/search/`): aceita `modalidades=6|8` e `ufs=PR|SC`; devolve
  `numero_controle_pncp`, `orgao_cnpj`, `ano`, `numero_sequencial`, `uf`, `situacao_id`,
  `data_fim_vigencia` (igual à `dataEncerramentoProposta`), `description` (objeto) e
  `valor_total_estimado`.
- **Consulta** (`/api/consulta/v1/contratacoes/proposta` e `/orgaos/{cnpj}/compras/{ano}/{seq}`):
  página de no máximo 50; campos `objetoCompra`, `dataEncerramentoProposta`,
  `situacaoCompraId`, `unidadeOrgao.ufSigla`.
- **Datas** vêm sem fuso, no horário de Brasília.
- **Instabilidade:** no dia do desenvolvimento a API principal (`/api/pncp/v1`, itens e
  arquivos) ficou horas devolvendo 503, e houve respostas vazias e timeouts esporádicos.

- **Itens** (`/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens`), conferidos em
  23/11/2026 na primeira rodada real (59 mil itens): `numeroItem`, `descricao`, `quantidade`,
  `unidadeMedida`, `valorUnitarioEstimado`, `valorTotal`, `tipoBeneficio` (1 = exclusivo
  ME/EPP, 3 = cota reservada, 4 = sem benefício, 5 = não se aplica) e
  `situacaoCompraItemNome`. O `numeroItem` nem sempre é 1, 2, 3: alguns sistemas mandam um
  identificador grande.
- **Lote/grupo não existe na API de itens.** Nenhum dos 59 mil itens trouxe esse campo. Para
  o alerta de "lote incompleto" (etapa 5) restam a descrição do item, que em poucos casos
  cita "LOTE 1", e o texto do edital (etapa 10).
- **Arquivos** (`.../arquivos`): `sequencialDocumento`, `titulo`, `tipoDocumentoNome`, `url`.
- **A busca derruba conexões ao acaso.** Nas rodadas reais de 22/11/2026, 73 e depois 91
  de 294 termos falharam. Um teste com a mesma consulta repetida mostrou cerca de 65% das
  conexões cortadas em menos de meio segundo (`UND_ERR_SOCKET`, também com `curl`), sem
  relação com o termo nem com o ritmo. Com 4 tentativas, a chance de um termo falhar era
  de uns 18%; com 10, cai para perto de 1%. Por isso o cliente conta as quedas de conexão
  à parte (até 10 tentativas, espera de 0,5 s a 4 s) das falhas lentas (tempo esgotado,
  429 e 5xx: até 4 tentativas, espera crescente), a busca usa 2 chamadas simultâneas e os
  termos que ainda falharem são repetidos no fim, um por vez.
- **Escala:** os 221 termos que responderam acharam 1.533 editais abertos com disputa em
  até 30 dias.
