# CLAUDE.md

## Regra principal

Sempre siga a especificação em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md). Ela é a fonte da verdade deste projeto.

- Leia `docs/ESPECIFICACAO.md` antes de planejar ou escrever qualquer código.
- Em caso de conflito entre a especificação e qualquer outra fonte (código existente, suposições, convenções), vale a especificação. Se o conflito for com um pedido novo do usuário, aponte a divergência e pergunte antes de seguir.
- Não implemente nada listado em "Fora do MVP"; apenas deixe os pontos de extensão.
- Se algo na especificação estiver ambíguo ou for tecnicamente ruim, pergunte ou sugira alternativa. Não chute.
- Se uma decisão aprovada pelo usuário mudar a especificação, atualize `docs/ESPECIFICACAO.md` no mesmo commit.

A arquitetura, o plano em etapas e as decisões aprovadas depois da especificação estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Consulte antes de começar uma etapa.

## Como trabalhar (resumo da especificação)

1. Antes de escrever código: apresentar arquitetura, modelo de dados, lista de telas e plano em etapas, e esperar aprovação.
2. Construir por etapas, com algo funcionando ao fim de cada uma, e dizer o que testar.
3. Nunca colocar segredos no código nem no git: usar `.env` e manter um `.env.example`.
4. Manter o README com como rodar local, fazer deploy e configurar as integrações.

## Convenções do produto

- Interface em português do Brasil, fuso `America/Sao_Paulo`, moeda R$ no formato `1.234,56`.
- Triagem 100% sem IA neste MVP.
- Row Level Security em todas as tabelas de cliente; dados do PNCP são globais.

## Convenções técnicas

- Next.js 16 com Cache Components: leia [`AGENTS.md`](AGENTS.md) e a documentação em `node_modules/next/dist/docs/` antes de mexer em rotas, cache ou proxy. Toda leitura de sessão ou de dados do cliente fica atrás de um `<Suspense>` (ou do `loading.tsx` do grupo `(app)`).
- Nomes de tabelas, colunas, arquivos e funções do domínio em português.
- Toda migration nova: RLS ligado, permissões explícitas (`grant`/`revoke`), um teste em `supabase/tests/` e tipos regenerados em `src/lib/supabase/tipos.ts`.
- Antes de concluir uma etapa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` e `pnpm build`.
