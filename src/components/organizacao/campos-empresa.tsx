"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascararCnpj } from "@/lib/cnpj";

type Props = {
  razaoSocial?: string;
  cnpj?: string;
  porte?: string;
  desabilitado?: boolean;
};

const PORTES = [
  {
    valor: "me_epp",
    titulo: "ME ou EPP",
    descricao: "Microempresa ou empresa de pequeno porte. Pode disputar itens exclusivos.",
  },
  {
    valor: "demais",
    titulo: "Demais",
    descricao: "Médio ou grande porte. Itens exclusivos ME/EPP aparecem com alerta.",
  },
];

/** Razão social, CNPJ e porte. Campos controlados: nada se perde se a gravação falhar. */
export function CamposEmpresa({ razaoSocial = "", cnpj = "", porte = "", desabilitado }: Props) {
  const [nome, setNome] = useState(razaoSocial);
  const [documento, setDocumento] = useState(mascararCnpj(cnpj));
  const [porteAtual, setPorteAtual] = useState(porte);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="razao_social">Razão social</Label>
        <Input
          id="razao_social"
          name="razao_social"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="organization"
          maxLength={200}
          required
          disabled={desabilitado}
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input
          id="cnpj"
          name="cnpj"
          value={documento}
          onChange={(e) => setDocumento(mascararCnpj(e.target.value))}
          placeholder="00.000.000/0000-00"
          autoComplete="off"
          required
          disabled={desabilitado}
          className="h-10 sm:max-w-56"
        />
      </div>

      <fieldset className="flex flex-col gap-2" disabled={desabilitado}>
        <legend className="mb-2 text-sm font-medium">Porte</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PORTES.map((opcao) => (
            <label
              key={opcao.valor}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted has-disabled:cursor-default has-disabled:opacity-70"
            >
              <input
                type="radio"
                name="porte"
                value={opcao.valor}
                checked={porteAtual === opcao.valor}
                onChange={() => setPorteAtual(opcao.valor)}
                required
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block font-medium">{opcao.titulo}</span>
                <span className="block text-muted-foreground">{opcao.descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
