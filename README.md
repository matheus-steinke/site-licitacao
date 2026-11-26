# Licita Saúde (nome provisório)

SaaS de prospecção e triagem de licitações do PNCP para distribuidores da área da saúde.
Triagem 100% sem IA neste MVP: regras, palavras-chave, medidas e similaridade de texto.

- Especificação: [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md)
- Arquitetura, plano em etapas e decisões aprovadas: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## Situação

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Base: projeto, banco com RLS, login, menu, seed, páginas LGPD | Pronta |
| 2 | Onboarding, Configurações, usuários, admin de segmentos | Pronta |
| 3 | Catálogo e importação de Excel/CSV | Pronta |
| 4 | Coletor do PNCP | Pronta |
| 5 | Triagem e Oportunidades | Pronta |
| 6 | Busca | Pronta |
| 7 | Dashboard | Pronta |
| 8 | Integrações Google Agenda e Drive | Pronta |
| 9 | E-mail diário, convite por e-mail, excluir conta, testes de RLS completos | Pronta |
| 10 | Opcional: texto do edital para alertas | A fazer |
| 11 | Monitoramento das licitações (chat do pregão, convocações, resultado) | Plano aprovado em 26/11/2026; começa pela validação: [`docs/MONITORAMENTO.md`](docs/MONITORAMENTO.md) |

## Stack

- Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind 4 + shadcn/ui
- Supabase: Postgres com Row Level Security, Auth e Storage
- Vercel (app) e GitHub Actions (coletor, a partir da etapa 4)

## Rodar local

Pré-requisitos: Node 22+ e pnpm 10+.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Preencha `.env.local` com a URL e a chave *publishable* do projeto Supabase
(Project Settings > API). Depois:

```bash
pnpm dev
```

O app abre em http://localhost:3000.

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Endereço do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | Chave pública do Supabase (a segurança vem do RLS) |
| `NEXT_PUBLIC_SITE_URL` | não | Endereço público do app nos links de e-mail; em branco usa o da requisição |
| `GOOGLE_CLIENT_ID` | para a integração | ID do cliente OAuth do Google (veja a seção Integrações) |
| `GOOGLE_CLIENT_SECRET` | para a integração | Chave secreta do cliente OAuth. Segredo: só no servidor (Vercel) e no GitHub Actions |
| `RESEND_API_KEY` | para os e-mails | Chave da API do Resend (veja a seção E-mails). Segredo: só no servidor (Vercel) e no GitHub Actions |
| `EMAIL_REMETENTE` | não | Remetente dos e-mails, de um domínio verificado no Resend: `Nome <avisos@seu-dominio.com.br>` |
| `SITE_URL` | só no agendador | Endereço público do app nos links do e-mail diário e dos eventos da agenda |

Nenhum segredo vai para o git: `.env*` está no `.gitignore`, exceto `.env.example`.
A chave `service_role` do Supabase nunca é usada no app web; ela só entra no coletor (etapa 4),
como segredo do GitHub Actions.

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build e servidor de produção |
| `pnpm lint` / `pnpm typecheck` | ESLint e checagem de tipos |
| `pnpm test` | Testes unitários (Vitest) |
| `pnpm test:db` | Aplica migrations e seed num Postgres local descartável e testa as regras de RLS |
| `pnpm coletor` | Roda uma rodada do coletor do PNCP (veja a seção Coletor) |
| `pnpm triagem` | Compara as licitações com o catálogo de cada organização (veja a seção Triagem) |
| `pnpm integracoes` | Sincroniza Google Agenda e Drive de cada organização (veja a seção Integrações) |
| `pnpm email-diario` | Envia o e-mail diário das empresas que estão na hora (veja a seção E-mails) |

`pnpm test:db` precisa de um Postgres 15+ local com as extensões `pg_trgm` e `unaccent`
e de um usuário com permissão para criar bancos. Ele usa
[`supabase/tests/shim_supabase.sql`](supabase/tests/shim_supabase.sql) para imitar os papéis
e o `auth.uid()` do Supabase.

## Banco de dados

- Migrations em [`supabase/migrations`](supabase/migrations), na ordem do nome do arquivo.
- [`supabase/seed.sql`](supabase/seed.sql): 9 licitações **fictícias** (marcadas `exemplo = true`)
  para testar sem esperar o coletor. Pode ser aplicado mais de uma vez sem duplicar.
- Tipos TypeScript em [`src/lib/supabase/tipos.ts`](src/lib/supabase/tipos.ts): gere de novo
  depois de cada migration.

Aplicar num projeto Supabase novo: rode cada migration e depois o seed no SQL Editor do
Supabase, ou use a CLI:

```bash
supabase link --project-ref SEU_PROJECT_REF
```

```bash
supabase db push
```

As licitações de exemplo deixam de aparecer para os clientes assim que o coletor grava a
primeira licitação real. Para apagá-las do banco:

```sql
delete from public.compras where exemplo;
delete from public.orgaos where cnpj like '99%';
```

### Tornar um usuário ADMIN da plataforma

Depois que o usuário se cadastrar no app, rode no SQL Editor do Supabase:

```sql
insert into public.admins_plataforma (user_id)
select id from auth.users where email = 'seu-email@exemplo.com';
```

O item "Admin" aparece no menu desse usuário no próximo carregamento.

### Regras de acesso (RLS)

Dados globais:

| Tabela | Visitante | Usuário logado | Admin da plataforma | Coletor (service role) |
|---|---|---|---|---|
| `segmentos` | nada | lê | lê e edita | tudo |
| `orgaos`, `compra_itens`, `compra_arquivos` | nada | lê | lê | tudo |
| `compras` | nada | lê só as da área da saúde | lê todas | tudo |
| `compra_item_segmentos`, `compra_alteracoes` | nada | lê | lê | tudo |
| `coletor_rodadas`, `coletor_erros` | nada | nada | lê | tudo |
| `admins_plataforma` | nada | vê só a própria linha | vê só a própria linha | tudo |

