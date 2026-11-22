// Ponto de entrada do coletor.
//
//   pnpm coletor                       rodada completa (precisa das variáveis do Supabase)
//   pnpm coletor -- --manual           marca a rodada como manual
//   pnpm coletor -- --fonte plano_b    força o plano B
//   pnpm coletor -- --termos 5         usa só os 5 primeiros termos (teste rápido)
//   pnpm coletor -- --simular seg.json não grava nada; lê os segmentos de um arquivo JSON
//
// Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// e opcionais COLETOR_PAUSA_MS, COLETOR_PARALELAS, COLETOR_MAX_COMPRAS, COLETOR_MINUTOS.

import { readFileSync } from "node:fs";

import { criarClientePncp } from "./pncp";
import { criarRepositorioMemoria, criarRepositorioSupabase } from "./repositorio";
import { CONFIGURACAO_PADRAO, executarRodada, type ConfiguracaoDaRodada } from "./rodada";

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice === -1 ? undefined : process.argv[indice + 1];
}
const temArgumento = (nome: string) => process.argv.includes(`--${nome}`);

function numero(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return valor !== undefined && Number.isFinite(n) && n > 0 ? n : padrao;
}

/** Detecta os enganos mais comuns ao colar a chave, sem nunca imprimir o valor. */
export function problemaNaChave(chave: string): string | null {
  if (/[•*…]|\.{3}/.test(chave)) return "o valor está mascarado (tem •••• ou ...); use o botão de revelar/copiar.";
  if (/\s/.test(chave)) return "o valor tem espaço ou quebra de linha no meio.";
  if (chave.startsWith("sb_publishable_")) return "esta é a chave pública (sb_publishable_); use a secreta (sb_secret_).";
  if (chave.startsWith("sb_secret_")) return chave.length < 30 ? "o valor parece cortado." : null;
  if (chave.startsWith("eyJ")) {
    const partes = chave.split(".");
    if (partes.length !== 3) return "o valor parece cortado (um JWT tem três partes separadas por ponto).";
    try {
      const papel = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")).role;
      if (papel === "anon") return "esta é a chave pública (anon); use a service_role.";
    } catch {
      return "o valor parece cortado ou alterado.";
    }
    return null;
  }
  return "o valor não começa com sb_secret_ nem com eyJ.";
}

async function principal() {
  const falhas: { url: string; status?: number; mensagem: string }[] = [];
  const pncp = criarClientePncp({
    pausaMs: numero(process.env.COLETOR_PAUSA_MS, 300),
    aoFalhar: (falha) => {
      if (falha.definitiva) falhas.push(falha);
    },
  });

  const fonte = argumento("fonte");
  const configuracao: Partial<ConfiguracaoDaRodada> = {
    origem: temArgumento("manual") ? "manual" : "agendado",
    fonte: fonte === "busca" || fonte === "plano_b" ? fonte : "auto",
    paralelas: numero(process.env.COLETOR_PARALELAS, CONFIGURACAO_PADRAO.paralelas),
    maximoDeCompras: numero(process.env.COLETOR_MAX_COMPRAS, CONFIGURACAO_PADRAO.maximoDeCompras),
    tempoMaximoMs: numero(process.env.COLETOR_MINUTOS, 45) * 60 * 1000,
    limiteDeTermos: argumento("termos") ? numero(argumento("termos"), 5) : undefined,
  };

  const arquivoDeSegmentos = argumento("simular");
  if (arquivoDeSegmentos) {
    const memoria = criarRepositorioMemoria(JSON.parse(readFileSync(arquivoDeSegmentos, "utf8")));
    const totais = await executarRodada(pncp, memoria.repositorio, configuracao, falhas);
    const saude = [...memoria.compras.values()].filter((c) => c.area_saude);
    console.log(`\nSIMULAÇÃO (nada foi gravado). Requisições ao PNCP: ${pncp.chamadas}`);
    console.log(`Compras da saúde: ${saude.length} de ${memoria.compras.size} gravadas em memória`);
    for (const c of saude.slice(0, 15)) {
      const casados = c.itens.filter((i) => i.segmento_ids.length > 0);
      console.log(
        `- ${c.compra.controle_pncp} ${c.compra.uf} ${c.compra.data_disputa?.slice(0, 16)} | ${c.itens.length} itens, ${casados.length} da saúde, ${c.arquivos.length} arquivos | ${c.compra.objeto.slice(0, 70)}`,
      );
      for (const item of casados.slice(0, 2)) console.log(`    · item ${item.numero_item}: ${item.descricao.slice(0, 90)}`);
    }
    if (memoria.erros.length > 0) console.log("Erros:", memoria.erros.slice(0, 5));
    process.exitCode = totais.status === "erro" ? 1 : 0;
    return;
  }

  // Espaço ou quebra de linha sobrando (comum ao colar a chave) invalidam a chave.
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !chave) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o README, seção Coletor).");
    process.exitCode = 1;
    return;
  }
  const problema = problemaNaChave(chave);
  if (problema) {
    console.error(`SUPABASE_SERVICE_ROLE_KEY não parece uma chave de serviço do Supabase: ${problema}`);
    console.error("Copie de novo em Project Settings > API Keys (veja o README, seção Coletor).");
    process.exitCode = 1;
    return;
  }
  const totais = await executarRodada(pncp, criarRepositorioSupabase(url, chave), configuracao, falhas);
  // Rodada parcial não é falha do agendamento: o que faltou entra na próxima.
  process.exitCode = totais.status === "erro" ? 1 : 0;
}

const chamadoDireto = process.argv[1]?.replace(/\\/g, "/").endsWith("coletor/index.ts");
if (chamadoDireto) principal().catch((erro) => {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  if (/invalid api key|unregistered api key/i.test(mensagem)) {
    console.error(
      "O Supabase recusou a chave (Invalid API key). O valor de SUPABASE_SERVICE_ROLE_KEY não é uma chave válida do projeto em SUPABASE_URL. " +
        "Confira se copiou a chave inteira (revelada, não a versão mascarada com ••••), do projeto certo, e salve o segredo de novo.",
    );
  } else if (/permission denied|row-level security|not authorized/i.test(mensagem)) {
    console.error(
      "O Supabase aceitou a chave, mas ela não tem permissão de escrita. SUPABASE_SERVICE_ROLE_KEY precisa ser a chave de serviço " +
        "(service_role ou sb_secret_...), não a chave pública (anon ou sb_publishable_...).",
    );
    console.error(mensagem);
  } else {
    console.error("Falha inesperada no coletor:", erro);
  }
  process.exitCode = 1;
});
