"use client";

import { useActionState, useState } from "react";

import { excluirSegmento, salvarSegmento } from "@/app/(app)/admin/segmentos/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { lerTermos } from "@/lib/termos";

type Segmento = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  palavras_chave: string[];
  sinonimos: string[];
  exclusoes: string[];
};

function CampoTermos({
  nome,
  rotulo,
  ajuda,
  valor,
  aoMudar,
  linhas,
}: {
  nome: string;
  rotulo: string;
  ajuda: string;
  valor: string;
  aoMudar: (v: string) => void;
  linhas: number;
}) {
  const total = lerTermos(valor).length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={nome}>{rotulo}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total} {total === 1 ? "termo" : "termos"}
        </span>
      </div>
      <Textarea
        id={nome}
        name={nome}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={linhas}
        spellCheck={false}
        aria-describedby={`${nome}-ajuda`}
        className="font-mono text-sm"
      />
      <p id={`${nome}-ajuda`} className="text-xs text-muted-foreground">
        {ajuda}
      </p>
    </div>
  );
}

/** Criação (sem `segmento`) ou edição de um segmento. Campos controlados. */
export function FormularioSegmento({ segmento }: { segmento?: Segmento }) {
  const [estado, salvar] = useActionState<EstadoFormulario, FormData>(salvarSegmento, {});
  const [estadoExcluir, excluir] = useActionState<EstadoFormulario, FormData>(excluirSegmento, {});

  const [nome, setNome] = useState(segmento?.nome ?? "");
  const [ordem, setOrdem] = useState(String(segmento?.ordem ?? 0));
  const [ativo, setAtivo] = useState(segmento?.ativo ?? true);
  const [palavras, setPalavras] = useState((segmento?.palavras_chave ?? []).join("\n"));
  const [sinonimos, setSinonimos] = useState((segmento?.sinonimos ?? []).join("\n"));
  const [exclusoes, setExclusoes] = useState((segmento?.exclusoes ?? []).join("\n"));

  return (
    <div className="flex flex-col gap-6">
      <form action={salvar} className="flex flex-col gap-5">
        {segmento ? <input type="hidden" name="id" value={segmento.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              required
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ordem">Ordem</Label>
            <Input
              id="ordem"
              name="ordem"
              type="number"
              min={0}
              step={1}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="ativo"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="block font-medium">Ativo</span>
            <span className="block text-muted-foreground">
              Segmentos inativos somem da escolha dos clientes e não são buscados no PNCP.
            </span>
          </span>
        </label>

        <CampoTermos
          nome="palavras_chave"
          rotulo="Palavras-chave"
          ajuda="Um termo por linha. São buscados no PNCP e usados para casar itens com o segmento."
          valor={palavras}
          aoMudar={setPalavras}
          linhas={10}
        />
        <CampoTermos
          nome="sinonimos"
          rotulo="Sinônimos e abreviações"
          ajuda="Um termo por linha. Casam itens com o segmento, mas não são buscados no PNCP."
          valor={sinonimos}
          aoMudar={setSinonimos}
          linhas={6}
        />
        <CampoTermos
          nome="exclusoes"
          rotulo="Termos de exclusão"
          ajuda="Um termo por linha. Se aparecer no item, ele não casa com este segmento."
          valor={exclusoes}
          aoMudar={setExclusoes}
          linhas={4}
        />

        <MensagemErro>{estado.erro}</MensagemErro>
        <MensagemOk>{estado.mensagem}</MensagemOk>
        <div className="flex justify-end">
          <BotaoEnviar size="lg">{segmento ? "Salvar segmento" : "Criar segmento"}</BotaoEnviar>
        </div>
      </form>

      {segmento ? (
        <form
          action={excluir}
          className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4"
          onSubmit={(evento) => {
            if (!window.confirm(`Excluir o segmento "${segmento.nome}"? Esta ação não tem volta.`)) {
              evento.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={segmento.id} />
          <div>
            <p className="text-sm font-medium">Excluir segmento</p>
            <p className="text-sm text-muted-foreground">
              Só é possível excluir segmentos que nenhuma organização escolheu. Para os demais,
              desmarque “Ativo”.
            </p>
          </div>
          <MensagemErro>{estadoExcluir.erro}</MensagemErro>
          <div>
            <BotaoEnviar variant="destructive">Excluir</BotaoEnviar>
          </div>
        </form>
      ) : null}
    </div>
  );
}
