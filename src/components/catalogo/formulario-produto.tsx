"use client";

import { useActionState, useState } from "react";

import { excluirProduto, salvarProduto } from "@/app/(app)/catalogo/actions";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemErro, MensagemOk } from "@/components/formulario/mensagens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { precoParaCampo } from "@/lib/formato-cliente";

type Produto = {
  id: string;
  codigo: string;
  referencia: string;
  nome: string;
  preco_proposta: number;
  lance_minimo: number;
  segmento_id: string | null;
  palavras_chave: string[];
  medidas: string | null;
  marca: string | null;
  fabricante: string | null;
  registro_anvisa: string | null;
};

type Props = { produto?: Produto; segmentos: { id: string; nome: string }[] };

function Campo({
  nome,
  rotulo,
  valor,
  aoMudar,
  ajuda,
  ...resto
}: {
  nome: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "name" | "id">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="h-10"
        {...resto}
      />
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

/** Inclusão (sem `produto`) ou edição de um produto do catálogo. Campos controlados. */
export function FormularioProduto({ produto, segmentos }: Props) {
  const [estado, salvar] = useActionState<EstadoFormulario, FormData>(salvarProduto, {});
  const [estadoExcluir, excluir] = useActionState<EstadoFormulario, FormData>(excluirProduto, {});

  const [codigo, setCodigo] = useState(produto?.codigo ?? "");
  const [referencia, setReferencia] = useState(produto?.referencia ?? "");
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [preco, setPreco] = useState(precoParaCampo(produto?.preco_proposta));
  const [lance, setLance] = useState(precoParaCampo(produto?.lance_minimo));
  const [segmento, setSegmento] = useState(produto?.segmento_id ?? "");
  const [palavras, setPalavras] = useState((produto?.palavras_chave ?? []).join("\n"));
  const [medidas, setMedidas] = useState(produto?.medidas ?? "");
  const [marca, setMarca] = useState(produto?.marca ?? "");
  const [fabricante, setFabricante] = useState(produto?.fabricante ?? "");
  const [anvisa, setAnvisa] = useState(produto?.registro_anvisa ?? "");

  return (
    <div className="flex flex-col gap-6">
      <form action={salvar} className="flex flex-col gap-5">
        {produto ? <input type="hidden" name="id" value={produto.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Campo nome="codigo" rotulo="ID" valor={codigo} aoMudar={setCodigo} maxLength={60} required />
          <Campo
            nome="referencia"
            rotulo="Referência"
            valor={referencia}
            aoMudar={setReferencia}
            maxLength={120}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">Produto</Label>
          <Textarea
            id="nome"
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            rows={2}
            maxLength={500}
            required
          />
          <p className="text-xs text-muted-foreground">
            Descreva como nos editais: tipo, material e medidas. É este texto que comparamos com os
            itens das licitações.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="preco_proposta"
            rotulo="Preço proposta (R$)"
            valor={preco}
            aoMudar={setPreco}
            inputMode="decimal"
            placeholder="0,00"
            required
          />
          <Campo
            nome="lance_minimo"
            rotulo="Lance mínimo (R$)"
            valor={lance}
            aoMudar={setLance}
            inputMode="decimal"
            placeholder="0,00"
            required
            ajuda="O menor preço que você aceita. É a base do valor estimado no Dashboard."
          />
        </div>

        <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Opcionais (melhoram a triagem)</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="segmento_id">Segmento</Label>
              <select
                id="segmento_id"
                name="segmento_id"
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Sem segmento</option>
                {segmentos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <Campo
              nome="medidas"
              rotulo="Medidas"
              valor={medidas}
              aoMudar={setMedidas}
              placeholder="6Fr x 26 cm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="palavras_chave">Palavras-chave e sinônimos</Label>
            <Textarea
              id="palavras_chave"
              name="palavras_chave"
              value={palavras}
              onChange={(e) => setPalavras(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={"duplo j\npigtail"}
            />
            <p className="text-xs text-muted-foreground">
              Um termo por linha: outros nomes pelos quais os editais chamam este produto.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo nome="marca" rotulo="Marca" valor={marca} aoMudar={setMarca} />
            <Campo nome="fabricante" rotulo="Fabricante" valor={fabricante} aoMudar={setFabricante} />
            <Campo nome="registro_anvisa" rotulo="Registro ANVISA" valor={anvisa} aoMudar={setAnvisa} />
          </div>
        </fieldset>

        <MensagemErro>{estado.erro}</MensagemErro>
        <MensagemOk>{estado.mensagem}</MensagemOk>
        <div className="flex justify-end">
          <BotaoEnviar size="lg">{produto ? "Salvar produto" : "Incluir produto"}</BotaoEnviar>
        </div>
      </form>

      {produto ? (
        <form
          action={excluir}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4"
          onSubmit={(evento) => {
            if (
              !window.confirm(
                `Excluir o produto ${produto.codigo}? Os arquivos dele também serão apagados.`,
              )
            ) {
              evento.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={produto.id} />
          <div className="min-w-0">
            <p className="text-sm font-medium">Excluir produto</p>
            <p className="text-sm text-muted-foreground">
              Remove o produto e os arquivos dele. Não tem volta.
            </p>
            <MensagemErro>{estadoExcluir.erro}</MensagemErro>
          </div>
          <BotaoEnviar variant="destructive">Excluir</BotaoEnviar>
        </form>
      ) : null}
    </div>
  );
}
