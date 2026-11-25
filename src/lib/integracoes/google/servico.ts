// Chamadas à Agenda e ao Drive do Google, por REST, com um token de acesso já renovado.
// Só o que a integração usa: eventos (criar, alterar, remover) e arquivos criados pelo app
// (pastas e envio de arquivos). O escopo drive.file só enxerga o que o próprio app criou.

import type { EventoDaAgenda } from "../conteudo";
import { ErroDeAcesso } from "./oauth";

const AGENDA = "https://www.googleapis.com/calendar/v3";
const DRIVE = "https://www.googleapis.com/drive/v3";
const ENVIO = "https://www.googleapis.com/upload/drive/v3/files";
const TIPO_PASTA = "application/vnd.google-apps.folder";

/** Falha de uma chamada ao Google, com o status HTTP. */
export class ErroDoGoogle extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly motivo?: string,
  ) {
    super(mensagem);
  }
}

/** O recurso (evento, pasta, agenda) não existe mais ou o app não o enxerga. */
export const naoExiste = (erro: unknown) => erro instanceof ErroDoGoogle && (erro.status === 404 || erro.status === 410);

export type EventoCriado = { id: string; link: string | null };
export type Pasta = { id: string; link: string | null };
export type ArquivoEnviado = { id: string; nome: string };

export type ServicoGoogle = ReturnType<typeof criarServicoGoogle>;

export function criarServicoGoogle(tokenDeAcesso: string, buscar: typeof fetch = fetch) {
  async function chamar<T>(url: string, opcoes: { metodo?: string; corpo?: unknown; semResposta?: boolean } = {}): Promise<T> {
    const resposta = await buscar(url, {
      method: opcoes.metodo ?? "GET",
      headers: {
        Authorization: `Bearer ${tokenDeAcesso}`,
        ...(opcoes.corpo === undefined ? {} : { "Content-Type": "application/json; charset=UTF-8" }),
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      signal: AbortSignal.timeout(30_000),
    });
    if (resposta.ok) return (opcoes.semResposta || resposta.status === 204 ? undefined : await resposta.json()) as T;

    const erro = (await resposta.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[]; status?: string };
    } | null;
    const motivo = erro?.error?.errors?.[0]?.reason ?? erro?.error?.status;
    const mensagem = erro?.error?.message ?? `HTTP ${resposta.status}`;
    if (resposta.status === 401) throw new ErroDeAcesso("O acesso ao Google expirou ou foi revogado.");
    throw new ErroDoGoogle(mensagem, resposta.status, motivo);
  }

  const eventos = (agendaId: string) => `${AGENDA}/calendars/${encodeURIComponent(agendaId)}/events`;
  /** Dentro de uma consulta do Drive, aspas simples e barras invertidas precisam de escape. */
  const literal = (texto: string) => `'${texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

  return {
    async criarEvento(agendaId: string, evento: EventoDaAgenda): Promise<EventoCriado> {
      const criado = await chamar<{ id: string; htmlLink?: string }>(eventos(agendaId), { metodo: "POST", corpo: evento });
      return { id: criado.id, link: criado.htmlLink ?? null };
    },

    /** "confirmed" traz de volta um evento que o usuário tenha apagado da agenda. */
    async atualizarEvento(agendaId: string, eventoId: string, evento: EventoDaAgenda): Promise<EventoCriado> {
      const alterado = await chamar<{ id: string; htmlLink?: string }>(`${eventos(agendaId)}/${encodeURIComponent(eventoId)}`, {
        metodo: "PATCH",
        corpo: { ...evento, status: "confirmed" },
      });
      return { id: alterado.id, link: alterado.htmlLink ?? null };
    },

    /** Remover um evento que já não existe não é erro. */
    async removerEvento(agendaId: string, eventoId: string): Promise<void> {
      try {
        await chamar<void>(`${eventos(agendaId)}/${encodeURIComponent(eventoId)}`, { metodo: "DELETE", semResposta: true });
      } catch (erro) {
        if (!naoExiste(erro)) throw erro;
      }
    },

    async criarPasta(nome: string, paiId: string | null): Promise<Pasta> {
      const criada = await chamar<{ id: string; webViewLink?: string }>(`${DRIVE}/files?fields=id,webViewLink`, {
        metodo: "POST",
        corpo: { name: nome, mimeType: TIPO_PASTA, ...(paiId ? { parents: [paiId] } : {}) },
      });
      return { id: criada.id, link: criada.webViewLink ?? null };
    },

    /** A pasta ainda existe e não está na lixeira? */
    async pastaExiste(id: string): Promise<boolean> {
      try {
        const pasta = await chamar<{ trashed?: boolean }>(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id,trashed`);
        return pasta.trashed !== true;
      } catch (erro) {
        if (naoExiste(erro)) return false;
        throw erro;
      }
    },

    /** Procura, entre as pastas criadas pelo app, uma com este nome dentro da pasta-mãe. */
    async buscarPasta(nome: string, paiId: string): Promise<Pasta | null> {
      const consulta = `name = ${literal(nome)} and ${literal(paiId)} in parents and mimeType = '${TIPO_PASTA}' and trashed = false`;
      const parametros = new URLSearchParams({ q: consulta, fields: "files(id,webViewLink)", pageSize: "1", spaces: "drive" });
      const achadas = await chamar<{ files?: { id: string; webViewLink?: string }[] }>(`${DRIVE}/files?${parametros}`);
      const primeira = achadas.files?.[0];
      return primeira ? { id: primeira.id, link: primeira.webViewLink ?? null } : null;
    },

    async renomear(id: string, nome: string): Promise<void> {
      await chamar<unknown>(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id`, { metodo: "PATCH", corpo: { name: nome } });
    },

    /** Envio em duas etapas (sessão e conteúdo), que serve para qualquer tamanho. */
    async enviarArquivo(nome: string, tipo: string, conteudo: Uint8Array, paiId: string): Promise<ArquivoEnviado> {
      const sessao = await buscar(`${ENVIO}?uploadType=resumable&fields=id,name`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenDeAcesso}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": tipo,
          "X-Upload-Content-Length": String(conteudo.byteLength),
        },
        body: JSON.stringify({ name: nome, parents: [paiId] }),
        signal: AbortSignal.timeout(30_000),
      });
      const destino = sessao.headers.get("location");
      if (sessao.status === 401) throw new ErroDeAcesso("O acesso ao Google expirou ou foi revogado.");
      if (!sessao.ok || !destino) throw new ErroDoGoogle(`Não foi possível iniciar o envio de "${nome}".`, sessao.status);

      const envio = await buscar(destino, {
        method: "PUT",
        headers: { "Content-Type": tipo, "Content-Length": String(conteudo.byteLength) },
        body: conteudo as BodyInit,
        signal: AbortSignal.timeout(180_000),
      });
      if (!envio.ok) throw new ErroDoGoogle(`O envio de "${nome}" falhou.`, envio.status);
      const enviado = (await envio.json()) as { id: string; name?: string };
      return { id: enviado.id, nome: enviado.name ?? nome };
    },
  };
}