Dados por organização (um usuário só enxerga a própria organização):

| Tabela | Membro | Responsável (dono) | Admin da plataforma |
|---|---|---|---|
| `organizacoes` | lê | lê e altera (menos o `plano`) | lê todas |
| `membros` | lê; altera só a própria preferência de e-mail | idem, e remove outros membros | lê todos |
| `convites` | nada | lê, cria e cancela | nada |
| `organizacao_segmentos` | lê | lê e altera | lê todos |
| `produtos`, `organizacao_exclusoes` | lê e altera | lê e altera | nada |
| `produto_arquivos` | lê, inclui e exclui | lê, inclui e exclui | nada |
| `importacoes` | lê e registra | lê e registra | nada |
| `oportunidades`, `oportunidade_itens` (e as views `oportunidades_lista` e `oportunidades_aprovadas`) | lê | lê | nada |
| `buscas_salvas` | lê, salva e exclui | lê, salva e exclui | nada |
| `integracoes` | lê e registra o estado do uso | conecta, configura e desconecta (por função) | nada |
| `integracao_vinculos` | lê e grava | lê e grava | nada |
| `email_envios` | lê | lê | nada |
| Storage `produtos` (arquivos) | só a pasta da própria organização | idem | nada |

Criação de organização e aceite de convite passam por funções do banco
(`criar_organizacao`, `aceitar_convite`), que conferem o usuário logado. Ninguém insere
direto nessas tabelas.

As oportunidades também só mudam por função do banco: `triagem_gravar` (o resultado da
triagem, chamado pelo coletor ou por um membro da organização) e `decidir_oportunidade`
(aprovar, descartar, reabrir, ganha/perdida). Um membro só tria e decide na própria organização.

A exclusão da conta também é uma função do banco (`excluir_conta`), que só age sobre quem está
logado. O registro dos e-mails (`email_envios`) só é gravado pelo agendador.

Além dos testes de cada tabela, [`supabase/tests/rls_z_cobertura.sql`](supabase/tests/rls_z_cobertura.sql)
confere a estrutura inteira, para uma tabela nova não entrar sem proteção: toda tabela tem RLS
ligado e pelo menos uma regra, o visitante não tem permissão em nenhuma tabela nem executa
nenhuma função, as views respeitam as regras de quem consulta, as funções com privilégio fixam
o `search_path` e toda regra de tabela com `org_id` confere o usuário.

## Organizações e usuários

- No primeiro acesso o usuário passa pelo onboarding: empresa, estados, segmentos e tabela de
  preços (a importação da tabela chega na etapa 3). Quem cria a organização é o responsável.
- Neste MVP cada usuário pertence a uma única organização, e cada CNPJ a uma única
  organização. O CNPJ é validado pelos dígitos verificadores, inclusive no formato
  alfanumérico.
- **Convites:** em Configurações > Usuários, o responsável informa o e-mail da pessoa. O app
  envia o convite por e-mail (seção E-mails) e também mostra o link de cadastro, para copiar
  se o e-mail não chegar ou se o envio não estiver configurado. Quem entrar com aquele
  e-mail, já confirmado, vê o convite e aceita. Convites valem 14 dias.
- Só o responsável altera dados da empresa, estados, segmentos e usuários. Os membros
  consultam.

## Catálogo e tabela de preços

Menu **Catálogo**, disponível para qualquer usuário da empresa:

- **Produtos:** lista com busca (ID, referência, produto, marca), inclusão, edição e exclusão.
  Obrigatórios: ID, referência, produto, preço proposta e lance mínimo. Opcionais: segmento,
  palavras-chave/sinônimos, medidas, marca, fabricante e registro ANVISA.
- **Importar tabela:** aceita `.xlsx` e `.csv` (separado por ponto e vírgula ou vírgula, em
  UTF-8 ou no padrão do Excel brasileiro). Há modelos para download nos dois formatos.
  - A planilha é lida no navegador e mostrada numa prévia linha a linha antes de gravar.
  - Colunas são reconhecidas pelo título, em qualquer ordem, sem ligar para acentos; colunas
    desconhecidas são ignoradas e avisadas.
  - Preços aceitam vírgula ou ponto (`1.234,56`, `1234.56`, `R$ 98,5`).
  - **Erros** (a linha não entra): campo obrigatório vazio, preço que não é número, ID
    repetido na planilha (nenhuma das linhas repetidas entra).
  - **Avisos** (a linha entra): lance mínimo maior que o preço, preço zero, segmento não
    reconhecido, número ambíguo como `1.234`.
  - **Atualizar pelo ID** inclui os novos e atualiza os existentes. **Substituir tudo** também
    exclui o que não está na planilha, depois de uma confirmação com a quantidade.
  - Ao final, relatório do que foi incluído, alterado, ficou sem mudança, foi excluído e deu
    erro, com download da lista de linhas com problema. As últimas importações ficam na tela.
  - Limites: 5.000 produtos e 10 MB por arquivo. A gravação é uma transação só: ou entra
    tudo o que é válido, ou nada.
- **Arquivos por produto:** PDF, PNG ou JPG de até 20 MB (catálogo técnico, registro ANVISA,
  outro). O arquivo vai direto do navegador para o Supabase Storage (bucket privado
  `produtos`, pasta `{organização}/{produto}/`), e o download usa um link temporário de 60
  segundos. Excluir o produto apaga os arquivos dele.
- **Exclusões:** termos que a empresa não fornece (um por linha). Serão usados na triagem
  (etapa 5): item de licitação com o termo não casa com o catálogo.

O bucket `produtos` e as regras de acesso dele são criados pela migration do catálogo.
Bibliotecas de planilha: `read-excel-file`, `write-excel-file` e `papaparse` (em vez do
pacote `xlsx` do npm, que está parado numa versão com vulnerabilidades conhecidas).

## Coletor do PNCP

