import type { Metadata } from "next";
import { LogOut } from "lucide-react";

import { sair } from "@/app/auth/actions";
import { ExcluirConta } from "@/components/configuracoes/excluir-conta";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { Marca } from "@/components/marca";
import { RodapeLegal } from "@/components/rodape-legal";

export const metadata: Metadata = { title: "Primeiros passos" };

export default function LayoutOnboarding({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-muted/40">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
        <Marca />
        <form action={sair}>
          <BotaoEnviar variant="ghost" size="sm">
            <LogOut aria-hidden />
            Sair
          </BotaoEnviar>
        </form>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10">{children}</main>
      <footer className="flex flex-col gap-4 pb-6">
        {/* Quem ainda não tem empresa (ou perdeu o acesso a ela) não chega a Configurações. */}
        <details className="mx-auto w-full max-w-2xl px-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Não quer continuar? Excluir minha conta
          </summary>
          <div className="mt-3 rounded-lg border bg-background p-4">
            <ExcluirConta ehDono={false} empresa={null} outrasPessoas={0} />
          </div>
        </details>
        <RodapeLegal />
      </footer>
    </div>
  );
}
