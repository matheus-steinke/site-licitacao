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
- **Quando a triagem roda:** ao fim de cada rodada do coletor e quando o cliente muda catálogo, exclusões, UFs ou segmentos.
- **Integrações:** interface comum por provedor (conectar, desconectar, reagir a "oportunidade aprovada" e "data mudou"). Google é o primeiro; Outlook, WhatsApp e webhook ficam como provedores vazios.

## Modelo de dados

### Globais (PNCP e plataforma)

Leitura para qualquer usuário logado; escrita só pelo coletor (service role) ou por admin da plataforma.

| Tabela | Conteúdo | Relações |
|---|---|---|
| `orgaos` | CNPJ, razão social, esfera | — |
| `compras` | Controle PNCP (único), UF, município, modalidade, número, objeto, situação, datas, valor estimado, texto do edital (opcional) | → `orgaos` |
| `compra_itens` | nº, descrição, quantidade, unidade, valor unitário, lote/grupo, benefício ME/EPP, medidas extraídas | → `compras` |
| `compra_arquivos` | título, tipo, URL do PNCP | → `compras` |
| `compra_item_segmentos` | quais segmentos casaram com cada item | → `compra_itens`, `segmentos` |
| `compra_alteracoes` | histórico de mudança de data e situação | → `compras` |
| `segmentos` | nome, palavras-chave, sinônimos, exclusões | — |
| `coletor_rodadas`, `coletor_erros` | início, fim, fonte (busca ou plano B), contagens, erros por chamada | erros → rodadas |
| `admins_plataforma` | quem é admin | → usuário |

### Por organização (todas com `org_id` e RLS)

| Tabela | Conteúdo | Relações |
|---|---|---|
| `organizacoes` | razão social, CNPJ, porte, plano, UFs, limites do score, e-mail diário (ligado, hora) | — |
| `membros`, `convites` | usuário, papel (dono ou membro); convites por e-mail | → `organizacoes`, usuário |
| `organizacao_segmentos` | segmentos de interesse | → `segmentos` |
| `organizacao_exclusoes` | termos que a empresa não fornece (opcionalmente por segmento) | → `segmentos` |
| `produtos` | ID do cliente (único na organização), referência, produto, preço proposta, lance mínimo e colunas opcionais | → `segmentos` |
| `produto_arquivos` | catálogo técnico, registro ANVISA (caminho no Storage) | → `produtos` |
| `importacoes` | arquivo, modo, relatório do que entrou, mudou e deu erro | — |
| `oportunidades` | status, motivo do descarte, score, alertas, valor estimado; única por organização e compra | → `compras` |
| `oportunidade_itens` | item, produto sugerido, score e detalhe do casamento, alertas | → `oportunidades`, `compra_itens`, `produtos` |
| `buscas_salvas` | nome e filtros | — |
| `integracoes` | provedor, conta, credenciais cifradas, agenda e pasta-raiz | — |
| `integracao_vinculos` | ID do evento ou da pasta já criados, para não duplicar e poder atualizar | → `oportunidades` |
| `email_envios` | registro do e-mail diário | — |

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
| 9 | E-mail diário, excluir conta, testes de RLS, README final | Receber o e-mail; revisão geral |
| 10 | Opcional: texto do edital (`pdftotext`) para alertas | Alertas de amostra, comodato, visita técnica |

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
    já confirmado, pode aceitar. O envio automático por e-mail entra na etapa 9 (Resend).
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

## Pontos a confirmar durante a construção

- Nomes reais dos campos da API do PNCP (etapa 4).
- Se a API de itens do PNCP devolve lote/grupo de forma confiável; se não, o alerta de "lote incompleto" depende do texto do edital.
