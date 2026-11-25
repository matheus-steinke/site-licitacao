// Provedores de integração. O Google é o único implementado; os demais já têm lugar no banco
// (coluna "provedor") e nesta lista, para aparecerem na tela como "em breve".
//
// Para acrescentar um provedor: 1) implemente as reações em uma pasta própria (como google/),
// 2) chame-as em sincronizar.ts, onde hoje só o Google é tratado, 3) marque "disponivel".
// As duas reações que todo provedor precisa atender:
//   - oportunidade aprovada (ou botão "Sincronizar"): criar o que for dele (evento, pasta, aviso);
//   - a licitação mudou (data da disputa, situação) ou deixou de estar aprovada: atualizar ou desfazer.

export const PROVEDORES = ["google", "microsoft", "whatsapp", "webhook"] as const;
export type IdDoProvedor = (typeof PROVEDORES)[number];

export type Provedor = {
  id: IdDoProvedor;
  nome: string;
  descricao: string;
  /** false = só o lugar reservado, sem implementação. */
  disponivel: boolean;
};

export const CATALOGO_DE_PROVEDORES: Provedor[] = [
  {
    id: "google",
    nome: "Google Agenda e Drive",
    descricao: "Cria o evento da disputa na agenda e as pastas do processo no Drive, com os arquivos do edital.",
    disponivel: true,
  },
  {
    id: "microsoft",
    nome: "Outlook e OneDrive (Microsoft 365)",
    descricao: "Evento no calendário do Outlook e pastas no OneDrive.",
    disponivel: false,
  },
  {
    id: "whatsapp",
    nome: "WhatsApp",
    descricao: "Aviso das oportunidades novas e das disputas do dia.",
    disponivel: false,
  },
  {
    id: "webhook",
    nome: "Webhook",
    descricao: "Envia cada oportunidade aprovada para um endereço do seu sistema.",
    disponivel: false,
  },
];