O coletor é um script Node/TypeScript ([`coletor/`](coletor)) que roda a cada 2 horas pelo
GitHub Actions ([`.github/workflows/coletor.yml`](.github/workflows/coletor.yml)). Ele é
global: coleta uma vez e todos os clientes enxergam.

### O que cada rodada faz

1. **Descobre editais** pela busca do PNCP, com as palavras-chave de todos os segmentos
   ativos (cada termo entre aspas), só Pregão Eletrônico e Dispensa, só "recebendo proposta".
   Ficam os que têm disputa de hoje até hoje + 30 dias.
2. **Baixa os itens** de cada edital novo e compara cada item com os segmentos (palavras-chave,
   sinônimos e exclusões). Só entra para os clientes o edital com **pelo menos um item da
   saúde**; os demais ficam marcados como descartados, sem itens, apenas para não serem
   baixados de novo. Dos que entram, baixa também a lista de arquivos.
3. **Atualiza o que já conhece:** situação e data mudam? Grava o histórico em
   `compra_alteracoes` (adiada, suspensa, revogada). Editais que sumiram da busca de
   "recebendo proposta" são conferidos pelo **número de controle**, na mesma busca, 20 por
   chamada: ela devolve a licitação em qualquer situação. O que a busca não conhece vai ao
   endpoint de detalhe; se ele responder que a contratação foi excluída (410), a licitação
   fica marcada como **"Excluída do PNCP"** e não é mais conferida.
4. **Registra a rodada** em `coletor_rodadas` e cada falha em `coletor_erros`. O painel
   Admin > Rodadas do coletor mostra tudo.

Cuidados com o PNCP, que cai com frequência:

- Pausa de 300 ms entre chamadas, tempo limite de 30 s, no máximo 4 em paralelo (2 na
  busca).
- **Conexão derrubada:** em noites ruins a busca do PNCP corta cerca de 2 em cada 3
  conexões, ao acaso e em menos de meio segundo. Como a falha é rápida, o coletor insiste
  até 10 vezes com espera curta (de 0,5 s a 4 s).
- **Falhas lentas** (tempo esgotado, 429, 5xx): até 4 tentativas, com espera crescente a
  partir de 1,5 s. As duas contagens são separadas: quedas de conexão não gastam as
  tentativas das falhas lentas.
- Termos que ainda assim falham na busca ganham uma segunda passada no fim, um por vez.
- **Limite de requisições da API de consulta** (detalhe e plano B): ela responde 429 a quem
  chama muito, e a partir do GitHub Actions recusava quase tudo. Por isso tem fila própria
  (1,2 s entre chamadas), espera longa depois de um 429 (5 s, 10 s, 20 s) e, depois de três
  recusas seguidas, a rodada para de chamar o detalhe e avisa no resumo.
- **Plano B:** se a busca estiver fora do ar, lista todas as contratações com proposta aberta
  (`/api/consulta/v1/contratacoes/proposta`) e filtra pelo objeto. É mais pesado e menos
  preciso (não enxerga os itens antes de baixar), por isso só entra quando a busca falha.
- **Itens fora do ar:** depois de 5 falhas seguidas o coletor para de insistir, guarda os
  editais como pendentes (invisíveis para os clientes) e tenta de novo na rodada seguinte.
- Sem duplicar: a chave é o Controle PNCP (`{cnpj}-1-{sequencial com 6 dígitos}/{ano}`), e a
  gravação de cada edital é uma transação (`coletor_gravar_compra`).
- Limites por rodada: 1.500 editais com itens baixados e 45 minutos. O que sobrar fica para
  a seguinte, começando pelas disputas mais próximas.
- A busca pode usar no máximo 60% do tempo da rodada (27 minutos). Se o PNCP estiver lento e
  o tempo acabar, o coletor segue para os itens com o que já achou e avisa quantos termos
  ficaram para a rodada seguinte. A lista de termos começa de um ponto diferente a cada
  rodada, para que os termos cortados não sejam sempre os mesmos.
- O painel mostra o andamento dentro da busca ("buscando termos no PNCP: 125 de 294").

Uma rodada **parcial** (parte das chamadas falhou) não é falha: o que faltou entra na
próxima. Só termina como **erro** quando não consegue consultar o PNCP de jeito nenhum.

### Retenção: itens antigos são apagados

Quase todo o espaço do banco é ocupado pelos itens das licitações (cerca de 12 mil por dia).
Para caber no plano gratuito do Supabase (500 MB), ao fim de cada rodada o coletor apaga os
itens das licitações que atendem às duas condições:

- a disputa terminou há mais de **30 dias**;
- nenhuma organização aprovou a licitação (nem a marcou como ganha ou perdida).

O que **não** é apagado: a licitação em si (órgão, objeto, datas, situação, arquivos), as
oportunidades e as decisões de cada cliente, e os itens das licitações aprovadas (o
Dashboard depende deles). Na página de uma licitação limpa, no lugar da lista de itens
aparece um aviso com o link do PNCP. Se a disputa for remarcada para a frente, os itens são
baixados de novo.

Para mudar o prazo, crie a variável `COLETOR_DIAS_DE_RETENCAO` em Settings > Secrets and
variables > Actions > Variables (por exemplo `20`; mínimo `15`; `0` desliga a limpeza). Com 30
dias o banco estabiliza perto de 350 MB e depois cresce devagar (uns 20 MB por mês, dos
cabeçalhos das licitações): o plano gratuito deve durar de 6 a 8 meses. Com 90 dias não
caberia (cerca de 785 MB). A conta está na decisão 67 de `docs/ARQUITETURA.md`.

### Configurar o agendamento (uma vez)

No GitHub, em Settings > Secrets and variables > Actions do repositório:

1. Aba **Secrets** > New repository secret: `SUPABASE_SERVICE_ROLE_KEY`, com a chave
   `service_role` (ou "secret key") do Supabase, em Project Settings > API Keys. Essa chave
   ignora o RLS: nunca a coloque no código, no `.env.example` nem na Vercel.
