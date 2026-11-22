"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { entrar, type EstadoFormulario } from "@/app/auth/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { BotaoGoogle } from "@/components/formulario/botao-google";
import { DivisorOu } from "@/components/formulario/divisor";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AVISOS: Record<string, { tipo: "ok" | "erro"; texto: string }> = {
  link: {
    tipo: "ok",
    texto:
      "Não foi possível entrar direto pelo link (ele pode ter sido aberto em outro navegador ou já ter sido usado). Se você estava confirmando o e-mail, é só entrar com sua senha.",
  },
  google: {
    tipo: "erro",
    texto: "O login com Google ainda não está disponível. Use e-mail e senha.",
  },
  "conta-excluida": { tipo: "ok", texto: "Sua conta foi excluída." },
};

export function FormularioEntrar() {
  const parametros = useSearchParams();
  const proximo = parametros.get("proximo") ?? "";
  const aviso = AVISOS[parametros.get("aviso") ?? ""];
  const [estado, acao] = useActionState<EstadoFormulario, FormData>(entrar, {});

  return (
    <div className="flex flex-col gap-4">
      {aviso && !estado.erro ? (
        aviso.tipo === "ok" ? (
          <MensagemOk>{aviso.texto}</MensagemOk>
        ) : (
          <MensagemErro>{aviso.texto}</MensagemErro>
        )
      ) : null}
      <MensagemErro>{estado.erro}</MensagemErro>

      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="proximo" value={proximo} />
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="senha">Senha</Label>
            <Link
              href="/recuperar-senha"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
          <Input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </div>
        <BotaoEnviar size="lg" className="w-full">
          Entrar
        </BotaoEnviar>
      </form>

      <DivisorOu />
      <BotaoGoogle proximo={proximo} rotulo="Entrar com Google" />
    </div>
  );
}
