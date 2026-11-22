"use client";

import { useActionState } from "react";

import { BotaoCopiar } from "@/components/botao-copiar";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoFormulario } from "@/lib/estado-formulario";

import { convidar } from "./actions";

export function FormularioConvite() {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(convidar, {});
  const link = estado.mensagem ? estado.valores?.link : undefined;

  return (
    <div className="flex flex-col gap-3">
      <form action={acao} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="email-convite">Convidar por e-mail</Label>
          <Input
            id="email-convite"
            name="email"
            type="email"
            inputMode="email"
            placeholder="colega@empresa.com.br"
            required
            defaultValue={estado.erro ? estado.valores?.email : ""}
            key={estado.mensagem ?? "convite"}
            className="h-10"
          />
        </div>
        <BotaoEnviar size="lg">Convidar</BotaoEnviar>
      </form>
      <MensagemErro>{estado.erro}</MensagemErro>
      <MensagemOk>{estado.mensagem}</MensagemOk>
      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
          <BotaoCopiar texto={link} rotulo="Copiar link" />
        </div>
      ) : null}
    </div>
  );
}
