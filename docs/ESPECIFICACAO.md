# Projeto: MVP de SaaS de prospecção e triagem de licitações (área da saúde)

## Contexto
Sou distribuidor de produtos médicos e hoje uso agentes de IA para achar e triar licitações no PNCP.
Quero transformar isso num SaaS web para outros distribuidores da área da saúde.
Neste MVP a triagem é 100% SEM IA (regras, palavras-chave, medidas e similaridade de texto).
Público: distribuidores regionais da saúde (não atendem o Brasil inteiro).
Idioma da interface: português do Brasil. Fuso: America/Sao_Paulo. Moeda: R$ (formato 1.234,56).

## Como quero que você trabalhe
1. ANTES de escrever código, me apresente: arquitetura, modelo de dados (tabelas e relações), lista de telas e um plano em etapas (marcos). Espere minha aprovação.
2. Construa por etapas, com algo funcionando ao fim de cada uma. Ao fim de cada etapa, me diga o que testar.
3. Se uma decisão minha estiver ambígua ou for ruim tecnicamente, pergunte ou sugira alternativa, não chute.
4. Nunca coloque segredos no código nem no git: use .env e entregue um .env.example.
5. Entregue README com como rodar local, como fazer deploy e como configurar as integrações.

## Stack sugerida (pode propor outra, justificando)
- Front + API: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deploy na Vercel.
- Banco, login e arquivos: Supabase (Postgres, Auth, Storage), com Row Level Security em TODAS as tabelas de cliente.
- Coletor do PNCP: worker agendado (Python ou Node, você escolhe e justifica) rodando a cada 2 horas, por cron (Supabase cron, Vercel Cron, GitHub Actions ou Railway).
- E-mail transacional: Resend (ou similar).
- Leitura de Excel/CSV no upload: SheetJS (xlsx) ou equivalente.

## Multiempresa (multi-tenant)
- Cada cliente é uma ORGANIZAÇÃO (empresa) com um ou mais usuários.
- Tudo que é do cliente (catálogo, preços, oportunidades, status, integrações, filtros) pertence à organização e é isolado por RLS.
- Os dados públicos do PNCP (licitações, itens, arquivos) são GLOBAIS: coletados uma vez e compartilhados entre todos os clientes. A triagem de cada cliente é uma camada por cima.

## Funcionalidades do MVP

### 1. Cadastro, login e onboarding
- Cadastro e login com e-mail/senha e com Google.
- Onboarding em passos:
  a) dados da empresa: razão social, CNPJ, porte (ME/EPP ou demais);
  b) ESTADOS atendidos: seleção múltipla de UFs, com botões "todos" e "limpar";
  c) SEGMENTOS de interesse (lista abaixo);
  d) subir a tabela de preços (pode pular e fazer depois).
- O cliente pode alterar tudo isso depois em "Configurações".

### 2. Segmentos (taxonomia da saúde)
- Tabela de segmentos, editável por um usuário ADMIN da plataforma (eu), com:
  nome, palavras-chave, sinônimos/abreviações e termos de exclusão.
- Seed inicial (monte as palavras-chave de cada um):
  Urologia/Endourologia, Cirurgia Geral, Laparoscopia, Histeroscopia, Endoscopia Digestiva,
  Ortopedia, Cardiologia/Hemodinâmica, Neurocirurgia, Oftalmologia, Otorrinolaringologia,
  Ginecologia/Obstetrícia, Anestesia, UTI/Terapia Intensiva, Curativos, Materiais de consumo hospitalar,
  Equipamentos médico-hospitalares, Laboratório/Diagnóstico.
- Exemplo de exclusão: "Urologia" não deve casar com "sonda de Foley" se o cliente marcar Foley como exclusão.

