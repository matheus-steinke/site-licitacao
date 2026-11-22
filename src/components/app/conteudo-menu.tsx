import { LogOut } from "lucide-react";
import { Suspense } from "react";

import { sair } from "@/app/auth/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { RodapeLegal } from "@/components/rodape-legal";
import { Skeleton } from "@/components/ui/skeleton";
import { ehAdminPlataforma, obterUsuario } from "@/lib/auth";
import { obterOrganizacao } from "@/lib/organizacao";

import { Navegacao } from "./navegacao";

async function NavegacaoDoUsuario() {
  return <Navegacao admin={await ehAdminPlataforma()} />;
}

async function BlocoUsuario() {
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const atual = await obterOrganizacao();

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{usuario.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {atual?.org.razao_social ?? usuario.email}
        </p>
      </div>
      <form action={sair}>
        <BotaoEnviar variant="ghost" size="icon-lg" aria-label="Sair" title="Sair">
          <LogOut aria-hidden />
        </BotaoEnviar>
      </form>
    </div>
  );
}

function EsqueletoNavegacao() {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** Navegação + usuário. Usado na barra lateral (desktop) e no menu móvel. */
export function ConteudoMenu() {
  return (
    <>
      <div className="flex-1">
        <Suspense fallback={<EsqueletoNavegacao />}>
          <NavegacaoDoUsuario />
        </Suspense>
      </div>
      <div className="flex flex-col gap-3 border-t pt-3">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <BlocoUsuario />
        </Suspense>
        <RodapeLegal />
      </div>
    </>
  );
}
