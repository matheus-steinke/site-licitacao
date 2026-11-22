"use client";

import { useActionState } from "react";

import type { EstadoFormulario } from "@/lib/estado-formulario";
import { cn } from "@/lib/utils";

import { BotaoEnviar } from "./botao-enviar";
import { MensagemErro, MensagemOk } from "./mensagens";

type Props = {
  acao: (anterior: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  rotulo: string;
  children: React.ReactNode;
  /** Conteúdo ao lado do botão de envio (ex.: link "Voltar"). */
  aoLado?: React.ReactNode;
  /** Mostra os campos, mas sem botão de salvar. */
  somenteLeitura?: boolean;
  className?: string;
};

/** Formulário ligado a uma server action, com mensagens de erro e de sucesso. */
export function FormularioAcao({
  acao,
  rotulo,
  children,
  aoLado,
  somenteLeitura = false,
  className,
}: Props) {
  const [estado, enviar] = useActionState<EstadoFormulario, FormData>(acao, {});

  return (
    <form action={enviar} className={cn("flex flex-col gap-4", className)}>
      {children}
      <MensagemErro>{estado.erro}</MensagemErro>
      <MensagemOk>{estado.mensagem}</MensagemOk>
      {somenteLeitura ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>{aoLado}</div>
          <BotaoEnviar size="lg">{rotulo}</BotaoEnviar>
        </div>
      )}
    </form>
  );
}
