// Moldura comum dos e-mails: HTML simples, com estilos na própria linha (é o que os programas
// de e-mail aceitam), e a versão em texto puro.

import { NOME_APP } from "../app";

export function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const ESTILO = {
  botao:
    "display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;font-size:14px",
  link: "color:#171717;font-weight:600",
  discreto: "color:#737373;font-size:13px;line-height:1.5",
};

export function moldura(opcoes: { titulo: string; corpoHtml: string; rodapeHtml: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(opcoes.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e5e5;font-size:16px;font-weight:700">${escapar(NOME_APP)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${opcoes.corpoHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;${ESTILO.discreto}">${opcoes.rodapeHtml}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
