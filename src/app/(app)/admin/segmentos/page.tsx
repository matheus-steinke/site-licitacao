import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirAdmin } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Segmentos · Admin" };

export default async function PaginaSegmentos() {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const { data: segmentos, error } = await supabase
    .from("segmentos")
    .select("id, nome, ordem, ativo, palavras_chave, sinonimos, exclusoes, organizacao_segmentos (count)")
    .order("ordem")
    .order("nome");
  if (error) throw new Error(`Falha ao carregar os segmentos: ${error.message}`);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {segmentos.length} segmentos. As palavras-chave são os termos buscados no PNCP.
        </p>
        <Link href="/admin/segmentos/novo" className={buttonVariants({ size: "lg" })}>
          <Plus aria-hidden />
          Novo segmento
        </Link>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segmento</TableHead>
              <TableHead className="text-right">Palavras-chave</TableHead>
              <TableHead className="text-right">Sinônimos</TableHead>
              <TableHead className="text-right">Exclusões</TableHead>
              <TableHead className="text-right">Organizações</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segmentos.map((segmento) => (
              <TableRow key={segmento.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/segmentos/${segmento.id}`} className="hover:underline">
                    {segmento.nome}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {segmento.palavras_chave.length}
                </TableCell>
                <TableCell className="text-right tabular-nums">{segmento.sinonimos.length}</TableCell>
                <TableCell className="text-right tabular-nums">{segmento.exclusoes.length}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {segmento.organizacao_segmentos[0]?.count ?? 0}
                </TableCell>
                <TableCell>
                  <Badge variant={segmento.ativo ? "secondary" : "outline"}>
                    {segmento.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