2. Aba **Variables** > New repository variable: `SUPABASE_URL`, com
   `https://SEU-PROJETO.supabase.co`.

Depois, em Actions > Coletor do PNCP > Run workflow, dispare a primeira rodada. Para um teste
rápido, preencha "termos" com 5. Marque "Pular a coleta" para só refazer a triagem das
organizações, sem consultar o PNCP.

Atenção: em repositório público, o GitHub desativa workflows agendados após 60 dias sem
atividade no repositório. Basta reativar em Actions.

### Rodar na sua máquina

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_SERVICE_ROLE_KEY=... pnpm coletor --manual --termos 5
```

Opções: `--fonte busca|plano_b`, `--termos N` (só os N primeiros termos) e
`--simular segmentos.json` (não grava nada; lê os segmentos de um arquivo JSON). Ajustes por
variável de ambiente: `COLETOR_PAUSA_MS`, `COLETOR_PARALELAS`, `COLETOR_PARALELAS_BUSCA`,
`COLETOR_MAX_COMPRAS`, `COLETOR_MINUTOS` e `COLETOR_DIAS_DE_RETENCAO`.

### Quando um segmento é editado

Cada edital guarda com qual regra foi classificado (os termos de todos os segmentos mais a
versão do casamento de texto). Se você editar um segmento em Admin > Segmentos, a rodada
seguinte percebe a diferença, baixa de novo os itens dos editais abertos e reclassifica
tudo, inclusive o que tinha sido descartado. Com muitos editais isso leva mais de uma
rodada (limite de 1.500 por rodada); até lá vale a classificação anterior.

Para saber se falta vocabulário, veja em Admin > Rodadas do coletor quantos editais foram
descartados. Na primeira rodada real, 22 de 78 descartados eram da saúde e usavam nomes que
nenhum segmento conhecia; eles entraram como sinônimos na migration
`segmentos_vocabulario`. Odontologia não faz parte dos segmentos e é descartada.

### Casamento de texto (sem IA)

O mesmo código ([`src/lib/texto`](src/lib/texto)) serve ao coletor e à triagem:
minúsculas, sem acento, sem pontuação, sem preposições, no singular e sem a vogal final
(para "endoscópio" e "endoscopia" ou "cirúrgico" e "cirúrgica" contarem como iguais).

- Na **descrição de um item**, um termo casa quando todas as palavras dele aparecem
  inteiras, em qualquer posição. Muitos órgãos descrevem no formato do catálogo federal
  ("SERINGA - ADICIONAL: GRADUADA; ...; ESTERILIDADE: ESTÉRIL, DESCARTÁVEL"), com as
  palavras longe umas das outras.
- Em **textos longos** (o objeto, no plano B), as palavras precisam estar próximas, para não
  juntar pedaços de assuntos diferentes.
- Sempre palavras inteiras: "uti" não casa com "utilizado".

## Triagem e Oportunidades

A triagem compara **cada item** das licitações dos estados da empresa com o catálogo dela,
sem IA. O código fica em [`src/lib/triagem`](src/lib/triagem) e é o mesmo no coletor, no app
e nos testes.

### O que vira oportunidade

Uma licitação da área da saúde, com disputa futura, nos estados da empresa, que tenha:

1. **item compatível com o catálogo** (aparece primeiro);
2. ou **item a verificar** (casou em parte, ou a medida é diferente);
3. ou só **item de um segmento de interesse** da empresa.

Quem marcou só "Urologia" não vê licitação de seringas, a não ser que algum item dela case
com um produto do catálogo.

### Como um item casa com um produto

- **Do nome do produto** saem as palavras que o definem. Marca, fabricante, registro e frases
  de embalagem ("DESCARTÁVEL. ESTÉRIL. ATÓXICO...") ficam de fora. De
  `KIT CATETER DUPLO J SOFT 4.7FR X 26CM MARCA: X / FABRICANTE: Y` ficam "kit, cateter, duplo, j, soft".
- **O item precisa ser do mesmo tipo do produto:** a primeira palavra da descrição do item tem
  de estar no nome do produto. "SONDA de aspiração flexível" não casa com "BAINHA para
  aspiração flexível", e "cateter intravenoso com agulha" não casa com "agulha de punção".
- **Palavras-chave do produto** (coluna opcional da tabela de preços) valem mais que o nome:
  se o item contém a palavra-chave inteira, o texto casa 100%. Use para sinônimos que o
  edital usa e o seu nome não ("alça de ressecção" para um produto chamado "alça TURP loop").
- **Medidas** são lidas dos dois lados: French ("6Fr", "CH 6", "calibre: 18"), cm, mm, µm,
  ml, polegadas do fio guia ("0,035\""), gauge e faixas ("22-30 cm", "26 a 28 cm"), inclusive
  "6 x 26" sem unidade. Medida igual (com tolerância) confirma; **medida diferente nunca é
  compatível**: o item fica para verificar, com a diferença explicada ("pede 7 Fr; produto 6 Fr").
- **Erros de digitação** são tolerados pela semelhança de escrita (trigramas, o mesmo
  princípio do `pg_trgm`).
- **Exclusões** (Catálogo > Exclusões) tiram o item do catálogo e do segmento.

O score vai de 0 a 100. Os limites ficam em **Configurações > Triagem** (padrão: 60 para
compatível, 50 para verificar).

### Alertas

| Alerta | Quando aparece |
|---|---|
| Exclusivo ME/EPP – repassar a parceiro | item exclusivo e a empresa não é ME/EPP (o item não é descartado) |
| Exclusivo ME/EPP | item exclusivo e a empresa é ME/EPP |
| Referência abaixo do seu mínimo | valor de referência do edital menor que o lance mínimo do produto |
| Lote completo / incompleto (faltam itens X, Y) | a descrição dos itens começa com "LOTE n", "GRUPO n" ou "(Ln)" |
| Cita amostra, comodato, visita técnica; licitação exclusiva ME/EPP | palavra no objeto do edital |

O PNCP não informa o lote de cada item (veja `docs/ARQUITETURA.md`): o alerta de lote só
existe quando o órgão escreve o lote na descrição. O texto do edital (etapa 10) vai ampliar isso.

### Quando a triagem roda

- **Depois de cada rodada do coletor**, no mesmo workflow do GitHub Actions (`pnpm triagem`),
  para todas as organizações: só as licitações novas ou alteradas desde a última vez.
- **No app, ao abrir Oportunidades**, se a empresa mudou catálogo, exclusões, segmentos,
  estados, porte ou limites: a tela compara tudo de novo em lotes e mostra o andamento.
  Decisões já tomadas (aprovada, descartada) são mantidas.

Para rodar à mão: `pnpm triagem` (todas as organizações) ou `pnpm triagem --org <id>`, com as
mesmas variáveis do coletor (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`).

