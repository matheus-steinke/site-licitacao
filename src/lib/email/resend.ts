// Envio de e-mail pelo Resend (https://resend.com), por REST. Usado pelo app (convites) e pelo
// agendador (e-mail diário). Sem a chave, quem chama decide o que fazer; aqui só se envia.

const URL_DO_RESEND = "https://api.resend.com/emails";
/** Remetente de testes do Resend: só entrega para o e-mail da própria conta do Resend. */
export const REMETENTE_DE_TESTE = "Licita Saúde <onboarding@resend.dev>";

export type ConfiguracaoDeEmail = { apiKey: string; remetente: string };

/** RESEND_API_KEY e, opcionalmente, EMAIL_REMETENTE. null = envio de e-mail não configurado. */
export function configuracaoDeEmail(ambiente: Record<string, string | undefined> = process.env): ConfiguracaoDeEmail | null {
  const apiKey = (ambiente.RESEND_API_KEY ?? "").trim();
  if (!apiKey) return null;
  return { apiKey, remetente: (ambiente.EMAIL_REMETENTE ?? "").trim() || REMETENTE_DE_TESTE };
}

export type Email = {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  /** Mesmo valor = mesmo e-mail: o Resend não envia de novo (protege contra repetição). */
  idempotencia?: string;
};

export class ErroDeEmail extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

/** Mensagem do Resend em português, para as causas mais comuns. */
function explicar(status: number, mensagem: string): string {
  if (status === 401 || /api key is invalid/i.test(mensagem)) return "A chave do Resend é inválida.";
  if (status === 403 && /testing emails|verify a domain|own email/i.test(mensagem)) {
    return "Sem domínio verificado no Resend, só é possível enviar para o e-mail da própria conta do Resend.";
  }
  if (status === 403) return `O Resend recusou o remetente: ${mensagem}`;
  if (status === 429) return "Limite de envios do Resend atingido. Tente mais tarde.";
  return `O Resend respondeu com erro (${status}): ${mensagem}`;
}

export async function enviarEmail(config: ConfiguracaoDeEmail, email: Email, buscar: typeof fetch = fetch): Promise<{ id: string | null }> {
  let resposta: Response;
  try {
    resposta = await buscar(URL_DO_RESEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(email.idempotencia ? { "Idempotency-Key": email.idempotencia.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: config.remetente, to: [email.para], subject: email.assunto, html: email.html, text: email.texto }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (erro) {
    throw new ErroDeEmail(`Não foi possível falar com o Resend: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  const dados = (await resposta.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!resposta.ok) throw new ErroDeEmail(explicar(resposta.status, dados.message ?? dados.name ?? "sem detalhe"), resposta.status);
  return { id: dados.id ?? null };
}
