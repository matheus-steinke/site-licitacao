"use client";

import { CircleAlert, CircleCheck, Download, FileSpreadsheet, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState, useTransition } from "react";

import { importarTabela, type RelatorioImportacao } from "@/app/(app)/catalogo/actions";
import { MensagemErro } from "@/components/formulario/mensagens";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErroDeArquivo, gerarModeloCsv, gerarModeloExcel, lerPlanilha } from "@/lib/importacao/arquivo";
import { COLUNAS } from "@/lib/importacao/colunas";
import {
  interpretarPreco,
  resumir,
  validarPlanilha,
  type Celula,
  type LinhaValidada,
  type ResultadoValidacao,
  type SegmentoRef,
} from "@/lib/importacao/validacao";
import { cn } from "@/lib/utils";

const LIMITE_ARQUIVO = 10 * 1024 * 1024;
const LINHAS_NA_PREVIA = 200;

type Modo = "atualizar" | "substituir";
type Arquivo = { nome: string; planilha: Celula[][]; validacao: ResultadoValidacao };

function baixar(nome: string, conteudo: Blob) {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

function Numero({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: "erro" | "aviso" }) {
  return (
    <div className="rounded-lg border p-3">
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tom === "erro" && valor > 0 && "text-destructive",
          tom === "aviso" && valor > 0 && "text-amber-700 dark:text-amber-400",
        )}
      >
        {valor.toLocaleString("pt-BR")}
      </p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

/** Mostra o preço como será gravado; se não der para ler, mostra o que veio na planilha. */
function precoNaPrevia(bruto: string): string {
  const lido = interpretarPreco(bruto);
  if ("erro" in lido) return bruto || "—";
  return lido.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function SituacaoDaLinha({ linha, existe }: { linha: LinhaValidada; existe: boolean }) {
  if (linha.erros.length > 0) return <Badge variant="destructive">Erro</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant="secondary">{existe ? "Atualiza" : "Novo"}</Badge>
      {linha.avisos.length > 0 ? <Badge variant="outline">Aviso</Badge> : null}
    </span>
  );
}

/** Importação da tabela de preços: escolher arquivo, conferir a prévia e confirmar. */
export function Importador({
  segmentos,
  codigosExistentes,
}: {
  segmentos: SegmentoRef[];
  codigosExistentes: string[];
}) {
  const [arquivo, setArquivo] = useState<Arquivo>();
  const [erroDeLeitura, setErroDeLeitura] = useState<string>();
  const [lendo, setLendo] = useState(false);
  const [modo, setModo] = useState<Modo>("atualizar");
  const [confirmouExclusao, setConfirmouExclusao] = useState(false);
  const [soProblemas, setSoProblemas] = useState(false);
  // A importação roda numa transição para a página receber junto os dados
  // atualizados do servidor (histórico e IDs já cadastrados).
  const [importando, iniciarImportacao] = useTransition();
  const [relatorio, setRelatorio] = useState<RelatorioImportacao>();
  const campo = useRef<HTMLInputElement>(null);

  const existentes = useMemo(() => new Set(codigosExistentes), [codigosExistentes]);
  const linhas = useMemo(() => arquivo?.validacao.linhas ?? [], [arquivo]);
  const resumo = useMemo(() => resumir(linhas), [linhas]);
  const novos = linhas.filter((l) => l.dados && !existentes.has(l.codigo)).length;
  const aAtualizar = resumo.validas - novos;
  // No modo "substituir", sai do catálogo o que não aparece na planilha (com ou sem erro).
  const aExcluir = useMemo(() => {
    const naPlanilha = new Set(linhas.map((l) => l.codigo));
    return codigosExistentes.filter((codigo) => !naPlanilha.has(codigo)).length;
  }, [linhas, codigosExistentes]);

  const reiniciar = () => {
    setArquivo(undefined);
    setErroDeLeitura(undefined);
    setRelatorio(undefined);
    setModo("atualizar");
    setConfirmouExclusao(false);
    setSoProblemas(false);
    if (campo.current) campo.current.value = "";
  };

  const escolher = async (selecionado: File | undefined) => {
    if (!selecionado) return;
    reiniciar();
    if (selecionado.size > LIMITE_ARQUIVO) {
      setErroDeLeitura("O arquivo passa de 10 MB. Divida a planilha em arquivos menores.");
      return;
    }
    setLendo(true);
    try {
      const planilha = await lerPlanilha(selecionado.name, await selecionado.arrayBuffer());
      setArquivo({ nome: selecionado.name, planilha, validacao: validarPlanilha(planilha, segmentos) });
    } catch (erro) {
      setErroDeLeitura(
        erro instanceof ErroDeArquivo ? erro.message : "Não consegui ler o arquivo. Tente salvar de novo.",
      );
    } finally {
      setLendo(false);
    }
  };

  const importar = () => {
    if (!arquivo) return;
    iniciarImportacao(async () => {
      try {
        setRelatorio(await importarTabela({ arquivoNome: arquivo.nome, modo, planilha: arquivo.planilha }));
      } catch {
        setRelatorio({
          erro: "A importação não foi concluída. Confira sua conexão e tente de novo.",
          incluidos: 0,
          alterados: 0,
          semMudanca: 0,
          excluidos: 0,
          comErro: 0,
          problemas: [],
        });
      }
    });
  };

  const baixarProblemas = () => {
    if (!relatorio) return;
    const csv = Papa.unparse(
      [
        ["Linha", "ID", "Situação", "Mensagens"],
        ...relatorio.problemas.map((p) => [
          p.linha,
          p.codigo,
          p.erros.length > 0 ? "Erro (não importada)" : "Aviso (importada)",
          [...p.erros, ...p.avisos].join(" | "),
        ]),
      ],
      { delimiter: ";", newline: "\r\n" },
    );
    baixar("linhas-com-problema.csv", new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  };

  // -------------------------------------------------------------------------
  // 3. Relatório final
  // -------------------------------------------------------------------------
  if (relatorio && !relatorio.erro) {
    const erros = relatorio.problemas.filter((p) => p.erros.length > 0);
    const avisos = relatorio.problemas.filter((p) => p.erros.length === 0);
    return (
      <div className="flex flex-col gap-5" data-testid="relatorio-importacao">
        <div className="flex items-start gap-3 rounded-lg border p-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="font-medium">Importação concluída</p>
            <p className="text-sm text-muted-foreground">{arquivo?.nome}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Numero valor={relatorio.incluidos} rotulo="Incluídos" />
          <Numero valor={relatorio.alterados} rotulo="Alterados" />
          <Numero valor={relatorio.semMudanca} rotulo="Sem mudança" />
          <Numero valor={relatorio.excluidos} rotulo="Excluídos" />
          <Numero valor={relatorio.comErro} rotulo="Com erro (não entraram)" tom="erro" />
        </div>

        {relatorio.problemas.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {erros.length > 0
                  ? `${erros.length} ${erros.length === 1 ? "linha não entrou" : "linhas não entraram"}`
                  : "Todas as linhas entraram"}
                {avisos.length > 0
                  ? ` · ${avisos.length} com aviso`
                  : ""}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={baixarProblemas}>
                <Download aria-hidden />
                Baixar lista (CSV)
              </Button>
            </div>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
              {relatorio.problemas.slice(0, 100).map((p) => (
                <li key={p.linha} className="flex gap-3 p-2.5">
                  <span className="w-20 shrink-0 text-muted-foreground tabular-nums">Linha {p.linha}</span>
                  <span className="min-w-0">
                    {p.codigo ? <span className="font-medium">ID {p.codigo}: </span> : null}
                    <span className={p.erros.length > 0 ? "text-destructive" : ""}>
                      {[...p.erros, ...p.avisos].join("; ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {relatorio.problemas.length > 100 ? (
              <p className="text-xs text-muted-foreground">
                Mostrando 100 de {relatorio.problemas.length}. Baixe a lista para ver todas.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href="/catalogo" className={buttonVariants({ size: "lg" })}>
            Ver o catálogo
          </Link>
          <Button type="button" variant="outline" size="lg" onClick={reiniciar}>
            Importar outro arquivo
          </Button>
        </div>
      </div>
    );
  }

  const mapeamento = arquivo?.validacao.mapeamento;
  const erroGeral = arquivo?.validacao.erroGeral;
  const visiveis = (soProblemas ? linhas.filter((l) => l.erros.length + l.avisos.length > 0) : linhas).slice(
    0,
    LINHAS_NA_PREVIA,
  );
  const totalFiltrado = soProblemas
    ? linhas.filter((l) => l.erros.length + l.avisos.length > 0).length
    : linhas.length;
  const podeImportar =
    !!arquivo && !erroGeral && resumo.validas > 0 && (modo === "atualizar" || aExcluir === 0 || confirmouExclusao);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Arquivo */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={campo}
            id="arquivo-tabela"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => escolher(e.target.files?.[0])}
            disabled={lendo || importando}
          />
          <Button
            type="button"
            size="lg"
            variant={arquivo ? "outline" : "default"}
            disabled={lendo || importando}
            onClick={() => campo.current?.click()}
          >
            {lendo ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileSpreadsheet aria-hidden />}
            {lendo ? "Lendo…" : arquivo ? "Escolher outro arquivo" : "Escolher arquivo (.xlsx ou .csv)"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={async () => baixar("modelo-tabela-de-precos.xlsx", await gerarModeloExcel())}
          >
            <Download aria-hidden />
            Modelo Excel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() =>
              baixar(
                "modelo-tabela-de-precos.csv",
                new Blob([gerarModeloCsv()], { type: "text/csv;charset=utf-8" }),
              )
            }
          >
            <Download aria-hidden />
            Modelo CSV
          </Button>
        </div>
        {arquivo ? null : (
          <p className="text-sm text-muted-foreground">
            Colunas obrigatórias: {COLUNAS.filter((c) => c.obrigatoria).map((c) => c.titulo).join("; ")}.
            Opcionais: {COLUNAS.filter((c) => !c.obrigatoria).map((c) => c.titulo.toLowerCase()).join(", ")}.
            Os preços podem vir com vírgula ou com ponto. Nada é gravado antes de você conferir a
            prévia.
          </p>
        )}
        <MensagemErro>{erroDeLeitura}</MensagemErro>
      </section>

      {/* 2. Prévia */}
      {arquivo ? (
        <section className="flex flex-col gap-5" data-testid="previa-importacao">
          <div>
            <p className="font-medium">{arquivo.nome}</p>
            {mapeamento && !erroGeral ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Colunas reconhecidas:{" "}
                {COLUNAS.filter((c) => mapeamento.indices[c.chave] !== undefined)
                  .map((c) => c.titulo)
                  .join(", ")}
                .
              </p>
            ) : null}
            {mapeamento && mapeamento.ignoradas.length > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Colunas ignoradas (não fazem parte da tabela): {mapeamento.ignoradas.join(", ")}.
              </p>
            ) : null}
            {mapeamento && mapeamento.repetidas.length > 0 ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Coluna repetida: {mapeamento.repetidas.join(", ")}. Usei a primeira.
              </p>
            ) : null}
          </div>

          <MensagemErro>{erroGeral}</MensagemErro>

          {erroGeral ? null : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Numero valor={resumo.total} rotulo="Linhas com produto" />
                <Numero valor={novos} rotulo="Novos" />
                <Numero valor={aAtualizar} rotulo="Já existem (atualiza)" />
                <Numero valor={resumo.comErro} rotulo="Com erro (não entram)" tom="erro" />
              </div>
              {resumo.comAviso > 0 ? (
                <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {resumo.comAviso} {resumo.comAviso === 1 ? "linha tem aviso" : "linhas têm aviso"}: entram
                  mesmo assim, mas vale conferir.
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Prévia, linha a linha</p>
                  {resumo.comErro + resumo.comAviso > 0 ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={soProblemas}
                        onChange={(e) => setSoProblemas(e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      Só linhas com erro ou aviso
                    </label>
                  ) : null}
                </div>
                <div className="max-h-[28rem] overflow-y-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Linha</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Referência</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Preço proposta</TableHead>
                        <TableHead className="text-right">Lance mínimo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveis.map((linha) => (
                        <TableRow key={linha.linha} className={linha.erros.length > 0 ? "bg-destructive/5" : ""}>
                          <TableCell className="text-muted-foreground tabular-nums">{linha.linha}</TableCell>
                          <TableCell>
                            <SituacaoDaLinha linha={linha} existe={existentes.has(linha.codigo)} />
                          </TableCell>
                          <TableCell className="font-medium">{linha.codigo || "—"}</TableCell>
                          <TableCell>{linha.resumo.referencia || "—"}</TableCell>
                          <TableCell className="max-w-72 min-w-48 whitespace-normal">
                            {linha.resumo.nome || "—"}
                            {linha.erros.length + linha.avisos.length > 0 ? (
                              <span className="mt-1 flex flex-col gap-0.5 text-xs">
                                {linha.erros.map((erro) => (
                                  <span key={erro} className="flex items-start gap-1 text-destructive">
                                    <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
                                    {erro}
                                  </span>
                                ))}
                                {linha.avisos.map((aviso) => (
                                  <span
                                    key={aviso}
                                    className="flex items-start gap-1 text-amber-700 dark:text-amber-400"
                                  >
                                    <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                                    {aviso}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {precoNaPrevia(linha.resumo.preco_proposta)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {precoNaPrevia(linha.resumo.lance_minimo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalFiltrado > LINHAS_NA_PREVIA ? (
                  <p className="text-xs text-muted-foreground">
                    Mostrando as primeiras {LINHAS_NA_PREVIA} de {totalFiltrado.toLocaleString("pt-BR")} linhas.
                    Os números acima consideram a planilha inteira.
                  </p>
                ) : null}
              </div>

              <fieldset className="flex flex-col gap-2" disabled={importando}>
                <legend className="mb-2 text-sm font-medium">O que fazer com o catálogo atual?</legend>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted">
                  <input
                    type="radio"
                    name="modo"
                    checked={modo === "atualizar"}
                    onChange={() => setModo("atualizar")}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">Atualizar pelo ID</span>
                    <span className="block text-muted-foreground">
                      Inclui os novos e atualiza os que já existem. O que não está na planilha fica como
                      está.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted">
                  <input
                    type="radio"
                    name="modo"
                    checked={modo === "substituir"}
                    onChange={() => setModo("substituir")}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">Substituir tudo</span>
                    <span className="block text-muted-foreground">
                      O catálogo passa a ser esta planilha: produtos que não estão nela são excluídos,
                      com os arquivos deles.
                    </span>
                  </span>
                </label>
                {modo === "substituir" && aExcluir > 0 ? (
                  <label className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmouExclusao}
                      onChange={(e) => setConfirmouExclusao(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      Entendo que{" "}
                      <strong>
                        {aExcluir.toLocaleString("pt-BR")}{" "}
                        {aExcluir === 1 ? "produto será excluído" : "produtos serão excluídos"}
                      </strong>{" "}
                      do catálogo por não {aExcluir === 1 ? "estar" : "estarem"} na planilha.
                    </span>
                  </label>
                ) : null}
              </fieldset>

              <MensagemErro>{relatorio?.erro}</MensagemErro>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="lg" disabled={!podeImportar || importando} onClick={importar}>
                  {importando ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                  {importando
                    ? "Importando…"
                    : `Importar ${resumo.validas.toLocaleString("pt-BR")} ${resumo.validas === 1 ? "produto" : "produtos"}`}
                </Button>
                <Button type="button" variant="ghost" size="lg" disabled={importando} onClick={reiniciar}>
                  Cancelar
                </Button>
                {resumo.validas === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhuma linha válida para importar.</span>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
