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
