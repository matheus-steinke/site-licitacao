"use client";

import Link from "next/link";
import { useActionState } from "react";

import { cadastrar, type EstadoFormulario } from "@/app/auth/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { BotaoGoogle } from "@/components/formulario/botao-google";
import { DivisorOu } from "@/components/formulario/divisor";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioCadastrar() {
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(cadastrar, {});

  if (estado.mensagem) {
    return (
      <div className="flex flex-col gap-4">
        <MensagemOk>{estado.mensagem}</MensagemOk>
        <p className="text-sm text-muted-foreground">
          Não chegou? Confira a caixa de spam. Depois de confirmar, é só{" "}
          <Link href="/entrar" className="font-medium text-foreground hover:underline">
            entrar
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MensagemErro>{estado.erro}</MensagemErro>

      <form action={acao} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Seu nome</Label>
          <Input
            id="nome"
            name="nome"
            autoComplete="name"
            required
            defaultValue={estado.valores?.nome}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail de trabalho</Label>
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="dica-senha"
            className="h-10"
          />
          <p id="dica-senha" className="text-xs text-muted-foreground">
            Pelo menos 8 caracteres.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm leading-snug text-muted-foreground">
          <input
            type="checkbox"
            name="aceite"
            required
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="text-foreground underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="text-foreground underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        <BotaoEnviar size="lg" className="w-full">
          Criar conta
        </BotaoEnviar>
      </form>

      <DivisorOu />
      <BotaoGoogle rotulo="Cadastrar com Google" />
      <p className="text-center text-xs text-muted-foreground">
        Ao continuar com o Google, você aceita os Termos de Uso e a Política de Privacidade.
      </p>
    </div>
  );
}
