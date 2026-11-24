// Triagem de todas as organizações, rodada depois do coletor (GitHub Actions) ou à mão:
//   pnpm triagem                 todas as organizações
//   pnpm triagem --org <id>      só uma
// Usa a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), como o coletor.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/tipos";
import { triarOrganizacao } from "../src/lib/triagem/executar";
import { problemaNaChave } from "./index";

function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);
  return posicao >= 0 ? process.argv[posicao + 1] : undefined;
}

async function principal() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, "");
  if (!url || !chave) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o README, seção Coletor).");
    process.exitCode = 1;
    return;
  }
  const problema = problemaNaChave(chave);
  if (problema) {
    console.error(`SUPABASE_SERVICE_ROLE_KEY não parece uma chave de serviço do Supabase: ${problema}`);
    process.exitCode = 1;
    return;
  }
  const supabase = createClient<Database>(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  let consulta = supabase
    .from("organizacoes")
    .select("id, razao_social")
    .not("onboarding_concluido_em", "is", null)
    .order("criado_em");
  const soUma = argumento("org");
  if (soUma) consulta = consulta.eq("id", soUma);
  const { data: organizacoes, error } = await consulta;
  if (error) throw new Error(`Falha ao listar as organizações: ${error.message}`);

  // O tempo total é dividido entre as organizações; o que não couber fica para a próxima rodada.
  const minutos = Number(process.env.TRIAGEM_MINUTOS) > 0 ? Number(process.env.TRIAGEM_MINUTOS) : 8;
  const prazo = Date.now() + minutos * 60_000;
  let falhas = 0;

  for (const [indice, org] of organizacoes.entries()) {
    const restantes = organizacoes.length - indice;
    const tempoMaximoMs = Math.max(0, (prazo - Date.now()) / restantes);
    if (tempoMaximoMs < 1000) {
      console.log(`triagem: sem tempo para ${restantes} organização(ões); ficam para a próxima rodada`);
      break;
    }
    try {
      const r = await triarOrganizacao(supabase, org.id, { tempoMaximoMs, maxCompras: 200, maxItens: 20_000 });
      console.log(
        `triagem: ${org.razao_social}: ${r.feitas} licitações comparadas, ${r.oportunidades} oportunidades, ` +
          `${r.restantes} pendentes (${r.lotes} lote(s))`,
      );
    } catch (erro) {
      falhas++;
      console.error(`triagem: ${org.razao_social}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  console.log(`triagem: ${organizacoes.length} organização(ões), ${falhas} com falha`);
  // Falha em uma organização não derruba o agendamento; em todas, sim.
  process.exitCode = organizacoes.length > 0 && falhas === organizacoes.length ? 1 : 0;
}

principal().catch((erro) => {
  console.error("Falha inesperada na triagem:", erro);
  process.exitCode = 1;
});
