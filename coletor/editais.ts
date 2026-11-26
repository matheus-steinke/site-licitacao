// Leitura dos editais das licitações abertas, rodada depois da coleta (GitHub Actions) ou à mão:
//   pnpm editais                 lê o que estiver pendente, por até 10 minutos
//   pnpm editais --minutos 40    muda o tempo máximo (útil na primeira carga)
//   pnpm editais --max 20        lê no máximo 20 licitações
// Baixa o edital e o termo de referência do PNCP, extrai o texto com o pdftotext (pacote
// poppler-utils) e grava só os alertas e os trechos: o texto inteiro não é guardado.
// Usa a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), como o coletor.

import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "../src/lib/supabase/tipos";
import { criarDownload, lerEditais, type EditalPendente, type RepositorioDeEditais } from "./edital-leitura";
import { extrairTexto, PdftotextAusente } from "./edital-texto";
import { problemaNaChave } from "./index";

function numero(nome: string, ambiente: string | undefined, padrao: number): number {
  const posicao = process.argv.indexOf(`--${nome}`);
  const valor = Number(posicao >= 0 ? process.argv[posicao + 1] : ambiente);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
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

  const repositorio: RepositorioDeEditais = {
    async pendentes(versao, limite) {
      const { data, error } = await supabase.rpc("coletor_editais_pendentes", { p_versao: versao, p_limite: limite });
      if (error) throw new Error(`Falha ao listar os editais pendentes: ${error.message}`);
      return data as unknown as { restantes: number; compras: EditalPendente[] };
    },
    async gravar(leitura) {
      const { error } = await supabase.rpc("coletor_gravar_edital", {
        p_compra: leitura.compraId,
        p_status: leitura.status,
        p_alertas: leitura.alertas as unknown as Json,
        p_trechos: leitura.trechos as unknown as Json,
        p_assinatura: leitura.assinatura,
        p_versao: leitura.versao,
        p_arquivos_lidos: leitura.arquivosLidos,
        p_arquivos_total: leitura.arquivosTotal,
        p_erro: leitura.erro ?? undefined,
      });
      if (error) throw new Error(`Falha ao gravar a leitura do edital: ${error.message}`);
    },
  };

  const minutos = numero("minutos", process.env.EDITAIS_MINUTOS, 10);
  const resumo = await lerEditais(
    { repositorio, baixar: criarDownload(), extrair: (conteudo) => extrairTexto(conteudo), registrar: (m) => console.log(m) },
    { tempoMaximoMs: minutos * 60_000, maxCompras: numero("max", process.env.EDITAIS_MAXIMO, 2000) },
  );
  console.log(
    `editais: ${resumo.lidas} lidos (${resumo.comExigencia} com exigência clara, ${resumo.comCitacao} só com citação), ` +
      `${resumo.semTexto} sem texto legível, ${resumo.erros} com erro, ${resumo.restantes} na fila` +
      (resumo.interrompida ? `; parou porque ${resumo.interrompida}` : ""),
  );
}

principal().catch((erro) => {
  if (erro instanceof PdftotextAusente) console.error(`editais: ${erro.message}`);
  else console.error("Falha inesperada na leitura dos editais:", erro);
  process.exitCode = 1;
});
