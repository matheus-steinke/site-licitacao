"use client";

import { useActionState } from "react";

import { redefinirSenha, type EstadoFormulario } from "@/app/auth/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemErro } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioRedefinirSenha() {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(redefinirSenha, {});

  return (
    <form action={acao} className="flex flex-col gap-4">
      <MensagemErro>{estado.erro}</MensagemErro>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmacao">Repita a nova senha</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10"
        />
      </div>
      <BotaoEnviar size="lg" className="w-full">
        Salvar nova senha
      </BotaoEnviar>
    </form>
  );
}
