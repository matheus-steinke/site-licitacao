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

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o README, seção Coletor).");
    process.exitCode = 1;
    return;
  }
  const totais = await executarRodada(pncp, criarRepositorioSupabase(url, chave), configuracao, falhas);
  // Rodada parcial não é falha do agendamento: o que faltou entra na próxima.
  process.exitCode = totais.status === "erro" ? 1 : 0;
}

principal().catch((erro) => {
  console.error("Falha inesperada no coletor:", erro);
  process.exitCode = 1;
});
