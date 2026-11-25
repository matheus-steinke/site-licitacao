// Acesso ao banco para a sincronização das integrações. Recebe um cliente do Supabase: com a
// sessão do usuário, no app (vale o RLS), ou com a chave de serviço, no coletor.

import type { SupabaseClient } from "@supabase/supabase-js";

import { linkDoPncp, SITUACOES } from "../licitacao";
import type { Database, Json } from "../supabase/tipos";
import { descreverAlerta, lerAlertas } from "../triagem/alertas";
import type { ItemParaIntegrar } from "./conteudo";
import type { Armazenamento, Integracao, OportunidadeParaIntegrar, Vinculo } from "./sincronizar";

type Cliente = SupabaseClient<Database>;
type LinhaDeVinculo = Database["public"]["Tables"]["integracao_vinculos"]["Row"];
type LinhaDeIntegracao = Database["public"]["Tables"]["integracoes"]["Row"];

const COLUNAS_DO_VINCULO = "id, tipo, id_externo, link, dados, situacao, erro, atualizado_em";

function paraVinculo(linha: Pick<LinhaDeVinculo, "id" | "tipo" | "id_externo" | "link" | "dados" | "situacao" | "erro" | "atualizado_em">): Vinculo {
  const dados = typeof linha.dados === "object" && linha.dados !== null && !Array.isArray(linha.dados) ? linha.dados : {};
  return {
    id: linha.id,
    tipo: linha.tipo === "pasta" ? "pasta" : "evento",
    idExterno: linha.id_externo,
    link: linha.link,
    dados: dados as Vinculo["dados"],
    situacao: linha.situacao === "ok" || linha.situacao === "erro" ? linha.situacao : "pendente",
    erro: linha.erro,
    atualizadoEm: linha.atualizado_em,
  };
}

export function paraIntegracao(linha: LinhaDeIntegracao): Integracao {
  return {
    id: linha.id,
    conta: linha.conta,
    credenciais: linha.credenciais,
    escopos: linha.escopos,
    agendaAtiva: linha.agenda_ativa,
    agendaId: linha.agenda_id,
    driveAtivo: linha.drive_ativo,
    pastaRaizNome: linha.pasta_raiz_nome,
    pastaRaizId: linha.pasta_raiz_id,
    automatico: linha.automatico,
    erro: linha.erro,
  };
}

function falhar(onde: string, mensagem: string): never {
  throw new Error(`Integrações: falha ao ${onde}: ${mensagem}`);
}