### Se aparecer coisa demais ou de menos

Na calibração com 117 mil itens reais, quase todo engano veio de **nomes genéricos** no
catálogo ("FRASCO COLETOR", "FIO GUIA"), que casam com itens de outras áreas (coletor de
laboratório, fio guia de intubação). O que resolve, na ordem:

1. **Exclusões:** inclua os termos que não são seus ("intubação", "dreno de tórax", "laboratório").
2. **Palavras-chave no produto:** para o que o edital chama por outro nome.
3. **Limites do score:** suba o de "verificar" para ver menos, desça para ver mais.

### Itens dos seus segmentos, pintados

Cada segmento de interesse da empresa tem **uma cor**, a mesma em todas as telas. No cartão
da lista, cada segmento presente na licitação aparece numa etiqueta colorida com a
quantidade de itens ("Urologia/Endourologia · 14 itens").

Na página de detalhe, os itens que pertencem aos segmentos de interesse da empresa aparecem
pintados, com **uma cor por segmento**, uma faixa na borda e uma etiqueta com o nome do
segmento. Uma legenda mostra quantos itens há de cada um, e o botão "Só dos meus segmentos"
esconde o resto. Itens que a empresa excluiu (Catálogo > Exclusões) não são pintados. As
cores ficam em [`src/lib/segmentos-cores.ts`](src/lib/segmentos-cores.ts).

### Situações de uma oportunidade

Nova → Aprovada (agendada) ou Descartada (com motivo). Depois da data da disputa, a aprovada
aparece como **Disputada** (não é um status gravado) e pode ser marcada como Ganha ou
Perdida. Tudo pode ser desfeito.

## Busca

A tela de Busca pesquisa em **todas** as licitações da área da saúde coletadas do PNCP, não
só nas oportunidades da empresa.

- **Palavra-chave:** procura no objeto e na descrição dos itens. Todas as palavras precisam
  aparecer no mesmo item (ou no objeto). Acento e maiúsculas não importam, e a palavra vale
  pelo começo: "cateter" acha "cateteres", "uretero" acha "ureteroscópio". Palavras de
  ligação ("de", "para", "com") são ignoradas. Cada resultado mostra quantos itens têm o
  termo e até três deles.
- **Filtros:** estados (padrão: os da empresa), segmentos, período da disputa (padrão: de
  hoje em diante), modalidade, situação no PNCP e "só com itens do meu catálogo". Nenhum
  estado ou segmento marcado vale como todos.
- **Só com itens do meu catálogo** usa a triagem, que é feita nas licitações dos estados da
  empresa com disputa futura. Em outros estados o filtro não encontra nada.
- **Buscas salvas:** guardam a palavra-chave e os filtros com um nome, para todos os
  usuários da empresa (até 30). "De hoje em diante" continua valendo como hoje no dia em
  que a busca salva é aberta.
- **Abrir detalhes:** se a licitação é uma oportunidade da empresa, abre a página da
  oportunidade. Senão, abre a mesma página sem as ações e sem os itens do catálogo, com os
  itens dos segmentos da empresa pintados.

Os filtros ficam no endereço da página (`/busca?q=...&ufs=SC`), então um link de busca pode
ser copiado e enviado a um colega.

No banco, a busca usa um índice de texto do Postgres (`to_tsvector` com as palavras sem
acento) na descrição dos itens e no objeto. A função `buscar_licitacoes` roda com as
permissões de quem chama: uma empresa nunca vê as oportunidades de outra.

A **busca do catálogo** também deixou de diferenciar acentos: "canula" acha "CÂNULA".

## Dashboard

O Dashboard mostra só as licitações que a empresa **aprovou** em Oportunidades.

- **Licitações disputadas:** aprovadas (ou marcadas como ganha ou perdida) com a data da
  disputa já passada.
- **Licitações agendadas:** aprovadas com a disputa ainda por acontecer.
- **Valor estimado em disputa:** nas agendadas, a soma de quantidade do item × **lance mínimo**
  do produto vinculado, da tabela de preços da empresa. Só entram os itens "compatível"; os
  "verificar" ficam de fora. Não é o valor de referência do edital. Como o cálculo é feito na
  hora, mudar o lance mínimo no Catálogo muda o valor.
- **Período:** filtra pela data da disputa e vale para os cartões, os gráficos e a lista.
  Atalhos: últimos 12 meses (padrão, do começo do mês de 11 meses atrás em diante), este mês,
  este ano e tudo; ou datas livres. A tela escreve o período por extenso.
- **Gráficos:** licitações por mês da disputa e por estado, com disputadas e agendadas em
  cores diferentes. Passar o mouse (ou focar com o teclado) mostra os números, e "Ver em
  tabela" abre os mesmos dados em tabela.
- **Próximas disputas:** as agendadas do período, da mais próxima para a mais distante, com
  o valor pelo lance mínimo de cada uma.

