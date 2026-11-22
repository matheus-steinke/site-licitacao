import type { Metadata } from "next";
import { X } from "lucide-react";

import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { FormularioAcao } from "@/components/formulario/formulario-acao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listarExclusoes } from "@/lib/dados/catalogo";
import { exigirOrganizacao } from "@/lib/organizacao";

import { adicionarExclusoes, removerExclusao } from "../actions";

export const metadata: Metadata = { title: "Exclusões" };

export default async function PaginaExclusoes() {
  const { org } = await exigirOrganizacao();
  const exclusoes = await listarExclusoes(org.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Termos que a sua empresa não fornece</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se um item de licitação tiver um destes termos, ele não é casado com o seu catálogo. Por
          exemplo: quem trabalha com urologia mas não vende sonda de Foley cadastra “sonda de
          foley”.
        </p>
      </div>

      <FormularioAcao acao={adicionarExclusoes} rotulo="Adicionar" key={exclusoes.length}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="termos">Novos termos</Label>
          <Textarea
            id="termos"
            name="termos"
            rows={3}
            spellCheck={false}
            placeholder={"sonda de foley\ncoletor de urina"}
            required
          />
          <p className="text-xs text-muted-foreground">
            Um termo por linha. Maiúsculas e acentos não fazem diferença na comparação.
          </p>
        </div>
      </FormularioAcao>

      {exclusoes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma exclusão cadastrada.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {exclusoes.length} {exclusoes.length === 1 ? "termo cadastrado" : "termos cadastrados"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {exclusoes.map((exclusao) => (
              <li
                key={exclusao.id}
                className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm"
              >
                {exclusao.termo}
                <form action={removerExclusao}>
                  <input type="hidden" name="id" value={exclusao.id} />
                  <BotaoEnviar
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remover ${exclusao.termo}`}
                    title="Remover"
                    className="rounded-full"
                  >
                    <X aria-hidden />
                  </BotaoEnviar>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
