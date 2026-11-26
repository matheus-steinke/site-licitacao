# Monitoramento das licitações: estudo e plano (etapa 11)

Estudo feito em 26/11/2026, a pedido do dono do projeto, antes de construir qualquer coisa.
Objetivo do módulo: avisar a empresa, em segundos, do que acontece numa licitação em que ela
está participando: mensagens do pregoeiro no chat, convocações com prazo, diligências,
suspensão ou remarcação e resultado. Portais iniciais: Compras.gov.br e Licitações-e (Banco do
Brasil).

Este documento separa o que foi **conferido na fonte** do que ainda é **hipótese**. Nada aqui
foi implementado.

**Situação:** plano aprovado pelo dono do projeto em 26/11/2026, com a etapa 9 (e-mail) feita
antes. A etapa 11 começa pela validação (11.0).

## Resumo

- **Compras.gov.br tem API oficial para o chat desde julho de 2026:** o Integra Compras, do
  Serpro. Custa R$ 1,56 por licitação monitorada no mês, sem limite de consultas, e não pede a
  senha de ninguém. É o caminho de baixo custo e quase instantâneo que estava faltando.
- **Ler o chat do Compras.gov sem a API não é viável:** a página pública exige captcha e o
  portal recusa navegadores automatizados.
- **O Licitações-e não tem API.** O histórico público de mensagens é protegido por captcha
  invisível (conferido: a consulta sem o captcha é recusada). Sobram dois modelos: uma extensão
  no navegador do próprio cliente ou um robô com a chave e a senha dele.
- **O modelo "login e senha" (Effecti, Licitei) funciona, mas é o mais caro e o mais
  arriscado.** Com a API oficial, ele deixou de ser necessário para o Compras.gov.
- **Peso de cada portal na nossa base:** das licitações da saúde ativas hoje, 873 são do
  Compras.gov e 86 do Licitações-e. O Compras.gov vale dez vezes mais.

## O que o mercado faz

