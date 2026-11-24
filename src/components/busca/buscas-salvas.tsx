"use client";

import { Bookmark, BookmarkPlus, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { excluirBusca, salvarBusca } from "@/app/(app)/busca/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Salva = { id: string; nome: string; endereco: string; atual: boolean };

/** As buscas salvas da empresa, como atalhos, e o formulário para salvar a busca que está na tela. */
export function BuscasSalvas({
  salvas,
  consultaAtual,
  podeSalvar,
}: {
  salvas: Salva[];
  /** Os filtros que estão na tela, na forma do endereço (sem a página). */
  consultaAtual: string;
  /** false quando a busca da tela já está salva. */
  podeSalvar: boolean;
}) {
  const [salvando, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");

  const salvar = () =>
    iniciar(async () => {
      const r = await salvarBusca({ nome, consulta: consultaAtual });
      if (r.ok) {
        toast.success("Busca salva.");
        setAberto(false);
        setNome("");
      } else toast.error(r.erro);
    });

  const excluir = (busca: Salva) =>
    iniciar(async () => {
      const r = await excluirBusca(busca.id);
      if (r.ok) toast.success(`Busca “${busca.nome}” excluída.`);
      else toast.error(r.erro);
    });

  return (
    <section aria-labelledby="titulo-buscas-salvas" className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titulo-buscas-salvas" className="flex items-center gap-1.5 text-sm font-medium">
          <Bookmark className="size-4 text-muted-foreground" aria-hidden />
          Buscas salvas
        </h2>
        {salvas.length === 0 ? (
          <span className="text-sm text-muted-foreground">Nenhuma ainda.</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="buscas-salvas">
            {salvas.map((busca) => (
              <li
                key={busca.id}
                className={cn(
                  "flex items-center rounded-full border text-sm",
                  busca.atual ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                )}
              >
                <Link
                  href={busca.endereco}
                  aria-current={busca.atual ? "true" : undefined}
                  className="rounded-l-full py-1 pr-1.5 pl-3 font-medium hover:underline"
                >
                  {busca.nome}
                </Link>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => excluir(busca)}
                  aria-label={`Excluir a busca salva ${busca.nome}`}
                  title="Excluir"
                  className="rounded-r-full py-1.5 pr-2.5 pl-1 opacity-70 hover:opacity-100 disabled:opacity-40"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {podeSalvar && !aberto ? (
          <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
            <BookmarkPlus aria-hidden />
            Salvar esta busca
          </Button>
        ) : null}
      </div>

      {aberto ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            salvar();
          }}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="nome-da-busca">Nome da busca</Label>
            <Input
              id="nome-da-busca"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Duplo J no Sul"
              maxLength={80}
              autoFocus
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={salvando || nome.trim().length === 0}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Guarda a palavra-chave e os filtros que estão na tela. Fica disponível para todos os usuários da empresa.
          </p>
        </form>
      ) : null}
    </section>
  );
}