export function criarArmazenamento(supabase: Cliente, provedor = "google"): Armazenamento {
  return {
    async carregarIntegracao(orgId) {
      const { data, error } = await supabase
        .from("integracoes")
        .select("*")
        .eq("org_id", orgId)
        .eq("provedor", provedor)
        .maybeSingle();
      if (error) falhar("ler a integração", error.message);
      return data ? paraIntegracao(data) : null;
    },

    async carregarOportunidade(orgId, oportunidadeId): Promise<OportunidadeParaIntegrar | null> {
      const { data: linha, error } = await supabase
        .from("oportunidades_lista")
        .select(
          "id, compra_id, status, alertas, numero_compra, ano, sequencial, orgao_cnpj, orgao_nome, modalidade_nome, objeto, uf, municipio, data_disputa, situacao_id, exemplo",
        )
        .eq("org_id", orgId)
        .eq("id", oportunidadeId)
        .maybeSingle();
      if (error) falhar("ler a oportunidade", error.message);
      if (!linha?.id || !linha.compra_id) return null;

      const [casados, arquivos] = await Promise.all([
        supabase
          .from("oportunidade_itens")
          .select("nivel, item:compra_itens (numero_item, descricao, quantidade, unidade), produto:produtos (codigo, nome)")
          .eq("oportunidade_id", oportunidadeId),
        supabase
          .from("compra_arquivos")
          .select("id, sequencial_documento, titulo, url")
          .eq("compra_id", linha.compra_id)
          .order("sequencial_documento"),
      ]);
      if (casados.error ?? arquivos.error) falhar("ler os itens e arquivos", (casados.error ?? arquivos.error)?.message ?? "");

      const itens: ItemParaIntegrar[] = (casados.data ?? []).flatMap((c) =>
        c.item && c.produto
          ? [
              {
                numero: c.item.numero_item,
                descricao: c.item.descricao,
                quantidade: c.item.quantidade,
                unidade: c.item.unidade,
                nivel: c.nivel === "compativel" ? ("compativel" as const) : ("verificar" as const),
                produto: `${c.produto.codigo} - ${c.produto.nome}`,
              },
            ]
          : [],
      );
      const situacaoId = linha.situacao_id ?? 1;
      return {
        status: linha.status ?? "nova",
        licitacao: {
          oportunidadeId,
          numeroCompra: linha.numero_compra,
          ano: linha.ano ?? new Date().getFullYear(),
          modalidade: linha.modalidade_nome ?? "",
          orgao: linha.orgao_nome ?? "Órgão não informado",
          objeto: linha.objeto ?? "",
          uf: linha.uf ?? "",
          municipio: linha.municipio,
          dataDisputa: linha.data_disputa,
          situacao: situacaoId === 1 ? null : (SITUACOES[situacaoId] ?? "com a situação alterada"),
          linkPncp:
            linha.exemplo || !linha.orgao_cnpj || !linha.ano || !linha.sequencial
              ? null
              : linkDoPncp({ orgao_cnpj: linha.orgao_cnpj, ano: linha.ano, sequencial: linha.sequencial }),
          itens,
          alertas: lerAlertas(linha.alertas).map((alerta) => descreverAlerta(alerta).texto),
        },
        arquivos: (arquivos.data ?? []).map((a) => ({ id: a.id, sequencial: a.sequencial_documento, titulo: a.titulo, url: a.url })),
      };
    },

    async listarVinculos(orgId, oportunidadeId) {
      const { data, error } = await supabase
        .from("integracao_vinculos")
        .select(COLUNAS_DO_VINCULO)
        .eq("org_id", orgId)
        .eq("oportunidade_id", oportunidadeId)
        .eq("provedor", provedor);
      if (error) falhar("ler os vínculos", error.message);
      return (data ?? []).map(paraVinculo);
    },

    async reservarVinculo(orgId, oportunidadeId, tipo) {
      const criado = await supabase
        .from("integracao_vinculos")
        .insert({ org_id: orgId, oportunidade_id: oportunidadeId, provedor, tipo })
        .select(COLUNAS_DO_VINCULO)
        .single();
      if (!criado.error) return { vinculo: paraVinculo(criado.data), novo: true };
      // 23505 = já existe (outra sincronização reservou antes).
      if (criado.error.code !== "23505") falhar("reservar o vínculo", criado.error.message);
      const existente = await supabase
        .from("integracao_vinculos")
        .select(COLUNAS_DO_VINCULO)
        .eq("oportunidade_id", oportunidadeId)
        .eq("provedor", provedor)
        .eq("tipo", tipo)
        .single();
      if (existente.error) falhar("ler o vínculo reservado", existente.error.message);
      return { vinculo: paraVinculo(existente.data), novo: false };
    },

    async salvarVinculo(id, campos) {
      const { error } = await supabase
        .from("integracao_vinculos")
        .update({
          ...(campos.idExterno !== undefined ? { id_externo: campos.idExterno } : {}),
          ...(campos.link !== undefined ? { link: campos.link } : {}),
          ...(campos.dados !== undefined ? { dados: campos.dados as unknown as Json } : {}),
          ...(campos.situacao !== undefined ? { situacao: campos.situacao } : {}),
          ...(campos.erro !== undefined ? { erro: campos.erro ? campos.erro.slice(0, 500) : null } : {}),
        })
        .eq("id", id);
      if (error) falhar("gravar o vínculo", error.message);
    },

    async removerVinculo(id) {
      const { error } = await supabase.from("integracao_vinculos").delete().eq("id", id);
      if (error) falhar("remover o vínculo", error.message);
    },

    async registrarEstado(integracaoId, estado) {
      const { error } = await supabase
        .from("integracoes")
        .update({
          ...(estado.pastaRaizId !== undefined ? { pasta_raiz_id: estado.pastaRaizId } : {}),
          ...(estado.erro !== undefined ? { erro: estado.erro } : {}),
        })
        .eq("id", integracaoId);
      if (error) falhar("registrar o estado da integração", error.message);
    },

    async listarCandidatas(orgId, disputaDesde) {
      const [aprovadas, vinculos] = await Promise.all([
        supabase
          .from("oportunidades_lista")
          .select("id")
          .eq("org_id", orgId)
          .eq("status", "aprovada")
          .gte("data_disputa", disputaDesde)
          .order("data_disputa")
          .limit(500),
        supabase
          .from("integracao_vinculos")
          .select("oportunidade_id, tipo, situacao")
          .eq("org_id", orgId)
          .eq("provedor", provedor)
          .limit(5000),
      ]);
      if (aprovadas.error ?? vinculos.error) falhar("listar as oportunidades", (aprovadas.error ?? vinculos.error)?.message ?? "");

      const candidatas = new Set((aprovadas.data ?? []).flatMap((o) => (o.id ? [o.id] : [])));
      // Envio de arquivos que ficou pela metade, em qualquer data.
      for (const v of vinculos.data ?? []) {
        if (v.tipo === "pasta" && v.situacao === "pendente") candidatas.add(v.oportunidade_id);
      }
      // Evento de uma oportunidade que deixou de estar aprovada: precisa sair da agenda.
      const comEvento = [...new Set((vinculos.data ?? []).filter((v) => v.tipo === "evento").map((v) => v.oportunidade_id))];
      for (let i = 0; i < comEvento.length; i += 100) {
        const { data, error } = await supabase
          .from("oportunidades")
          .select("id, status")
          .in("id", comEvento.slice(i, i + 100));
        if (error) falhar("ler a situação das oportunidades", error.message);
        for (const o of data ?? []) {
          if (o.status === "nova" || o.status === "descartada") candidatas.add(o.id);
        }
      }
      return [...candidatas];
    },
  };
}