| Empresa | Como monitora | Fonte da informação |
|---|---|---|
| Effecti | "Monitoramento em tempo real do chat do pregoeiro", em vários portais (ComprasNet, Licitações-e, BLL, BEC/SP, Compras Públicas, Licitanet, BNC). O site não explica a técnica; segundo o dono do projeto, que usa o produto, pede login e senha dos portais e avisa quase na hora. | [effecti.com.br](https://effecti.com.br/), [chat do pregão](https://www.effecti.com.br/chat-do-pregao-eletronico/) e relato do usuário |
| Licitei | Pede o CPF do gov.br e a senha ("Minha Conta > Portais") e roda um robô na nuvem com as credenciais da empresa. | [licitei.com.br](https://www.licitei.com.br/portais/comprasnet) (via busca) |
| Licitech | Extensão instalada no navegador do cliente, ligada ao painel por um token; atua na aba em que o pregão está aberto. | [licitech.com.br](https://www.licitech.com.br/robo-de-lances-comprasnet-bll) (via busca) |
| ConLicitação | Botão "Ativar monitoramento de chat" em cada licitação; aviso por notificação e som no navegador; palavras-chave. Diz cobrir mais de 500 portais. Não fala em credenciais. | [conlicitacao.com.br](https://conlicitacao.com.br/ferramentas/monitoramento-de-chat/) |
| Serpro (governo) | Diz que "diversas empresas utilizam robôs para coletar informações de licitações, lances, chats e diligências diretamente nos portais" e que isso sobrecarrega os sistemas. Criou o Integra Compras para substituir a prática. | [notícia do Serpro, 12/06/2026](https://www.serpro.gov.br/menu/noticias/noticias-2026/integra-compras) |

São três modelos técnicos:

1. **Robô na nuvem com as credenciais do cliente.** Entra no portal como se fosse o
   fornecedor e lê o chat de dentro da sala. Rápido e funciona com o computador do cliente
   desligado. É o que a Effecti e a Licitei fazem.
2. **Extensão no navegador do cliente.** Lê a tela que o cliente já abriu, com o login que ele
   mesmo fez. Rápido, não guarda senha, mas só funciona com o navegador aberto.
3. **API oficial.** Só existe para o Compras.gov, desde 2026.

## Compras.gov.br

### O que foi conferido

- **A página pública do chat exige captcha (hCaptcha)** e não há API aberta para as mensagens.
  Um projeto que tentou em setembro de 2026 registrou que o portal recusa navegador
  automatizado mesmo depois de uma pessoa resolver o captcha. Fontes:
  [fórum GestGov](https://gestgov.discourse.group/t/existe-uma-api-para-listar-as-mensagens-de-uma-licitacao/28407),
  [VastiMV/licita-ec2#24](https://github.com/VastiMV/licita-ec2/issues/24),
  [ramonreissouza/GovHealth#41](https://github.com/ramonreissouza/GovHealth/pull/41)
  (lidos pelo resumo da busca, não na página). Conclusão: o plano anterior, de consultar a
  área pública a cada 5 a 15 minutos, está descartado.
- **Integra Compras está à venda na Loja Serpro** (produto criado em 17/07/2026, ativo). Lido
  direto na [loja](https://loja.serpro.gov.br/product/integracompras) e na
  [documentação técnica](https://apicenter.estaleiro.serpro.gov.br/documentacao/integra-compras/):
  - **Para quem:** "empresas privadas que desenvolvem soluções digitais para fornecedores",
    citando textualmente "plataformas de monitoramento de licitações". Empresas de qualquer
    porte.
  - **O que entrega:** duas consultas, o chat de mensagens da sessão pública e o chat de
    diligências.
  - **Preço:** "Pague conforme o volume de contratação monitorada/consultada dentro de
    determinado mês". Faixa 1 (de 1 a 2.000 no mês): **R$ 1,56 por contratação**. Cai até
    R$ 0,80 acima de 128 mil. A página promete "sem limitação de consultas".
  - **Contratação:** on-line, assinada com o certificado digital **e-CNPJ**; as chaves ficam
    disponíveis em até 10 minutos; cancela a qualquer momento.
  - **Acesso:** chave e segredo do contrato (OAuth2, token de 1 hora). Nenhuma senha de
    fornecedor.
  - **Há ambiente de demonstração e de homologação**, além do de produção.
- **Formato da consulta** (da especificação OpenAPI oficial):
  `GET /integra-compras/v1/chat/{chaveCompra}?desde=<data-hora>&ordem=asc` e
  `/chat/{chaveCompra}/diligencias`.
  - `chaveCompra` = UASG (6 dígitos) + modalidade (2) + número (5) + ano (4).
  - `desde` traz só o que chegou depois de um instante: é o que permite consultar com
    frequência e receber só as novidades.
  - Cada mensagem traz: identificador único, texto, data e hora, item ou grupo, **categoria**
    (por exemplo, 8 = solicitação ao participante, 12 = fase recursal, 7 = julgamento de
    propostas), tipo do remetente (sistema, fornecedor, governo) e, quando há,
    **o CNPJ do destinatário**.
- **A chave da compra já está nos nossos dados.** O link que o PNCP guarda para as licitações
  do Compras.gov termina em `compra=<chave>`. Conferido no banco: 873 licitações ativas.

### O que ainda é hipótese

- **Unidade de cobrança.** A loja fala em "contratação monitorada no mês"; a documentação diz
  que as respostas 200, 206 e 404 são "bilhetadas". A leitura mais provável é: cada licitação
  consultada conta uma vez no mês, com consultas ilimitadas. Se fosse por consulta, consultar
  a cada 15 segundos seria inviável. **Precisa ser confirmado com o Serpro antes de contratar.**
- **Atraso da API.** A loja diz que a solução funciona "sem interferir nos ambientes
  produtivos", o que sugere uma cópia dos dados. Não sei de quantos segundos é o atraso. Só
  medindo numa sessão real.
- **Limite de frequência.** Não há limite documentado. A confirmar no teste.

### Custo estimado

| Uso no mês | Serpro | Infraestrutura |
|---|---|---|
| 10 licitações acompanhadas | R$ 15,60 | zero ou perto disso |
| 30 licitações | R$ 46,80 | idem |
| 300 licitações (vários clientes) | R$ 468,00 | cerca de R$ 30 |

O custo cresce com o número de licitações acompanhadas, não com o número de consultas (se a
hipótese da cobrança se confirmar). Num plano pago do nosso produto, vira um limite de
licitações monitoradas por mês.

## Licitações-e (Banco do Brasil)

### O que foi conferido

- Desde 2024 as licitações novas ficam no portal novo, `licitacoes-e2.bb.com.br`. As chaves
  de acesso antigas continuam valendo.
- **O chat fica na área identificada** (chave e senha do representante). Fonte: cartilha do
  fornecedor do próprio BB.
- **Existe um histórico público de mensagens** no portal novo
  (`licitacao/<número>/historico-mensagens`), mas a consulta é protegida por captcha invisível
  (Cloudflare Turnstile). Testado em 26/11/2026: uma consulta direta, sem o captcha, voltou
  **403 (recusada)**. Um programa no servidor não consegue ler sem burlar a proteção.
- **Não encontrei API oficial** nem produto equivalente ao Integra Compras para o BB.
- O link que o PNCP guarda já traz o número da licitação no BB (86 licitações ativas).

### Caminhos possíveis

| Caminho | Rapidez | Guarda senha? | Funciona com o computador desligado? | Risco |
|---|---|---|---|---|
| Extensão no navegador do cliente | segundos | não | não | médio: quebra quando o portal muda de tela |
| Robô na nuvem com chave e senha | segundos | sim | sim | alto: captcha, bloqueio, responsabilidade pela senha |
| Só o PNCP (situação, data, arquivos, resultado) | horas | não | sim | baixo, mas sem chat |

## Por que não começar pelo modelo "login e senha"

É o modelo que você viu funcionar na Effecti, e funciona. Mesmo assim, não recomendo começar
por ele:

1. **No Compras.gov ele deixou de ser necessário.** A API oficial entrega as mesmas mensagens,
   com a mesma rapidez, sem senha.
2. **A senha do Compras.gov é a do gov.br.** Ela abre a vida digital inteira da pessoa
   (imposto de renda, INSS, assinatura de documentos), não só o portal de compras. Os termos
   do gov.br dizem que a senha é "pessoal e intransferível", e uma versão do termo proíbe
   robôs sem autorização. Se vazar de um sistema nosso, a responsabilidade é nossa (LGPD).
3. **Os portais combatem robôs.** Captcha no Compras.gov, captcha invisível no BB. Manter um
   robô logado é uma disputa permanente, com servidores de navegador ligados o dia inteiro.
   Não é baixo custo.

Fica registrado como alternativa para o Licitações-e, se a extensão não der conta.

## Plano proposto (etapa 11)

Meta: **aviso em até 30 segundos** para mensagens do Compras.gov, a confirmar na validação.

### 11.0 Validação (antes de construir)

1. Confirmar com o Serpro a unidade de cobrança e se há limite de frequência.
2. Contratar o Integra Compras com o e-CNPJ (depende do dono do projeto) ou usar o ambiente
   de demonstração.
3. Acompanhar uma sessão real e medir o atraso entre a mensagem aparecer no portal e chegar
   pela API. Custo do teste: cerca de R$ 1,56.

Se o atraso passar de 1 minuto ou a cobrança for por consulta, o plano volta para a mesa.

### 11.1 Base do módulo

- Identificar o portal e a chave de cada licitação aprovada (a partir do link do PNCP).
- Tabelas de monitoramento e de eventos, com RLS.
- Tela "Monitoramento": linha do tempo por licitação e a hora da última conferência.
- Eventos que já temos pelo PNCP, para todos os portais: situação, data, arquivos novos,
  resultado.

### 11.2 Chat do Compras.gov pela API oficial

- Um processo que consulta, a cada 10 a 15 segundos, só as licitações aprovadas que estão em
  sessão ou em fase de julgamento, usando o `desde` para trazer só o que é novo.
- Regras de alerta sem IA: mensagem com o CNPJ da empresa como destinatário, categoria
  (solicitação ao participante, fase recursal), palavras-chave ("convocado", "anexo",
  "diligência", "proposta atualizada") e prazo lido do texto ("2 horas").
- Onde roda: um agendador de segundos no próprio Supabase ou um servidor pequeno (cerca de
  R$ 30 por mês). O GitHub Actions não serve aqui, porque o intervalo mínimo dele é de 5
  minutos. A decidir na etapa, depois de testar.

### 11.3 Avisos na hora

- No sistema aberto: som e notificação do navegador.
- No celular: Telegram (gratuito). WhatsApp oficial é pago por mensagem e fica para depois.
- E-mail, que depende do envio da etapa 9.

### 11.4 Licitações-e

- Protótipo de extensão de navegador, testado na conta do dono do projeto, para medir a
  rapidez e a estabilidade.
- Com o resultado, decidir entre extensão, robô com chave e senha ou só o PNCP.

### Fora desta etapa

Responder no chat, enviar documentos e dar lances continuam fora do MVP.

## Decisões que cabem ao dono do projeto

As três foram aprovadas em 26/11/2026.

1. Aprovar o caminho da API oficial para o Compras.gov (e contratar com o e-CNPJ).
2. Licitações-e: aceitar começar pelo protótipo de extensão, sabendo que o Compras.gov sai
   primeiro.
3. Ordem das etapas: a 11 depende em parte do envio de e-mail da etapa 9.
