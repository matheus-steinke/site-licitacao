// Leitura e gravação do e-mail diário no Supabase. Usado pelo agendador, com a chave de serviço.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/tipos";
import type { OportunidadeDoEmail } from "./diario";
import type { ArmazenamentoDoEmail, EnvioDoDia } from "./envio-diario";

/** Situações do PNCP em que a licitação não vai acontecer: revogada, anulada e excluída. */
const SITUACOES_ENCERRADAS = "(2,3,99)";
/** Texto gravado enquanto o envio do dia não termina (ou se o processo parar no meio). */
export const ENVIO_NAO_CONCLUIDO = "O envio não foi concluído.";

export const COLUNAS_DA_OPORTUNIDADE =
  "id, orgao_nome, modalidade_nome, numero_compra, uf, municipio, data_disputa, objeto, prioridade, itens_compativeis, itens_a_verificar, itens_do_segmento";

type LinhaDaLista = Pick<
  Database["public"]["Views"]["oportunidades_lista"]["Row"],
  "id" | "orgao_nome" | "modalidade_nome" | "numero_compra" | "uf" | "municipio" | "data_disputa" | "objeto" | "prioridade" | "itens_compativeis" | "itens_a_verificar" | "itens_do_segmento"
>;

export function paraOportunidadeDoEmail(linha: LinhaDaLista): OportunidadeDoEmail {
  return {
    id: linha.id ?? "",
    orgao: linha.orgao_nome ?? "Órgão não informado",
    modalidade: linha.modalidade_nome ?? "Licitação",
    numeroCompra: linha.numero_compra,
    uf: linha.uf ?? "",
    municipio: linha.municipio,
    dataDisputa: linha.data_disputa,
    objeto: linha.objeto ?? "",
    prioridade: linha.prioridade ?? 0,
    itensCompativeis: linha.itens_compativeis ?? 0,
    itensAVerificar: linha.itens_a_verificar ?? 0,
    itensDoSegmento: linha.itens_do_segmento ?? 0,
  };
}

export function criarArmazenamentoDoEmail(supabase: SupabaseClient<Database>): ArmazenamentoDoEmail {
  const falhar = (oQue: string, mensagem: string): never => {
    throw new Error(`Falha ao ${oQue}: ${mensagem}`);
  };
  const paraEnvio = (linha: { id: string; status: string; criado_em: string }): EnvioDoDia => ({
    id: linha.id, status: linha.status as EnvioDoDia["status"], criadoEm: linha.criado_em,
  });

  return {
    async empresas(soUma) {
      let consulta = supabase
        .from("organizacoes")
        .select("id, razao_social, email_diario_hora")
        .eq("email_diario", true)
        .not("onboarding_concluido_em", "is", null)
        .order("criado_em");
      if (soUma) consulta = consulta.eq("id", soUma);
      const { data, error } = await consulta;
      if (error) falhar("listar as empresas", error.message);
      return (data ?? []).map((o) => ({ id: o.id, razaoSocial: o.razao_social, hora: o.email_diario_hora }));
    },

    async envioDoDia(orgId, dia) {
      const { data, error } = await supabase
        .from("email_envios")
        .select("id, status, criado_em")
        .eq("org_id", orgId).eq("tipo", "diario").eq("dia", dia)
        .maybeSingle();
      if (error) falhar("ler o envio do dia", error.message);
      return data ? paraEnvio(data) : null;
    },

    async ultimoConcluido(orgId, antesDoDia) {
      const { data, error } = await supabase
        .from("email_envios")
        .select("criado_em")
        .eq("org_id", orgId).eq("tipo", "diario").in("status", ["enviado", "vazio"]).lt("dia", antesDoDia)
        .order("dia", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) falhar("ler o último envio", error.message);
      return data?.criado_em ?? null;
    },

    async reservar(orgId, dia) {
      const { data, error } = await supabase
        .from("email_envios")
        .insert({ org_id: orgId, tipo: "diario", dia, status: "erro", erro: ENVIO_NAO_CONCLUIDO })
        .select("id, status, criado_em")
        .single();
      if (error) falhar("registrar o envio", error.message);
      return paraEnvio(data!);
    },

    async concluir(id, dados) {
      const { error } = await supabase
        .from("email_envios")
        .update({ status: dados.status, destinatarios: dados.destinatarios, oportunidades: dados.oportunidades, erro: dados.erro })
        .eq("id", id);
      if (error) falhar("gravar o resultado do envio", error.message);
    },

    async destinatarios(orgId) {
      const { data, error } = await supabase
        .from("membros")
        .select("user_id, email")
        .eq("org_id", orgId).eq("recebe_email_diario", true)
        .order("criado_em");
      if (error) falhar("listar os destinatários", error.message);
      return (data ?? []).filter((m) => m.email).map((m) => ({ userId: m.user_id, email: m.email }));
    },

    async oportunidadesNovas(orgId, desde, ate, agora) {
      const { data, error } = await supabase
        .from("oportunidades_lista")
        .select(COLUNAS_DA_OPORTUNIDADE)
        .eq("org_id", orgId).eq("status", "nova").gte("prioridade", 1).eq("exemplo", false)
        .not("situacao_id", "in", SITUACOES_ENCERRADAS)
        .gte("data_disputa", agora).gt("criado_em", desde).lte("criado_em", ate)
        .order("prioridade", { ascending: false })
        .order("data_disputa", { ascending: true })
        .limit(1000);
      if (error) falhar("listar as oportunidades novas", error.message);
      return (data ?? []).map(paraOportunidadeDoEmail);
    },
  };
}
