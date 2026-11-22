"use client";

import { useActionState } from "react";

import { recuperarSenha } from "@/app/auth/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioRecuperarSenha() {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(recuperarSenha, {});

  if (estado.mensagem) return <MensagemOk>{estado.mensagem}</MensagemOk>;

  return (
    <form action={acao} className="flex flex-col gap-4">
      <MensagemErro>{estado.erro}</MensagemErro>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={estado.valores?.email}
          className="h-10"
        />
      </div>
      <BotaoEnviar size="lg" className="w-full">
        Enviar link
      </BotaoEnviar>
    </form>
  );
}
