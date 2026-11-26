import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

import { COLUNAS_DA_OPORTUNIDADE, paraOportunidadeDoEmail } from "./armazenamento";
import { montarConvite } from "./convite";
import { MAXIMO_NO_EMAIL, montarEmailDiario, type OportunidadeDoEmail } from "./diario";
import { configuracaoDeEmail, enviarEmail } from "./resend";

/** A chave do Resend (RESEND_API_KEY) existe no servidor. */
export function emailConfigurado(): boolean {
  return configuracaoDeEmail() !== null;
}

export type ResultadoDoEnvio = { enviado: true } | { enviado: false; motivo: "nao_configurado" | "falhou"; erro?: string };

async function enviar(email: Parameters<typeof enviarEmail>[1], contexto: string): Promise<ResultadoDoEnvio> {
  const config = configuracaoDeEmail();
  if (!config) return { enviado: false, motivo: "nao_configurado" };
  try {
    await enviarEmail(config, email);
    return { enviado: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[email] ${contexto}:`, mensagem);
    return { enviado: false, motivo: "falhou", erro: mensagem };
  }
}

/** E-mail de convite. Nunca lança erro: o convite já foi criado e o link pode ser copiado. */
export async function enviarConvite(dados: { empresa: string; convidadoPor: string | null; emailConvidado: string; link: string }): Promise<ResultadoDoEnvio> {
  return enviar({ para: dados.emailConvidado, ...montarConvite(dados) }, "convite");
}

const EXEMPLO: OportunidadeDoEmail = {
  id: "", orgao: "Hospital de exemplo (teste de envio)", modalidade: "Pregão - Eletrônico", numeroCompra: "00/0000",
  uf: "SP", municipio: "São Paulo", dataDisputa: null, objeto: "Você ainda não tem oportunidades novas. Este item é só um exemplo de como elas aparecem no e-mail.",
  prioridade: 3, itensCompativeis: 2, itensAVerificar: 1, itensDoSegmento: 3,
};

/** Manda para a própria pessoa um e-mail diário montado com as oportunidades novas de agora. */
export async function enviarEmailDeTeste(dados: { orgId: string; empresa: string; para: string; site: string }): Promise<ResultadoDoEnvio> {
  if (!emailConfigurado()) return { enviado: false, motivo: "nao_configurado" };
  const supabase = await criarClienteServidor();
  const agora = new Date();
  const { data, error } = await supabase
    .from("oportunidades_lista")
    .select(COLUNAS_DA_OPORTUNIDADE)
    .eq("org_id", dados.orgId).eq("status", "nova").gte("prioridade", 1).eq("exemplo", false)
    .gte("data_disputa", agora.toISOString())
    .order("prioridade", { ascending: false })
    .order("data_disputa", { ascending: true })
    .limit(MAXIMO_NO_EMAIL);
  if (error) {
    console.error("[email] teste:", error.message);
    return { enviado: false, motivo: "falhou", erro: "Não foi possível ler as oportunidades." };
  }
  const oportunidades = data.length > 0 ? data.map(paraOportunidadeDoEmail) : [EXEMPLO];
  const email = montarEmailDiario({ empresa: dados.empresa, oportunidades, site: dados.site, agora });
  return enviar({ para: dados.para, ...email, assunto: `[Teste] ${email.assunto}` }, "teste");
}
