"use client";

import { TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";

import { excluirConta } from "@/app/(app)/configuracoes/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemErro } from "@/components/formulario/mensagens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoFormulario } from "@/lib/estado-formulario";

type Props = {
  ehDono: boolean;
  /** null = fora da área logada (primeiros passos): a pessoa pode ainda não ter empresa. */
  empresa: string | null;
  /** Outras pessoas com acesso à empresa (só importa para o responsável). */
  outrasPessoas: number;
};

/** Excluir a conta pede para digitar EXCLUIR: não há como desfazer. */
export function ExcluirConta({ ehDono, empresa, outrasPessoas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(excluirConta, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">
        {empresa === null ? (
          <p>
            O seu login é apagado. Se você já cadastrou a empresa nos primeiros passos, ela e os dados
            dela são apagados junto.
          </p>
        ) : ehDono ? (
          <>
            <p>
              Você é o responsável por <span className="font-medium text-foreground">{empresa}</span>. Ao
              excluir a sua conta, a empresa é apagada junto, com tudo o que é dela:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>o catálogo de produtos e os arquivos enviados;</li>
              <li>as oportunidades, as decisões (aprovadas, descartadas, ganhas e perdidas) e as buscas salvas;</li>
              <li>a ligação com o Google (os eventos e as pastas já criados continuam na sua conta do Google);</li>
              <li>os convites e o seu login.</li>
            </ul>
            {outrasPessoas > 0 ? (
              <p className="mt-2">
                {outrasPessoas === 1
                  ? "A outra pessoa da empresa perde o acesso aos dados, mas continua com o login dela."
                  : `As outras ${outrasPessoas} pessoas da empresa perdem o acesso aos dados, mas continuam com o login delas.`}
              </p>
            ) : null}
          </>
        ) : (
          <p>
            Ao excluir a sua conta, você sai de <span className="font-medium text-foreground">{empresa}</span>{" "}
            e o seu login é apagado. Os dados da empresa continuam com as outras pessoas.
          </p>
        )}
        <p className="mt-2">As licitações públicas do PNCP não são dados seus e continuam no sistema.</p>
      </div>

      {!aberto ? (
        <div>
          <Button type="button" variant="destructive" onClick={() => setAberto(true)}>
            Excluir minha conta
          </Button>
        </div>
      ) : (
        <form action={acao} className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmacao-excluir">Para confirmar, digite EXCLUIR</Label>
            <Input
              id="confirmacao-excluir"
              name="confirmacao"
              autoComplete="off"
              autoCapitalize="characters"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              className="h-10 max-w-48"
            />
          </div>
          <MensagemErro>{estado.erro}</MensagemErro>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoEnviar variant="destructive" disabled={texto.trim() !== "EXCLUIR"}>
              {ehDono && empresa !== null ? "Excluir a conta e a empresa" : "Excluir a minha conta"}
            </BotaoEnviar>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAberto(false);
                setTexto("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
