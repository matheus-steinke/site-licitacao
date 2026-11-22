import type { Metadata } from "next";

import { Importador } from "@/components/catalogo/importador";
import { listarCodigos, listarImportacoes } from "@/lib/dados/catalogo";
import { formatarDataHora } from "@/lib/formato";
import { exigirOrganizacao, listarSegmentosAtivos } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Importar tabela" };

export default async function PaginaImportar() {
  const { org } = await exigirOrganizacao();
  const [segmentos, codigos, importacoes] = await Promise.all([
    listarSegmentosAtivos(),
    listarCodigos(org.id),
    listarImportacoes(org.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Importar tabela de preços</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie a planilha, confira a prévia linha a linha e só então confirme.
        </p>
      </div>

      <Importador
        segmentos={segmentos.map((s) => ({ id: s.id, nome: s.nome }))}
        codigosExistentes={codigos}
      />

      {importacoes.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="titulo-historico">
          <h3 id="titulo-historico" className="text-sm font-medium">
            Últimas importações
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {importacoes.map((importacao) => (
              <li key={importacao.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
                <span className="text-muted-foreground tabular-nums">
                  {formatarDataHora(importacao.criado_em)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{importacao.arquivo_nome}</span>
                <span className="text-muted-foreground">
                  {importacao.modo === "substituir" ? "Substituir tudo" : "Atualizar pelo ID"}:{" "}
                  {importacao.incluidos} incluídos, {importacao.alterados} alterados,{" "}
                  {importacao.sem_mudanca} sem mudança
                  {importacao.excluidos > 0 ? `, ${importacao.excluidos} excluídos` : ""}
                  {importacao.com_erro > 0 ? `, ${importacao.com_erro} com erro` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
