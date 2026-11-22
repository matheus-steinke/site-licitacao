import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { duracao, SeloDeStatus } from "@/components/admin/rodadas";
import { exigirAdmin } from "@/lib/auth";
import { formatarDataHora } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rodada do coletor · Admin" };

const ETAPAS: Record<string, string> = {
  busca: "Busca",
  plano_b: "Plano B",
  itens: "Itens",
  arquivos: "Arquivos",
  detalhe: "Detalhe",
  rodada: "Rodada",
  pncp: "PNCP",
};

export default async function PaginaRodada({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await criarClienteServidor();
  const [{ data: rodada }, { data: erros }] = await Promise.all([
    supabase.from("coletor_rodadas").select("*").eq("id", id.data).maybeSingle(),
    supabase
      .from("coletor_erros")
      .select("id, etapa, url, status_http, mensagem, criado_em")
      .eq("rodada_id", id.data)
      .order("criado_em")
      .limit(200),
  ]);
  if (!rodada) notFound();

  const numeros: [string, number][] = [
    ["Termos buscados", rodada.termos_buscados],
    ["Editais encontrados", rodada.compras_encontradas],
    ["Novas (saúde ou pendentes)", rodada.compras_novas],
    ["Atualizadas", rodada.compras_atualizadas],
    ["Fora da saúde", rodada.compras_descartadas],
    ["Itens pendentes", rodada.compras_pendentes],
    ["Mudanças de data ou situação", rodada.alteracoes],
    ["Erros", rodada.erros],
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/coletor"
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Rodadas
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Rodada de {formatarDataHora(rodada.iniciado_em)}</h2>
        <SeloDeStatus status={rodada.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {rodada.origem === "manual" ? "Disparada à mão" : "Agendada"} · duração{" "}
        {duracao(rodada.iniciado_em, rodada.finalizado_em)} · fonte{" "}
        {rodada.fonte === "plano_b" ? "plano B" : rodada.fonte === "busca" ? "busca" : "não definida"}
      </p>
      {rodada.mensagem ? <p className="rounded-lg border bg-muted/50 p-3 text-sm">{rodada.mensagem}</p> : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border p-3">
            <dd className="text-xl font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</dd>
            <dt className="text-xs text-muted-foreground">{rotulo}</dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2" aria-labelledby="titulo-erros">
        <h3 id="titulo-erros" className="font-medium">
          Erros registrados
        </h3>
        {erros && erros.length > 0 ? (
          <>
            <ul className="divide-y rounded-lg border text-sm">
              {erros.map((erro) => (
                <li key={erro.id} className="flex flex-col gap-0.5 p-3">
                  <span>
                    <span className="font-medium">{ETAPAS[erro.etapa] ?? erro.etapa}</span>
                    {erro.status_http ? ` · HTTP ${erro.status_http}` : ""} · {erro.mensagem}
                  </span>
                  {erro.url ? (
                    <span className="break-all font-mono text-xs text-muted-foreground">{erro.url}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {rodada.erros > erros.length ? (
              <p className="text-xs text-muted-foreground">
                Mostrando {erros.length} de {rodada.erros} erros (só os primeiros 200 são guardados).
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum erro nesta rodada.
          </p>
        )}
      </section>
    </div>
  );
}
