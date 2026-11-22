"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { registrarArquivo } from "@/app/(app)/catalogo/actions";
import { MensagemErro } from "@/components/formulario/mensagens";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { criarClienteNavegador } from "@/lib/supabase/client";

const LIMITE = 20 * 1024 * 1024;
const TIPOS_ACEITOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

type Tipo = "catalogo_tecnico" | "registro_anvisa" | "outro";

/**
 * Envio de arquivo do produto. O arquivo vai direto do navegador para o
 * Storage (o RLS só deixa gravar na pasta da própria organização) e depois é
 * registrado no banco.
 */
export function EnvioArquivo({ orgId, produtoId }: { orgId: string; produtoId: string }) {
  const [tipo, setTipo] = useState<Tipo>("catalogo_tecnico");
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<string>();
  const campo = useRef<HTMLInputElement>(null);

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(undefined);

    const extensao = TIPOS_ACEITOS[arquivo.type];
    if (!extensao) {
      setErro("Formato não aceito. Envie PDF, PNG ou JPG.");
      return;
    }
    if (arquivo.size > LIMITE) {
      setErro("O arquivo passa de 20 MB.");
      return;
    }
    if (arquivo.size === 0) {
      setErro("O arquivo está vazio.");
      return;
    }

    // Numa transição, a lista de arquivos da página já volta atualizada.
    iniciarEnvio(async () => {
      try {
        const caminho = `${orgId}/${produtoId}/${crypto.randomUUID()}.${extensao}`;
        const supabase = criarClienteNavegador();
        const { error } = await supabase.storage
          .from("produtos")
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
        if (error) {
          setErro("Não foi possível enviar o arquivo. Confira sua conexão e tente de novo.");
          return;
        }
        const resultado = await registrarArquivo({
          produtoId,
          tipo,
          nome: arquivo.name.slice(0, 255),
          caminho,
          tamanho: arquivo.size,
          tipoMime: arquivo.type as "application/pdf" | "image/png" | "image/jpeg",
        });
        if (resultado.erro) setErro(resultado.erro);
      } catch {
        setErro("Não foi possível enviar o arquivo. Confira sua conexão e tente de novo.");
      } finally {
        if (campo.current) campo.current.value = "";
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tipo-arquivo">Tipo</Label>
          <select
            id="tipo-arquivo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo)}
            disabled={enviando}
            className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="catalogo_tecnico">Catálogo técnico</option>
            <option value="registro_anvisa">Registro ANVISA</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <input
          ref={campo}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="sr-only"
          id="arquivo-produto"
          onChange={(e) => enviar(e.target.files?.[0])}
          disabled={enviando}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={enviando}
          onClick={() => campo.current?.click()}
        >
          {enviando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {enviando ? "Enviando…" : "Enviar arquivo"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">PDF, PNG ou JPG, até 20 MB.</p>
      <MensagemErro>{erro}</MensagemErro>
    </div>
  );
}