Uma agendada que o PNCP mostra como suspensa, revogada ou anulada continua na conta enquanto
estiver aprovada; a tela avisa quantas são. Para tirá-la, desfaça a aprovação na página da
licitação. A regra dos números está em [`src/lib/dashboard/resumo.ts`](src/lib/dashboard/resumo.ts)
e a consulta, na view `oportunidades_aprovadas`.

## Painel ADMIN

Disponível para quem está em `admins_plataforma`, pelo item "Admin" do menu:

- **Segmentos:** nome, ordem, ativo, palavras-chave, sinônimos e exclusões (um termo por
  linha; vírgula não separa termos, por causa de medidas como "0,035"). Segmento escolhido
  por alguma organização não pode ser excluído, só desativado.
- **Organizações:** empresas cadastradas, com porte, plano, estados, segmentos e usuários.
- **Rodadas do coletor:** as últimas rodadas com situação, duração, fonte (busca ou plano
  B) e contagens; cada rodada abre a lista de erros. No topo, quantas licitações da saúde
  estão no banco, quantas aguardam itens e quantas foram descartadas.

## Configurar o login no Supabase

No painel do Supabase, em **Authentication**:

1. **URL Configuration**
   - *Site URL*: o endereço público do app (ex.: `https://site-licitacao.vercel.app`).
   - *Redirect URLs*: adicione `https://SEU-DOMINIO/auth/callback`,
     `https://SEU-DOMINIO/auth/confirm` e, para desenvolvimento,
     `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/confirm`.
2. **E-mails de confirmação**
   - O servidor de e-mail padrão do Supabase só envia para os endereços dos membros da
     organização no Supabase e tem limite baixo por hora. Para testar com outros e-mails,
     configure um SMTP próprio (o do Resend serve: veja a seção E-mails) ou desligue
     temporariamente *Confirm email* em Sign In / Providers > Email.
   - Recomendado: em Email Templates, troque o link de "Confirm signup" por
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` e o de
     "Reset password" por
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
     Assim o link funciona mesmo aberto em outro navegador ou aparelho. Sem essa troca, o
     link padrão continua funcionando no mesmo navegador em que o cadastro foi feito.
3. **Login com Google** (Sign In / Providers > Google)
   - No Google Cloud Console, crie um projeto, configure a tela de consentimento OAuth e
     crie uma credencial "ID do cliente OAuth" do tipo "Aplicativo da Web".
   - Em "URIs de redirecionamento autorizados", informe
     `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
   - Copie o Client ID e o Client Secret para o provedor Google no Supabase e ative-o.
   - O login usa só os escopos básicos (e-mail e perfil), que não exigem verificação do
     Google. Os escopos de Agenda e Drive são pedidos à parte, pela integração (seção
     Integrações). O mesmo cliente OAuth serve para os dois.
   - Enquanto isso não for feito, o botão "Entrar com Google" mostra um aviso e o login por
     e-mail e senha funciona normalmente.

## Deploy na Vercel

1. Importe o repositório do GitHub na Vercel (framework Next.js, detectado sozinho).
2. Em Settings > Environment Variables, cadastre `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para Production e Preview. Para as integrações e os
   e-mails, cadastre também `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `RESEND_API_KEY`
   (seções Integrações e E-mails). Variável nova só vale depois de um novo deploy.
3. Faça o deploy. A região das funções é São Paulo (`gru1`, definida em `vercel.json`),
   a mesma do banco.
4. Coloque o endereço gerado em *Site URL* e *Redirect URLs* no Supabase (seção acima).

Cada push no branch de produção publica uma nova versão.

## Integrações

A área Integrações liga a empresa a serviços externos. O Google (Agenda e Drive) é o único
provedor implementado. Outlook/Microsoft 365, WhatsApp e webhook aparecem como "em breve": o
banco e o código já têm o lugar deles (coluna `provedor` e
[`src/lib/integracoes/provedores.ts`](src/lib/integracoes/provedores.ts)).

### O que a integração com o Google faz

Uma conta do Google por empresa, conectada pelo responsável. Com ela conectada, **ao aprovar
uma oportunidade** (ou pelo botão "Sincronizar", na página da licitação):

- **Agenda:** cria o evento `PE <nº>/<ano> - <Órgão>` na agenda escolhida, com início na hora
  da disputa e 1 hora de duração. A descrição traz os itens compatíveis com as quantidades e
  o produto sugerido, os itens a verificar, os alertas, o link do PNCP e o link da
  oportunidade. Dispensa sai como `Dispensa <nº>/<ano> - <Órgão>`.
- **Drive:** dentro de uma pasta principal (nome configurável, padrão "Licitações"), cria
  `<Mês AAAA>/PE <nº>.<ano> - <Órgão> DD.MM`, com as subpastas `0. Planejamento`,
  `1. Edital e Anexos`, `2. Habilitação`, `3. Proposta atualizada` e `4. Resultados`, e salva
  os arquivos do PNCP em `1. Edital e Anexos`.

Regras:

- **Não duplica.** Antes de criar qualquer coisa no Google, o app reserva o vínculo no banco
  (`integracao_vinculos`, um evento e uma pasta por oportunidade).
- **Se a data da disputa mudar** (ou os itens, os alertas, a situação), o evento é atualizado.
  A pasta do Drive não é renomeada nem movida.
- **Desfazer a aprovação ou descartar** tira o evento da agenda. As pastas ficam, porque
  podem ter documentos. Marcar como ganha ou perdida não mexe em nada.
- **Arquivos do edital:** o evento e as pastas aparecem na hora; os arquivos sobem logo
  depois da resposta. O que não couber no tempo da requisição (ou passar de 25 MB) é enviado
  pelo coletor, na rodada seguinte. Um arquivo que falha é tentado três vezes.
- **Acesso revogado:** se o Google recusar o acesso, a integração fica marcada como "Precisa
  reconectar" e nada mais é tentado até o responsável conectar de novo.
