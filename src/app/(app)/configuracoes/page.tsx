import type { Metadata } from "next";
import { Clock, Lock, MailWarning, Trash2, UserRound } from "lucide-react";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { ExcluirConta } from "@/components/configuracoes/excluir-conta";
import { BotaoEmailDeTeste, FormularioNotificacoes } from "@/components/configuracoes/notificacoes";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { FormularioAcao } from "@/components/formulario/formulario-acao";
import { CamposEmpresa } from "@/components/organizacao/campos-empresa";
import { SeletorSegmentos } from "@/components/organizacao/seletor-segmentos";
import { SeletorUfs } from "@/components/organizacao/seletor-ufs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailConfigurado } from "@/lib/email/app";
import { formatarData, formatarDataHora } from "@/lib/formato";
import {
  exigirOrganizacao,
  listarSegmentosAtivos,
  listarSegmentosDaOrganizacao,
} from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";

import {
  atualizarEmpresa,
  atualizarLimitesDaTriagem,
  atualizarSegmentos,
  atualizarUfs,
  cancelarConvite,
  removerMembro,
} from "./actions";
import { FormularioConvite } from "./formulario-convite";

export const metadata: Metadata = { title: "Configurações" };

async function Usuarios({
  orgId,
  usuarioId,
  ehDono,
}: {
  orgId: string;
  usuarioId: string;
  ehDono: boolean;
}) {
  const supabase = await criarClienteServidor();
  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase
      .from("membros")
      .select("user_id, nome, email, papel, criado_em")
      .eq("org_id", orgId)
      .order("criado_em"),
    // O RLS só devolve convites para o dono.
    supabase
      .from("convites")
      .select("id, email, expira_em")
      .eq("org_id", orgId)
      .is("aceito_em", null)
      .order("criado_em", { ascending: false }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y rounded-lg border">
        {(membros ?? []).map((membro) => (
          <li key={membro.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {membro.nome ?? membro.email}
                {membro.user_id === usuarioId ? (
                  <span className="font-normal text-muted-foreground"> (você)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{membro.email}</p>
            </div>
            <Badge variant={membro.papel === "dono" ? "default" : "secondary"}>
              {membro.papel === "dono" ? "Responsável" : "Membro"}
            </Badge>
            {ehDono && membro.user_id !== usuarioId ? (
              <form action={removerMembro}>
                <input type="hidden" name="usuario" value={membro.user_id} />
                <BotaoEnviar
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${membro.nome ?? membro.email}`}
                  title="Remover da empresa"
                >
                  <Trash2 aria-hidden />
                </BotaoEnviar>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {ehDono ? (
        <>
          <FormularioConvite />
          {convites?.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Convites pendentes</p>
              <ul className="flex flex-col divide-y rounded-lg border">
                {convites.map((convite) => (
                  <li key={convite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                    <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{convite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Vale até {formatarData(convite.expira_em)}
                      </p>
                    </div>
                    <form action={cancelarConvite}>
                      <input type="hidden" name="convite" value={convite.id} />
                      <BotaoEnviar variant="ghost" size="sm">
                        Cancelar
                      </BotaoEnviar>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type UltimoEnvio = { status: string; destinatarios: number; oportunidades: number; erro: string | null; atualizado_em: string };

function descreverUltimoEnvio(envio: UltimoEnvio | null): string {
  if (!envio) return "Nenhum e-mail diário foi enviado ainda.";
  const quando = formatarDataHora(envio.atualizado_em);
  if (envio.status === "enviado") {
    const oportunidades = envio.oportunidades === 1 ? "1 oportunidade nova" : `${envio.oportunidades} oportunidades novas`;
    const pessoas = envio.destinatarios === 1 ? "1 pessoa" : `${envio.destinatarios} pessoas`;
    return `Último envio: ${quando}, com ${oportunidades}, para ${pessoas}.`;
  }
  if (envio.status === "vazio") return `Última verificação: ${quando}. Não havia oportunidade nova, então nada foi enviado.`;
  return `A última tentativa de envio (${quando}) falhou. ${envio.erro ?? ""} O sistema tenta de novo na hora seguinte.`;
}

async function Notificacoes({
  orgId,
  usuarioId,
  ehDono,
  ligado,
  hora,
}: {
  orgId: string;
  usuarioId: string;
  ehDono: boolean;
  ligado: boolean;
  hora: number;
}) {
  const supabase = await criarClienteServidor();
  const [{ data: eu }, { data: envio }] = await Promise.all([
    supabase.from("membros").select("recebe_email_diario").eq("org_id", orgId).eq("user_id", usuarioId).maybeSingle(),
    supabase
      .from("email_envios")
      .select("status, destinatarios, oportunidades, erro, atualizado_em")
      .eq("org_id", orgId)
      .eq("tipo", "diario")
      .order("dia", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const configurado = emailConfigurado();

  return (
    <div className="flex flex-col gap-5">
      {configurado ? null : (
        <Alert>
          <MailWarning aria-hidden />
          <AlertDescription>
            O envio de e-mails ainda não foi configurado neste servidor (falta a chave do Resend). As
            preferências abaixo ficam salvas e passam a valer quando ele for configurado.
          </AlertDescription>
        </Alert>
      )}
      <FormularioNotificacoes ehDono={ehDono} ligado={ligado} hora={hora} receber={eu?.recebe_email_diario ?? true} />
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">{descreverUltimoEnvio(envio)}</p>
        {configurado ? (
          <div>
            <BotaoEmailDeTeste />
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function CartaoExcluirConta({ orgId, empresa, ehDono }: { orgId: string; empresa: string; ehDono: boolean }) {
  const supabase = await criarClienteServidor();
  const { count } = await supabase.from("membros").select("user_id", { count: "exact", head: true }).eq("org_id", orgId);
  return <ExcluirConta ehDono={ehDono} empresa={empresa} outrasPessoas={Math.max(0, (count ?? 1) - 1)} />;
}

export default async function PaginaConfiguracoes() {
  const { usuario, org, ehDono } = await exigirOrganizacao();
  const [segmentos, segmentosDaOrg] = await Promise.all([
    listarSegmentosAtivos(),
    listarSegmentosDaOrganizacao(org.id),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Dados da empresa, estados atendidos, segmentos, triagem e usuários."
      />

      <div className="flex flex-col gap-5">
        {ehDono ? null : (
          <Alert>
            <Lock aria-hidden />
            <AlertDescription>
              Só o responsável pela empresa pode alterar estas configurações. Você pode
              consultá-las.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>
              O porte define como tratamos os itens exclusivos para ME/EPP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao acao={atualizarEmpresa} rotulo="Salvar empresa" somenteLeitura={!ehDono}>
              <CamposEmpresa
                razaoSocial={org.razao_social}
                cnpj={org.cnpj}
                porte={org.porte}
                desabilitado={!ehDono}
              />
            </FormularioAcao>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estados atendidos</CardTitle>
            <CardDescription>
              Só mostramos licitações dos estados em que a sua empresa entrega.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao acao={atualizarUfs} rotulo="Salvar estados" somenteLeitura={!ehDono}>
              <SeletorUfs selecionadas={org.ufs} desabilitado={!ehDono} />
            </FormularioAcao>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segmentos de interesse</CardTitle>
            <CardDescription>As áreas da saúde em que a sua empresa atua.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao
              acao={atualizarSegmentos}
              rotulo="Salvar segmentos"
              somenteLeitura={!ehDono}
            >
              <SeletorSegmentos
                segmentos={segmentos}
                selecionados={segmentosDaOrg}
                desabilitado={!ehDono}
              />
            </FormularioAcao>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Triagem</CardTitle>
            <CardDescription>
              Cada item de licitação recebe um score de 0 a 100 ao ser comparado com um produto do seu
              catálogo: palavras do nome, palavras-chave e medidas. Os limites abaixo dizem quando o
              item entra como compatível e quando entra só para você verificar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao acao={atualizarLimitesDaTriagem} rotulo="Salvar limites" somenteLeitura={!ehDono}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="limite-compativel">Compatível a partir de</Label>
                  <Input
                    id="limite-compativel"
                    name="compativel"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    required
                    defaultValue={org.score_compativel}
                    disabled={!ehDono}
                    className="max-w-32"
                  />
                  <p className="text-xs text-muted-foreground">Padrão: 60. Medida diferente nunca entra como compatível.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="limite-verificar">Verificar a partir de</Label>
                  <Input
                    id="limite-verificar"
                    name="verificar"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    required
                    defaultValue={org.score_verificar}
                    disabled={!ehDono}
                    className="max-w-32"
                  />
                  <p className="text-xs text-muted-foreground">Padrão: 50. Abaixo disso o item não aparece.</p>
                </div>
              </div>
            </FormularioAcao>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>Quem tem acesso aos dados da empresa neste app.</CardDescription>
          </CardHeader>
          <CardContent>
            <Usuarios orgId={org.id} usuarioId={usuario.id} ehDono={ehDono} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
            <CardDescription>O e-mail diário com as oportunidades novas da empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Notificacoes
              orgId={org.id}
              usuarioId={usuario.id}
              ehDono={ehDono}
              ligado={org.email_diario}
              hora={org.email_diario_hora}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Excluir conta</CardTitle>
            <CardDescription>
              Você pode apagar os seus dados deste app a qualquer momento (Lei Geral de Proteção de Dados).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CartaoExcluirConta orgId={org.id} empresa={org.razao_social} ehDono={ehDono} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
