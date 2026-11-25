// Sincronização das integrações (Google Agenda e Drive) de todas as organizações, rodada depois
// da triagem (GitHub Actions) ou à mão:
//   pnpm integracoes                 todas as organizações com Google conectado
//   pnpm integracoes --org <id>      só uma
// É o que faz o evento acompanhar a data da disputa quando ela muda no PNCP, tira da agenda o
// que deixou de estar aprovado e termina o envio dos arquivos do edital para o Drive.
//
// Usa a chave de serviço (SUPABASE_SERVICE_ROLE_KEY) e as credenciais do app no Google
// (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET, as mesmas da Vercel). Sem elas, não faz nada.

import { createClient } from "@supabase/supabase-js";

import { credenciaisDoGoogle, criarDependencias } from "../src/lib/integracoes/configuracao";
import { sincronizarOrganizacao } from "../src/lib/integracoes/sincronizar";
import type { Database } from "../src/lib/supabase/tipos";
import { problemaNaChave } from "./index";

function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);
  return posicao >= 0 ? process.argv[posicao + 1] : undefined;
}

async function principal() {
  const app = credenciaisDoGoogle();
  if (!app) {
    console.log("integrações: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não definidos; nada a fazer.");
    return;
  }
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
    .from("integracoes")
    .select("org_id, conta, organizacao:organizacoes (razao_social)")
    .eq("provedor", "google")
    .order("conectado_em");
  const soUma = argumento("org");
  if (soUma) consulta = consulta.eq("org_id", soUma);
  const { data: integracoes, error } = await consulta;
  if (error) throw new Error(`Falha ao listar as integrações: ${error.message}`);
  if (integracoes.length === 0) {
    console.log("integrações: nenhuma organização com Google conectado.");
    return;
  }

  const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const deps = criarDependencias(supabase, app, {
    linkDoApp: site ? (oportunidadeId) => `${site}/oportunidades/${oportunidadeId}` : undefined,
    // No coletor há memória e tempo de sobra para os arquivos que o app deixou para depois.
    limiteDoArquivoBytes: 150 * 1_048_576,
  });

  // O tempo total é dividido entre as organizações; o que não couber fica para a próxima rodada.
  const minutos = Number(process.env.INTEGRACOES_MINUTOS) > 0 ? Number(process.env.INTEGRACOES_MINUTOS) : 8;
  const fim = Date.now() + minutos * 60_000;
  let falhas = 0;

  for (const [indice, integracao] of integracoes.entries()) {
    const nome = integracao.organizacao?.razao_social ?? integracao.org_id;
    const restantes = integracoes.length - indice;
    const tempo = Math.max(0, (fim - Date.now()) / restantes);
    if (tempo < 1000) {
      console.log(`integrações: sem tempo para ${restantes} organização(ões); ficam para a próxima rodada`);
      break;
    }
    try {
      const r = await sincronizarOrganizacao(deps, integracao.org_id, { prazo: Date.now() + tempo });
      if (r.erroDeAcesso) {
        console.log(`integrações: ${nome}: ${r.erroDeAcesso}`);
        continue;
      }
      console.log(
        `integrações: ${nome}: ${r.conferidas} oportunidades conferidas; eventos: ${r.eventos.criados} criados, ` +
          `${r.eventos.atualizados} atualizados, ${r.eventos.removidos} removidos; ${r.pastas} pastas criadas; ` +
          `${r.arquivos} arquivos enviados`,
      );
      for (const erro of r.erros.slice(0, 10)) console.log(`integrações: ${nome}: ${erro}`);
    } catch (erro) {
      falhas++;
      console.error(`integrações: ${nome}: falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  console.log(`integrações: ${integracoes.length} organização(ões), ${falhas} com falha`);
  if (falhas > 0 && falhas === integracoes.length) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
