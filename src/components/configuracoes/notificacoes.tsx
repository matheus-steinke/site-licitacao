"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { atualizarNotificacoes, enviarTesteDoEmailDiario } from "@/app/(app)/configuracoes/actions";
import { FormularioAcao } from "@/components/formulario/formulario-acao";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const HORAS = Array.from({ length: 24 }, (_, hora) => hora);
const rotuloDaHora = (hora: number) => `${String(hora).padStart(2, "0")}:00`;

const CAIXA = "mt-0.5 size-4 shrink-0 rounded border-input accent-primary disabled:opacity-60";

type Props = {
  ehDono: boolean;
  ligado: boolean;
  hora: number;
  receber: boolean;
};

/** E-mail diário: a empresa liga e escolhe a hora; cada pessoa decide se recebe. */
export function FormularioNotificacoes({ ehDono, ligado, hora, receber }: Props) {
  return (
    <FormularioAcao acao={atualizarNotificacoes} rotulo="Salvar notificações">
      <div className="flex flex-col gap-4">
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="ligado" defaultChecked={ligado} disabled={!ehDono} className={CAIXA} />
          <span>
            <span className="font-medium">Enviar o e-mail diário da empresa</span>
            <span className="block text-muted-foreground">
              Um e-mail por dia com as licitações novas dos seus estados e segmentos, com as do catálogo
              primeiro. Dia sem novidade não gera e-mail.
              {ehDono ? "" : " Só o responsável pela empresa muda esta opção e o horário."}
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hora-do-email">Horário do envio (Brasília)</Label>
          <select
            id="hora-do-email"
            name="hora"
            defaultValue={hora}
            disabled={!ehDono}
            className="h-10 w-32 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            {HORAS.map((h) => (
              <option key={h} value={h}>
                {rotuloDaHora(h)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            O envio sai na primeira verificação depois dessa hora, em geral nos primeiros 15 minutos.
          </p>
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="receber" defaultChecked={receber} className={CAIXA} />
          <span>
            <span className="font-medium">Quero receber o e-mail diário</span>
            <span className="block text-muted-foreground">
              Vale só para você. As outras pessoas da empresa escolhem por conta própria.
            </span>
          </span>
        </label>
      </div>
    </FormularioAcao>
  );
}

/** Manda agora, só para quem clicou, um e-mail com as oportunidades novas do momento. */
export function BotaoEmailDeTeste() {
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={enviando}
      aria-busy={enviando}
      onClick={() =>
        iniciar(async () => {
          const r = await enviarTesteDoEmailDiario();
          if (r.ok) toast.success(r.mensagem);
          else toast.error(r.erro);
        })
      }
    >
      {enviando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      {enviando ? "Enviando…" : "Enviar um e-mail de teste para mim"}
    </Button>
  );
}
