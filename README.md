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
| 3 | Catálogo e importação de Excel/CSV | A fazer |
| 4 | Coletor do PNCP | A fazer |
| 5 | Triagem e Oportunidades | A fazer |
| 6 | Busca | A fazer |
| 7 | Dashboard | A fazer |
| 8 | Integrações Google Agenda e Drive | A fazer |
| 9 | E-mail diário, excluir conta, testes de RLS completos | A fazer |
| 10 | Opcional: texto do edital para alertas | A fazer |

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

Remover os dados de exemplo quando houver dados reais:

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
| `orgaos`, `compras`, `compra_itens`, `compra_arquivos` | nada | lê | lê | tudo |
| `admins_plataforma` | nada | vê só a própria linha | vê só a própria linha | tudo |

Dados por organização (um usuário só enxerga a própria organização):

| Tabela | Membro | Responsável (dono) | Admin da plataforma |
|---|---|---|---|
| `organizacoes` | lê | lê e altera (menos o `plano`) | lê todas |
| `membros` | lê | lê e remove outros membros | lê todos |
| `convites` | nada | lê, cria e cancela | nada |
| `organizacao_segmentos` | lê | lê e altera | lê todos |

Criação de organização e aceite de convite passam por funções do banco
(`criar_organizacao`, `aceitar_convite`), que conferem o usuário logado. Ninguém insere
direto nessas tabelas.

## Organizações e usuários

- No primeiro acesso o usuário passa pelo onboarding: empresa, estados, segmentos e tabela de
  preços (a importação da tabela chega na etapa 3). Quem cria a organização é o responsável.
- Neste MVP cada usuário pertence a uma única organização, e cada CNPJ a uma única
  organização. O CNPJ é validado pelos dígitos verificadores, inclusive no formato
  alfanumérico.
- **Convites:** em Configurações > Usuários, o responsável informa o e-mail da pessoa e o app
  gera um link de cadastro com esse e-mail. O responsável envia o link (o envio automático
  por e-mail entra na etapa 9, junto com o Resend). Quem entrar com aquele e-mail, já
  confirmado, vê o convite e aceita. Convites valem 14 dias.
- Só o responsável altera dados da empresa, estados, segmentos e usuários. Os membros
  consultam.

## Painel ADMIN

Disponível para quem está em `admins_plataforma`, pelo item "Admin" do menu:

- **Segmentos:** nome, ordem, ativo, palavras-chave, sinônimos e exclusões (um termo por
  linha; vírgula não separa termos, por causa de medidas como "0,035"). Segmento escolhido
  por alguma organização não pode ser excluído, só desativado.
- **Organizações:** empresas cadastradas, com porte, plano, estados, segmentos e usuários.
- **Rodadas do coletor:** chega na etapa 4.

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
     configure um SMTP próprio (o Resend entra na etapa 9) ou desligue temporariamente
     *Confirm email* em Sign In / Providers > Email.
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
     Google. Os escopos de Agenda e Drive são pedidos à parte, na etapa 8.
   - Enquanto isso não for feito, o botão "Entrar com Google" mostra um aviso e o login por
     e-mail e senha funciona normalmente.

## Deploy na Vercel

1. Importe o repositório do GitHub na Vercel (framework Next.js, detectado sozinho).
2. Em Settings > Environment Variables, cadastre `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para Production e Preview.
3. Faça o deploy. A região das funções é São Paulo (`gru1`, definida em `vercel.json`),
   a mesma do banco.
4. Coloque o endereço gerado em *Site URL* e *Redirect URLs* no Supabase (seção acima).

Cada push no branch de produção publica uma nova versão.

## Integrações

Google Agenda e Google Drive entram na etapa 8. Esta seção vai explicar a configuração do
OAuth, a tela de consentimento e o que o Google exige para aprovar os escopos
`calendar.events` e `drive.file`.

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
src/proxy.ts           renova a sessão e redireciona visitantes para o login
```

O nome do produto fica em [`src/lib/app.ts`](src/lib/app.ts).