- **Preferências** (só o responsável): criar automaticamente ao aprovar ou só pelo botão;
  ligar ou desligar Agenda e Drive; usar outra agenda (pelo ID dela); nome da pasta principal.

Quem faz o quê: o app sincroniza na hora, com a sessão de quem clicou. O coletor
(`pnpm integracoes`, último passo do workflow, a cada 2 horas) acompanha as mudanças de data
detectadas no PNCP, tira da agenda o que deixou de estar aprovado e termina os envios
pendentes, mesmo com o app fechado.

### Configurar (uma vez)

1. **Google Cloud Console** (https://console.cloud.google.com): crie um projeto.
2. **APIs e serviços > Biblioteca:** ative a *Google Calendar API* e a *Google Drive API*.
3. **Google Auth Platform** (tela de consentimento):
   - *Branding:* nome do app, e-mail de suporte e de contato.
   - *Público-alvo:* Externo. Enquanto estiver em "Teste", cadastre os e-mails que vão usar.
   - *Acesso a dados:* adicione os escopos `.../auth/calendar.events` e `.../auth/drive.file`.
4. **Clientes > Criar cliente > Aplicativo da Web**, com estes *URIs de redirecionamento
   autorizados*:
   - `https://SEU-APP.vercel.app/integracoes/google/retorno` (a integração)
   - `https://SEU-PROJETO.supabase.co/auth/v1/callback` (o botão "Entrar com Google")
   - `http://localhost:3000/integracoes/google/retorno` (opcional, para rodar local)
5. Cadastre o **ID do cliente** e a **chave secreta** em três lugares:

| Onde | Caminho | O quê |
|---|---|---|
| Vercel | Settings > Environment Variables | `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`; depois, um novo deploy |
| GitHub | Settings > Secrets and variables > Actions | Variable `GOOGLE_CLIENT_ID` e Secret `GOOGLE_CLIENT_SECRET` (opcional: Variable `SITE_URL` com o endereço do app, para o link nos eventos atualizados pelo coletor) |
| Supabase | Authentication > Sign In / Providers > Google | ID e chave secreta (login com Google) |

A chave secreta nunca vai para o código nem para variável `NEXT_PUBLIC_`. Sem as variáveis
na Vercel, a página Integrações avisa que falta configurar; sem elas no GitHub, o passo do
coletor só registra que não há nada a fazer.

### Segurança

- **Menor escopo possível.** `calendar.events` cria e altera eventos; não dá acesso a
  configurações nem à lista de agendas (por isso a outra agenda é informada pelo ID).
  `drive.file` só enxerga arquivos e pastas que o próprio app criou.
- **Token cifrado.** O token de atualização é cifrado (AES-256-GCM) antes de ir para o banco,
  com uma chave derivada de `GOOGLE_CLIENT_SECRET`. Quem lê a tabela vê só o texto cifrado.
  Consequência: se a chave secreta do cliente for trocada no Google, cada empresa precisa
  conectar de novo.
- **Só o responsável** conecta, configura e desconecta (funções `integracao_conectar`,
  `integracao_configurar` e `integracao_desconectar`). Desconectar apaga o token e pede ao
  Google para invalidá-lo; os eventos e as pastas já criados continuam na conta.
- **Volta do Google conferida** por um código de uso único guardado em cookie (10 minutos),
  para a conexão só valer no navegador e na empresa que a pediram.
- O app só baixa arquivos de endereços do próprio PNCP.

### O que o Google exige para aprovar o app

Enquanto a tela de consentimento estiver em **"Teste"**:

- só entram os e-mails cadastrados como usuários de teste (até 100);
- **o acesso expira em 7 dias**: depois disso a integração passa a "Precisa reconectar".
  Serve para testar, não para o uso do dia a dia.

Para uso real, publique o app (**"Em produção"**). A partir daí:

- `drive.file` é um escopo comum (não sensível) e não exige verificação.
- `calendar.events` é um escopo **sensível**. Sem verificação, o Google mostra a tela "O
  Google não verificou este app" (o usuário clica em Avançado para continuar) e limita o app
  a 100 usuários. O acesso deixa de expirar em 7 dias.
- Para tirar o aviso e o limite, peça a **verificação**. O Google costuma exigir: domínio
  próprio verificado no Search Console (um endereço `*.vercel.app` não serve), página inicial
  e Política de Privacidade publicadas nesse domínio, logotipo, a justificativa de uso de cada
  escopo e um vídeo curto mostrando a tela de consentimento e o uso da Agenda. A análise
  leva de alguns dias a algumas semanas. Não há auditoria de segurança paga, que só vale
  para escopos restritos (não é o caso).

As regras mudam: confira a página oficial antes de pedir a verificação
(https://support.google.com/cloud/answer/9110914).

## E-mails

O app envia dois e-mails, pelo [Resend](https://resend.com):

- **Convite:** quando o responsável convida alguém em Configurações > Usuários.
- **E-mail diário:** as licitações novas da empresa, uma vez por dia.

Confirmação de cadastro e troca de senha são e-mails do Supabase, não passam por aqui (veja
"SMTP do Supabase", abaixo).

### O e-mail diário

- Cada empresa escolhe a hora em Configurações > Notificações (horário de Brasília; padrão
  7h) e pode desligar. Cada pessoa também pode deixar de receber, sem afetar os colegas.
- Entram as oportunidades **novas desde o último e-mail**: licitações dos estados e segmentos
  da empresa que ainda não foram decididas e ainda vão ser disputadas. As que têm item do
  catálogo vêm primeiro; dentro de cada grupo, a disputa mais próxima. O e-mail lista até 15
  e diz quantas mais há na lista completa.
- **Dia sem oportunidade nova não gera e-mail.**
- Licitação revogada, anulada ou excluída do PNCP não entra.
- No primeiro e-mail de uma empresa entram as últimas 24 horas. Depois de dias sem envio
  (falha, ou e-mail desligado e religado), o e-mail volta no máximo 72 horas.
- Um envio por empresa por dia: a tabela `email_envios` guarda o resultado ("enviado",
  "vazio" ou "erro"), que aparece em Configurações > Notificações. Se o envio falhar, o
  agendador tenta de novo na hora seguinte, com as mesmas oportunidades; quem já recebeu não
  recebe de novo.
- O botão **Enviar um e-mail de teste para mim**, na mesma tela, manda na hora um e-mail com
  as oportunidades novas do momento, só para quem clicou. Não conta como o envio do dia.

Quem envia é o workflow [`.github/workflows/email-diario.yml`](.github/workflows/email-diario.yml),
que roda de hora em hora (minuto 7) e chama `pnpm email-diario`. O GitHub pode atrasar alguns
minutos; o e-mail sai na primeira execução depois da hora escolhida. Em Actions > E-mail
diário > Run workflow dá para rodar à mão: "simular" só mostra o que seria enviado, e "agora"
ignora a hora escolhida (o limite de um envio por dia continua valendo).

### Configurar o Resend (uma vez)

1. Crie a conta em resend.com e, em **API Keys**, gere uma chave com permissão de envio
   ("Sending access").
2. Na **Vercel**, em Settings > Environment Variables, cadastre `RESEND_API_KEY` (marque como
   sensível) e faça um novo deploy. É o que envia os convites e o e-mail de teste.
3. No **GitHub**, em Settings > Secrets and variables > Actions > Secrets, cadastre
   `RESEND_API_KEY` com a mesma chave. É o que envia o e-mail diário.
4. **Verifique um domínio** no Resend (Domains > Add Domain) e crie os registros DNS que ele
   mostrar (SPF, DKIM). Sem isso, o Resend só entrega para o e-mail da própria conta do
   Resend: serve para você testar, mas os convites e o e-mail diário dos outros usuários
   falham (o app avisa e mostra o link do convite para copiar).
5. Com o domínio verificado, cadastre o remetente em `EMAIL_REMETENTE`, no formato
   `Licita Saúde <avisos@seu-dominio.com.br>`: na Vercel como variável de ambiente e no
   GitHub como **Variable** (não é segredo).
6. Opcional: no GitHub, a Variable `SITE_URL` com o endereço do app. Em branco, o workflow usa
   o endereço da Vercel que está escrito nele; troque quando o app tiver domínio próprio.

Sem `RESEND_API_KEY`, nada quebra: o convite continua funcionando pelo link, a tela de
Notificações avisa que o envio não está configurado e o workflow termina sem fazer nada.

O plano gratuito do Resend permite 100 e-mails por dia e 3.000 por mês (confira os limites
atuais no site). Cada pessoa que recebe o e-mail diário conta um envio.

### SMTP do Supabase (opcional, recomendado)

O servidor de e-mail padrão do Supabase só envia para os membros do projeto no Supabase e tem
limite baixo por hora, então a confirmação de cadastro de um cliente novo não chega. Com o
domínio verificado no Resend, use o SMTP dele: no Supabase, em Authentication > Emails > SMTP
Settings, ative "Custom SMTP" com host `smtp.resend.com`, porta `465`, usuário `resend`, a
chave da API como senha e um remetente do domínio verificado.

## Excluir a conta (LGPD)

Em Configurações > Excluir conta, qualquer pessoa apaga a própria conta, digitando EXCLUIR
para confirmar. Não há como desfazer.

- **Responsável pela empresa:** a empresa é apagada junto, com o catálogo, os arquivos
  enviados (Storage), as oportunidades e decisões, as buscas salvas, os convites, o registro
  dos e-mails e a ligação com o Google (o app pede ao Google para invalidar o acesso; os
  eventos e as pastas já criados continuam na conta do Google do cliente). As outras pessoas
  da empresa continuam com o login, sem empresa.
- **Membro:** sai da empresa e tem o login apagado. Os dados da empresa continuam.
- As licitações públicas do PNCP não são dados do cliente e continuam no sistema.

Quem ainda não tem empresa (cadastro pela metade, ou a empresa foi excluída pelo responsável)
encontra a mesma opção no rodapé da tela de primeiros passos.

A exclusão é feita pela função `excluir_conta` do banco, que só age sobre quem está logado.
Transferir a empresa para outro responsável antes de sair ainda não existe: é ponto de
extensão.

## Estrutura

```
docs/                  especificação e arquitetura
scripts/               utilitários (teste do banco)
supabase/migrations/   schema e RLS
supabase/seed.sql      licitações de exemplo
supabase/tests/        testes de RLS
src/app/(publico)/     entrar, cadastrar, recuperar e redefinir senha
src/app/(legal)/       termos de uso e política de privacidade
src/app/onboarding/    primeiros passos (empresa, estados, segmentos, tabela)
src/app/(app)/         área logada (menu + telas), incluindo admin/
src/app/auth/          ações de login e rotas de retorno do Supabase
src/components/        componentes (ui/ = shadcn)
src/lib/               Supabase, autenticação, formatação, acesso a dados
src/lib/importacao/    leitura e validação da tabela de preços (Excel/CSV)
src/lib/texto/         normalização e casamento de termos (coletor e triagem)
src/lib/triagem/       motor da triagem (medidas, pontuação, alertas) e execução em lotes
src/lib/busca/         filtros da tela de Busca (leitura do endereço, buscas salvas)
src/lib/integracoes/   Google Agenda e Drive (OAuth, cifra, sincronização)
src/lib/email/         Resend, e-mail diário e convite
coletor/               coletor do PNCP, triagem, integrações e e-mail diário (rodam no GitHub Actions)
.github/workflows/     agendamento do coletor (a cada 2 horas) e do e-mail diário (toda hora)
src/proxy.ts           renova a sessão e redireciona visitantes para o login
```

O nome do produto fica em [`src/lib/app.ts`](src/lib/app.ts).