### 3. Coletor do PNCP (global, sem IA)
- APIs públicas do PNCP (sem login):
  - Busca: https://pncp.gov.br/api/search/?q="<termo>"&tipos_documento=edital&ordenacao=-data&pagina=N&tam_pagina=100&status=recebendo_proposta
  - Plano B, quando a busca estiver fora do ar (acontece): https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=50 (filtrável por uf, cnpj e codigoUnidadeAdministrativa)
  - Detalhes: https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq} (situacaoCompraId: 1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa; dataAberturaProposta, dataEncerramentoProposta)
  - Itens: https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens?pagina=1&tamanhoPagina=500 (descrição, quantidade, unidade, valor unitário estimado, grupo/lote, benefício ME/EPP por item; confira os nomes reais dos campos na resposta)
  - Arquivos: .../compras/{ano}/{seq}/arquivos
  - Link público do edital: https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}
  - Chave única: "Controle PNCP" = {cnpj}-1-{seq com 6 dígitos}/{ano}.
- Busca pelos termos de TODOS os segmentos, só para disputas de hoje até hoje + 30 dias.
- Grava compra, órgão, UF, município, modalidade, número, objeto, datas, situação e itens. Atualiza situação e datas a cada rodada (adiada, suspensa, revogada).
- Sem duplicar. Com retentativa, pausa entre chamadas e registro de erros (tabela de log das rodadas).
- Filtro "área da saúde": manter só compras com pelo menos um item que case com algum segmento.
- Retenção (aprovada em 24/11/2026, para o banco caber no plano gratuito): os itens das licitações com disputa encerrada há mais de 30 dias que nenhuma organização aprovou são apagados. A licitação (objeto, datas, situação, arquivos), as oportunidades e as decisões ficam; as aprovadas guardam os itens. O prazo é configurável.
- Opcional, se couber no MVP: baixar o PDF do edital/TR, extrair o texto (pdftotext) e guardar, para os alertas do item 5.

### 4. Catálogo e tabela de preços (por organização)
- Tela "Catálogo" com tabela editável (incluir, editar, excluir, buscar).
- Colunas obrigatórias: ID; REFERÊNCIA; PRODUTO; PREÇO PROPOSTA; LANCE MÍNIMO.
- Colunas opcionais: segmento, palavras-chave/sinônimos do produto, medidas, marca, fabricante, registro ANVISA.
- Importação de Excel (.xlsx) e CSV:
  - modelo para download;
  - pré-visualização com validação linha a linha (preço com vírgula ou ponto, campos vazios, IDs repetidos);
  - opção de "atualizar pelo ID" ou "substituir tudo";
  - relatório do que entrou, mudou e deu erro.
- Upload de arquivos por produto (catálogo técnico em PDF, registro ANVISA) no Supabase Storage, com download.
- Lista de EXCLUSÕES da empresa (termos que ela não fornece), usada na triagem.

