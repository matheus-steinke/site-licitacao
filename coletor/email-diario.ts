// E-mail diário com as oportunidades novas de cada empresa, rodado de hora em hora (GitHub
// Actions) ou à mão:
//   pnpm email-diario                 todas as empresas que estão na hora
//   pnpm email-diario --org <id>      só uma
//   pnpm email-diario --simular       não envia nem grava: só diz o que faria
//   pnpm email-diario --agora         ignora a hora escolhida pela empresa (o envio continua
//                                     sendo um por dia)
// Cada empresa escolhe a hora em Configurações > Notificações; o registro em email_envios
// garante um envio por dia. Dia sem oportunidade nova não gera e-mail.
//
// Usa a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), a chave do Resend (RESEND_API_KEY, a mesma
// da Vercel), o remetente (EMAIL_REMETENTE, opcional) e o endereço do app (SITE_URL). Sem a
// chave do Resend, não faz nada.

import { createClient } from "@supabase/supabase-js";

import { criarArmazenamentoDoEmail } from "../src/lib/email/armazenamento";
import { diaEHora, enviarEmailsDiarios } from "../src/lib/email/envio-diario";
import { configuracaoDeEmail } from "../src/lib/email/resend";
import type { Database } from "../src/lib/supabase/tipos";
import { problemaNaChave } from "./index";

function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);
  return posicao >= 0 ? process.argv[posicao + 1] : undefined;
}
const opcao = (nome: string) => process.argv.includes(`--${nome}`);

async function principal() {
  // A simulação não envia nada: funciona mesmo sem a chave do Resend.
  const config = configuracaoDeEmail() ?? (opcao("simular") ? { apiKey: "", remetente: "" } : null);
  if (!config) {
    console.log("e-mail diário: RESEND_API_KEY não definida; nada a fazer.");
    return;
  }
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, "");
  const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (!url || !chave) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja o README, seção Coletor).");
    process.exitCode = 1;
    return;
  }
  if (!/^https?:\/\//.test(site)) {
    console.error("Defina SITE_URL com o endereço do app (ex.: https://seu-app.vercel.app): é para onde os links do e-mail apontam.");
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

  const agora = new Date();
  const { dia, hora } = diaEHora(agora);
  console.log(`e-mail diário: ${dia}, ${hora}h em Brasília${opcao("simular") ? " (simulação)" : ""}`);
  const resultados = await enviarEmailsDiarios(criarArmazenamentoDoEmail(supabase), config, {
    agora,
    site,
    simular: opcao("simular"),
    ignorarHora: opcao("agora"),
    soUma: argumento("org"),
  });

  const frases: Record<(typeof resultados)[number]["situacao"], (r: (typeof resultados)[number]) => string> = {
    enviado: (r) => `enviado a ${r.destinatarios} pessoa(s), com ${r.oportunidades} oportunidade(s)${r.erro ? `; falhas: ${r.erro}` : ""}`,
    vazio: () => "nenhuma oportunidade nova; nada enviado",
    erro: (r) => `falhou: ${r.erro}`,
    cedo: () => "ainda não é a hora escolhida",
    ja_feito: () => "o envio de hoje já foi feito",
    sem_destinatarios: () => "ninguém da empresa quer receber",
    simulado: (r) => `enviaria a ${r.destinatarios} pessoa(s), com ${r.oportunidades} oportunidade(s)`,
  };
  for (const r of resultados) console.log(`e-mail diário: ${r.empresa}: ${frases[r.situacao](r)}`);

  const falhas = resultados.filter((r) => r.situacao === "erro").length;
  const tentadas = resultados.filter((r) => r.situacao === "erro" || r.situacao === "enviado").length;
  console.log(`e-mail diário: ${resultados.length} empresa(s) com o e-mail ligado, ${falhas} com falha`);
  // Falha em uma empresa não derruba o agendamento; em todas as que tentaram enviar, sim.
  if (falhas > 0 && falhas === tentadas) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error("Falha inesperada no e-mail diário:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
