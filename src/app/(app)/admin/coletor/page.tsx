import type { Metadata } from "next";
import Link from "next/link";

import { duracao, SeloDeStatus } from "@/components/admin/rodadas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirAdmin } from "@/lib/auth";
import { formatarDataHora } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rodadas do coletor · Admin" };

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export default async function PaginaColetor() {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const agora = new Date().toISOString();
  const contar = (filtro: "saude" | "pendentes" | "descartadas") => {
    let consulta = supabase
      .from("compras")
      .select("id", { count: "exact", head: true })
      .eq("exemplo", false)
      .gte("data_disputa", agora);
    if (filtro === "saude") consulta = consulta.eq("area_saude", true);
    else if (filtro === "pendentes") consulta = consulta.is("area_saude", null);
    else consulta = consulta.eq("area_saude", false);
    return consulta;
  };

  const [{ data: rodadas, error }, saude, pendentes, descartadas] = await Promise.all([
    supabase.from("coletor_rodadas").select("*").order("iniciado_em", { ascending: false }).limit(40),
    contar("saude"),
    contar("pendentes"),
    contar("descartadas"),
  ]);
  if (error) throw new Error(`Falha ao carregar as rodadas: ${error.message}`);

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Numero valor={saude.count ?? 0} rotulo="Licitações da saúde com disputa futura" />
        <Numero valor={pendentes.count ?? 0} rotulo="Aguardando os itens do PNCP" />
        <Numero valor={descartadas.count ?? 0} rotulo="Fora da saúde (descartadas)" />
      </div>

      {rodadas.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-sm">
          <p className="font-medium">Nenhuma rodada registrada ainda.</p>
          <p className="mt-1 text-muted-foreground">
            O coletor roda a cada 2 horas pelo GitHub Actions (workflow “Coletor do PNCP”) e também
            pode ser disparado à mão por lá. Ele precisa do segredo SUPABASE_SERVICE_ROLE_KEY e da
            variável SUPABASE_URL configurados no repositório; o passo a passo está no README.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Últimas {rodadas.length} rodadas. “Parcial” quer dizer que parte das chamadas ao PNCP
            falhou ou que o tempo acabou; o que faltou entra na rodada seguinte.
          </p>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead className="text-right">Encontradas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Atualizadas</TableHead>
                  <TableHead className="text-right">Descartadas</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">Alterações</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rodadas.map((rodada) => (
                  <TableRow key={rodada.id}>
                    <TableCell className="tabular-nums">
                      <Link href={`/admin/coletor/${rodada.id}`} className="font-medium hover:underline">
                        {formatarDataHora(rodada.iniciado_em)}
                      </Link>
                      {rodada.origem === "manual" ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">manual</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <SeloDeStatus status={rodada.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {duracao(rodada.iniciado_em, rodada.finalizado_em)}
                    </TableCell>
                    <TableCell>
                      {rodada.fonte === "plano_b" ? "Plano B" : rodada.fonte === "busca" ? "Busca" : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.compras_encontradas}</TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.compras_novas}</TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.compras_atualizadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.compras_descartadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.compras_pendentes}</TableCell>
                    <TableCell className="text-right tabular-nums">{rodada.alteracoes}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${rodada.erros > 0 ? "font-medium text-destructive" : ""}`}
                    >
                      {rodada.erros}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