### 5. Triagem básica sem IA (por organização)
Para cada licitação nova nas UFs do cliente, comparar CADA item com o catálogo dele:
- Normalizar textos: minúsculas, sem acento, abreviações comuns (fr/french, cm, mm, µm/micra, ml, un/unid).
- Extrair medidas com regex (ex.: 6Fr, 26 cm, 270 µm, 0,035") e comparar com as do produto.
- Pontuar a semelhança: palavras-chave e sinônimos do produto, similaridade de texto (pg_trgm no Postgres, ou equivalente) e medidas compatíveis.
- Aplicar exclusões do cliente e do segmento.
- Lote/grupo: indicar "lote completo" ou "lote incompleto (faltam itens X, Y)".
- Exclusivo ME/EPP: marcar o item. Se a empresa NÃO é ME/EPP, NÃO descartar: mostrar o alerta "exclusivo ME/EPP – repassar a parceiro".
- Alertas por palavra no objeto/edital (quando houver o texto): amostra, comodato, visita técnica, exclusiva ME/EPP.
- Resultado da oportunidade: score, itens compatíveis (item, descrição, qtd, unidade, valor de referência, produto sugerido, preço proposta, lance mínimo), alertas e valor estimado.
- Valor de referência abaixo do LANCE MÍNIMO do cliente: alerta "referência abaixo do seu mínimo".
- Os limites do score devem ficar fáceis de ajustar (configuração).

### 6. Busca
- Barra de pesquisa por PALAVRA-CHAVE (busca no objeto e na descrição dos itens).
- Filtro por SEGMENTO (um ou vários).
- Filtro por UFs (seleção múltipla; padrão = UFs do cliente), período da disputa, modalidade, situação e "só com itens do meu catálogo".
- Salvar filtros como "buscas salvas".

### 7. Oportunidades (tela principal após o login)
- Lista em formato caixa de entrada: card com data/hora da disputa, órgão, UF, nº, objeto resumido, nº de itens compatíveis, valor estimado e alertas.
- Status por organização: Nova → Aprovada (agendada) / Descartada; depois da data: Disputada; opcional Ganha/Perdida.
- Ações: Aprovar, Descartar (com motivo), abrir o detalhe.
- Página de detalhe: dados do edital, tabela de itens compatíveis e não compatíveis, alertas, link do PNCP e lista de arquivos com download.
  - Na página de detalhe, os itens dos segmentos de interesse da empresa ficam destacados ("pintados"), com uma cor por segmento, para o distribuidor identificar rápido quais itens são de cada segmento. (Pedido em 24/11/2026.)
  - No cartão da lista, cada segmento de interesse presente na licitação aparece com a mesma cor e a quantidade de itens. (Pedido em 24/11/2026.)

### 8. Dashboard (botão "Dashboard" no menu)
- Cartões:
  - Licitações DISPUTADAS: aprovadas com data de disputa já passada (ou status Disputada).
  - Licitações AGENDADAS: aprovadas com disputa futura.
  - VALOR ESTIMADO EM DISPUTA: soma, nas licitações AGENDADAS, de (quantidade do item × LANCE MÍNIMO do produto vinculado), com base na tabela de preços do cliente.
- Filtro por período. Um gráfico simples por mês e por UF. Uma lista das próximas disputas.
- Deixar claro na tela que o valor usa o LANCE MÍNIMO da tabela do cliente.

### 9. Integrações (área "Integrações", com arquitetura que permita adicionar outras)
- Google Agenda e Google Drive por OAuth do Google, com o menor escopo possível (calendar.events e drive.file).
- Ao APROVAR uma oportunidade (ou por um botão):
  - Agenda: criar o evento na agenda escolhida pelo cliente, com título "PE <nº>/<ano> - <Órgão>", início na hora da disputa, duração de 1 hora e descrição com os itens compatíveis, quantidades, alertas e o link do PNCP. Não duplicar; atualizar o evento se a data mudar.
  - Drive: criar, numa pasta-raiz escolhida pelo cliente, a pasta "<Mês AAAA>/PE <nº>.<ano> - <Órgão> DD.MM", com as subpastas "0. Planejamento", "1. Edital e Anexos", "2. Habilitação", "3. Proposta atualizada" e "4. Resultados". Salvar os arquivos do PNCP em "1. Edital e Anexos".
- Me explique no README o que é preciso para o Google aprovar o app (tela de consentimento, verificação dos escopos).
- Deixe preparada (sem implementar) a estrutura para futuras integrações: Outlook/Microsoft, WhatsApp e webhook.

### 10. Notificações
- E-mail diário (horário configurável) com as oportunidades novas das UFs e segmentos do cliente.
- Opção de desligar.

## Fora do MVP (não fazer agora; deixe pontos de extensão)
IA/LLM, montagem de proposta, cadastro em portais de disputa, robô de lances, pós-disputa, atas e empenhos, cobrança/assinatura (só deixe o campo "plano" na organização).

## Requisitos gerais
- Interface responsiva (funcionar bem no celular), simples e rápida.
- LGPD: páginas de Termos de Uso e Política de Privacidade (texto provisório) e opção de excluir a conta.
- Testes: pelo menos da importação do Excel, da triagem (casos com medida certa e errada, exclusão, lote incompleto, ME/EPP) e das regras de RLS.
- Dados de exemplo (seed) para eu testar sem esperar o coletor.
- Painel ADMIN simples para mim: segmentos, rodadas do coletor (sucesso/erro) e organizações cadastradas.
