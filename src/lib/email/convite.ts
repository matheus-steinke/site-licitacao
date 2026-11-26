// E-mail de convite para entrar numa empresa já cadastrada.

import { NOME_APP } from "../app";
import { escapar, ESTILO, moldura } from "./layout";

export function montarConvite(dados: { empresa: string; convidadoPor: string | null; emailConvidado: string; link: string }) {
  const quem = dados.convidadoPor ? `${dados.convidadoPor} convidou você` : "Você recebeu um convite";
  const assunto = `Convite para entrar em ${dados.empresa} no ${NOME_APP}`;
  const corpoHtml = `
<p style="margin:0 0 12px">Olá,</p>
<p style="margin:0 0 12px">${escapar(quem)} para acompanhar as licitações de <strong>${escapar(dados.empresa)}</strong> no ${escapar(NOME_APP)}.</p>
<p style="margin:0 0 20px">Para aceitar, crie a sua conta (ou entre) com este e-mail: <strong>${escapar(dados.emailConvidado)}</strong>.</p>
<p style="margin:0 0 20px"><a href="${escapar(dados.link)}" style="${ESTILO.botao}">Aceitar o convite</a></p>
<p style="margin:0;${ESTILO.discreto}">Se o botão não abrir, copie este endereço no navegador:<br>${escapar(dados.link)}</p>`;
  const texto = [
    "Olá,",
    "",
    `${quem} para acompanhar as licitações de ${dados.empresa} no ${NOME_APP}.`,
    `Para aceitar, crie a sua conta (ou entre) com este e-mail: ${dados.emailConvidado}.`,
    "",
    `Aceitar o convite: ${dados.link}`,
    "",
    "O convite vale por 14 dias. Se você não esperava este e-mail, pode ignorá-lo.",
  ].join("\n");
  return {
    assunto,
    html: moldura({
      titulo: assunto,
      corpoHtml,
      rodapeHtml: "O convite vale por 14 dias. Se você não esperava este e-mail, pode ignorá-lo.",
    }),
    texto,
  };
}
