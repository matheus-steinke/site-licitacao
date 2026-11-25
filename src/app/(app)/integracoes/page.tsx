import type { Metadata } from "next";
import { CalendarDays, CircleAlert, CircleCheck, FolderOpen, Plug } from "lucide-react";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { FormularioAcao } from "@/components/formulario/formulario-acao";
import { BotaoDesconectar } from "@/components/integracoes/botoes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarData } from "@/lib/formato";
import { credenciaisDoGoogle } from "@/lib/integracoes/configuracao";
import { ESCOPO_AGENDA, ESCOPO_DRIVE } from "@/lib/integracoes/google/oauth";
import { CATALOGO_DE_PROVEDORES } from "@/lib/integracoes/provedores";
import { exigirOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";

import { conectarGoogle, salvarPreferenciasDoGoogle } from "./actions";

export const metadata: Metadata = { title: "Integrações" };

const AVISOS: Record<string, { texto: string; falhou: boolean }> = {
  conectado: { texto: "Google conectado. A partir de agora, ao aprovar uma oportunidade o evento e as pastas são criados.", falhou: false },
  cancelado: { texto: "A conexão foi cancelada na tela do Google. Nada mudou.", falhou: true },
  estado: { texto: "A conexão demorou demais ou foi aberta em outro navegador. Clique em Conectar de novo.", falhou: true },
  permissao: { texto: "Só o responsável pela empresa pode conectar integrações.", falhou: true },
  configuracao: { texto: "A integração com o Google ainda não foi configurada neste servidor.", falhou: true },
  google: { texto: "O Google não concluiu a conexão. Tente de novo; se continuar, confira a configuração no README.", falhou: true },
};

type Parametros = Promise<{ ok?: string; erro?: string }>;

function Marcavel({ nome, marcado, desabilitado, children }: { nome: string; marcado: boolean; desabilitado: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm has-disabled:cursor-default">
      <input type="checkbox" name={nome} defaultChecked={marcado} disabled={desabilitado} className="mt-0.5 size-4 shrink-0 accent-primary" />
      <span>{children}</span>
    </label>
  );
}

function Carregando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando as integrações">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** O título aparece na hora; a situação das integrações chega em seguida. */
export default function PaginaIntegracoes({ searchParams }: { searchParams: Parametros }) {
  return (
    <>
      <CabecalhoPagina
        titulo="Integrações"
        descricao="Ligue o sistema às ferramentas que a sua empresa já usa. Ao aprovar uma oportunidade, a agenda e as pastas ficam prontas sozinhas."
      />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: Parametros }) {
  const { org, ehDono } = await exigirOrganizacao();
  const parametros = await searchParams;
  const aviso = AVISOS[parametros.ok ?? parametros.erro ?? ""];
  const configurado = credenciaisDoGoogle() !== null;

  const supabase = await criarClienteServidor();
  // As credenciais cifradas não são lidas aqui: a tela não precisa delas.
  const { data: google, error } = await supabase
    .from("integracoes")
    .select("conta, escopos, agenda_ativa, agenda_id, drive_ativo, pasta_raiz_nome, pasta_raiz_id, automatico, erro, conectado_em")
    .eq("org_id", org.id)
    .eq("provedor", "google")
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar as integrações: ${error.message}`);

  const semAgenda = google ? !google.escopos.includes(ESCOPO_AGENDA) : false;
  const semDrive = google ? !google.escopos.includes(ESCOPO_DRIVE) : false;
  const [provedorGoogle, ...futuros] = CATALOGO_DE_PROVEDORES;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {aviso ? (
        <Alert variant={aviso.falhou ? "destructive" : "default"} role={aviso.falhou ? "alert" : "status"} data-testid="aviso-da-integracao">
          {aviso.falhou ? <CircleAlert aria-hidden /> : <CircleCheck aria-hidden />}
          <AlertDescription>{aviso.texto}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="titulo-google" className="rounded-xl border bg-card p-5 shadow-xs" data-testid="cartao-google">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="titulo-google" className="font-medium">
              {provedorGoogle.nome}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{provedorGoogle.descricao}</p>
          </div>
          {google ? <Badge>{google.erro ? "Precisa reconectar" : "Conectado"}</Badge> : <Badge variant="outline">Não conectado</Badge>}
        </div>

        {!configurado ? (
          <Alert className="mt-4" data-testid="google-sem-configuracao">
            <CircleAlert aria-hidden />
            <AlertTitle>Falta configurar o Google neste servidor</AlertTitle>
            <AlertDescription>
              O administrador do sistema precisa cadastrar as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. O passo a
              passo está no README, na seção “Integração com o Google”.
            </AlertDescription>
          </Alert>
        ) : !google ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">O que o Google vai pedir para autorizar</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Criar e alterar eventos na sua agenda (o app não lê os seus outros compromissos).
                </li>
                <li className="flex items-start gap-2">
                  <FolderOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Criar pastas e arquivos no Drive. O app só enxerga o que ele mesmo criou, nada mais.
                </li>
              </ul>
              <p className="mt-2 text-muted-foreground">Marque as duas caixas na tela do Google. Dá para desconectar quando quiser.</p>
            </div>
            {ehDono ? (
              <form action={conectarGoogle}>
                <BotaoEnviar>
                  <Plug aria-hidden />
                  Conectar Google
                </BotaoEnviar>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Só o responsável pela empresa pode conectar a conta do Google.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            <p className="text-sm">
              Conta: <span className="font-medium">{google.conta ?? "não informada pelo Google"}</span>
              <span className="text-muted-foreground"> · conectada em {formatarData(google.conectado_em)}</span>
            </p>

            {google.erro || semAgenda || semDrive ? (
              <Alert variant="destructive" role="alert" data-testid="google-com-problema">
                <CircleAlert aria-hidden />
                <AlertDescription>
                  {google.erro ??
                    `Você não autorizou ${semAgenda && semDrive ? "a Agenda nem o Drive" : semAgenda ? "a Agenda" : "o Drive"} na tela do Google. Conecte de novo e marque as duas caixas.`}
                </AlertDescription>
              </Alert>
            ) : null}

            <FormularioAcao acao={salvarPreferenciasDoGoogle} rotulo="Salvar preferências" somenteLeitura={!ehDono}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Quando criar</legend>
                <Marcavel nome="automatico" marcado={google.automatico} desabilitado={!ehDono}>
                  Criar o evento e as pastas automaticamente ao aprovar uma oportunidade.
                  <span className="block text-xs text-muted-foreground">
                    Desligado, eles só são criados pelo botão “Criar evento e pastas”, na página da licitação.
                  </span>
                </Marcavel>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Agenda</legend>
                <Marcavel nome="agenda_ativa" marcado={google.agenda_ativa} desabilitado={!ehDono}>
                  Criar o evento da disputa (1 hora, a partir do horário da disputa). Se a data mudar no PNCP, o evento acompanha.
                </Marcavel>
                <div className="mt-1 flex flex-col gap-1.5">
                  <Label htmlFor="google-agenda">Em qual agenda</Label>
                  <Input
                    id="google-agenda"
                    name="agenda_id"
                    defaultValue={google.agenda_id === "primary" ? "" : google.agenda_id}
                    placeholder="Em branco = a agenda principal da conta"
                    maxLength={250}
                    disabled={!ehDono}
                  />
                  <p className="text-xs text-muted-foreground">
                    Para usar outra agenda (por exemplo, uma agenda “Licitações” compartilhada com a equipe), cole aqui o ID dela:
                    no Google Agenda, abra as configurações da agenda e copie o “ID da agenda”, em “Integrar agenda”.
                  </p>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Drive</legend>
                <Marcavel nome="drive_ativo" marcado={google.drive_ativo} desabilitado={!ehDono}>
                  Criar as pastas do processo (0. Planejamento, 1. Edital e Anexos, 2. Habilitação, 3. Proposta atualizada e 4.
                  Resultados) e salvar os arquivos do PNCP em “1. Edital e Anexos”.
                </Marcavel>
                <div className="mt-1 flex flex-col gap-1.5">
                  <Label htmlFor="google-pasta">Nome da pasta principal</Label>
                  <Input
                    id="google-pasta"
                    name="pasta_raiz_nome"
                    defaultValue={google.pasta_raiz_nome}
                    required
                    maxLength={100}
                    disabled={!ehDono}
                    className="max-w-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    O app cria esta pasta no seu Drive e, dentro dela, uma pasta por mês. Você pode movê-la para onde quiser.{" "}
                    {google.pasta_raiz_id ? (
                      <a
                        href={`https://drive.google.com/drive/folders/${encodeURIComponent(google.pasta_raiz_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Abrir a pasta no Drive
                      </a>
                    ) : (
                      "Ela é criada na primeira aprovação."
                    )}
                  </p>
                </div>
              </fieldset>
            </FormularioAcao>

            {ehDono ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <form action={conectarGoogle}>
                  <BotaoEnviar variant="outline" size="sm">
                    <Plug aria-hidden />
                    Conectar de novo ou trocar de conta
                  </BotaoEnviar>
                </form>
                <BotaoDesconectar />
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-futuras">
        <h2 id="titulo-futuras" className="mb-3 font-medium">
          Em breve
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {futuros.map((provedor) => (
            <li key={provedor.id} className="rounded-xl border border-dashed p-4" data-testid="provedor-futuro">
              <p className="text-sm font-medium">{provedor.nome}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{provedor.descricao}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
