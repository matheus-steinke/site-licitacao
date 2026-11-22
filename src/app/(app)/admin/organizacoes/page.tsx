import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirAdmin } from "@/lib/auth";
import { formatarCnpj, formatarData } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organizações · Admin" };

export default async function PaginaOrganizacoes() {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const { data: organizacoes, error } = await supabase
    .from("organizacoes")
    .select(
      `id, razao_social, cnpj, porte, plano, ufs, onboarding_concluido_em, criado_em,
       membros (count), organizacao_segmentos (count)`,
    )
    .order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao carregar as organizações: ${error.message}`);

  if (organizacoes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhuma organização cadastrada ainda.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {organizacoes.length} {organizacoes.length === 1 ? "organização" : "organizações"}{" "}
        cadastradas.
      </p>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Porte</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Estados</TableHead>
              <TableHead className="text-right">Segmentos</TableHead>
              <TableHead className="text-right">Usuários</TableHead>
              <TableHead>Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizacoes.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <p className="font-medium">{org.razao_social}</p>
                  <p className="text-xs text-muted-foreground">{formatarCnpj(org.cnpj)}</p>
                </TableCell>
                <TableCell>{org.porte === "me_epp" ? "ME/EPP" : "Demais"}</TableCell>
                <TableCell className="capitalize">{org.plano}</TableCell>
                <TableCell className="max-w-48 whitespace-normal">
                  {org.ufs.length === 27 ? "Todos" : org.ufs.join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {org.organizacao_segmentos[0]?.count ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {org.membros[0]?.count ?? 0}
                </TableCell>
                <TableCell>
                  <p>{formatarData(org.criado_em)}</p>
                  {org.onboarding_concluido_em ? null : (
                    <Badge variant="outline" className="mt-1">
                      Cadastro incompleto
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
