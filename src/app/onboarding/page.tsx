import { Check, FileSpreadsheet, MailOpen } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormularioAcao } from "@/components/formulario/formulario-acao";
import { CamposEmpresa } from "@/components/organizacao/campos-empresa";
import { SeletorSegmentos } from "@/components/organizacao/seletor-segmentos";
import { SeletorUfs } from "@/components/organizacao/seletor-ufs";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exigirUsuario } from "@/lib/auth";
import {
  listarSegmentosAtivos,
  listarSegmentosDaOrganizacao,
  obterOrganizacao,
} from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import {
  aceitarConvite,
  concluirOnboarding,
  passoEmpresa,
  passoSegmentos,
  passoUfs,
} from "./actions";

const PASSOS = [
  { id: "empresa", rotulo: "Empresa" },
  { id: "ufs", rotulo: "Estados" },
  { id: "segmentos", rotulo: "Segmentos" },
  { id: "tabela", rotulo: "Tabela de preços" },
] as const;

type Passo = (typeof PASSOS)[number]["id"];

function Indicador({ atual }: { atual: Passo }) {
  const indiceAtual = PASSOS.findIndex((p) => p.id === atual);
  return (
    <ol className="mb-4 flex items-center gap-2 text-xs" aria-label="Passos do cadastro">
      {PASSOS.map((passo, indice) => {
        const feito = indice < indiceAtual;
        const ativo = indice === indiceAtual;
        return (
          <li
            key={passo.id}
            aria-current={ativo ? "step" : undefined}
            className="flex flex-1 flex-col gap-1.5"
          >
            <span
              className={cn("h-1 rounded-full", feito || ativo ? "bg-primary" : "bg-border")}
            />
            <span
              className={cn(
                "flex items-center gap-1",
                ativo ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {feito ? <Check className="size-3" aria-hidden /> : null}
              <span className={cn(!ativo && "max-sm:sr-only")}>{passo.rotulo}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Voltar({ para }: { para: Passo }) {
  return (
    <Link
      href={`/onboarding?passo=${para}`}
      className={buttonVariants({ variant: "ghost", size: "lg" })}
    >
      Voltar
    </Link>
  );
}

async function ConvitesPendentes() {
  const supabase = await criarClienteServidor();
  const { data: convites } = await supabase.rpc("meus_convites");
  if (!convites?.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailOpen className="size-4" aria-hidden />
          Você foi convidado
        </CardTitle>
        <CardDescription>
          Aceite para entrar em uma empresa que já usa o app. Nesse caso não é preciso cadastrar a
          empresa de novo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {convites.map((convite) => (
          <FormularioAcao
            key={convite.convite_id}
            acao={aceitarConvite}
            rotulo="Aceitar convite"
            aoLado={<span className="font-medium">{convite.organizacao}</span>}
          >
            <input type="hidden" name="convite" value={convite.convite_id} />
          </FormularioAcao>
        ))}
      </CardContent>
    </Card>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  await exigirUsuario();
  const atual = await obterOrganizacao();

  // Membro convidado, ou dono que já terminou: nada a fazer aqui.
  if (atual && (!atual.ehDono || atual.org.onboarding_concluido_em)) redirect("/oportunidades");

  const segmentosDaOrg = atual ? await listarSegmentosDaOrganizacao(atual.org.id) : [];

  // Não deixa pular para frente de um passo ainda não preenchido.
  const primeiroIncompleto: Passo = !atual
    ? "empresa"
    : atual.org.ufs.length === 0
      ? "ufs"
      : segmentosDaOrg.length === 0
        ? "segmentos"
        : "tabela";
  const { passo: pedido } = await searchParams;
  const indicePedido = PASSOS.findIndex((p) => p.id === pedido);
  const indiceLimite = PASSOS.findIndex((p) => p.id === primeiroIncompleto);
  const passo: Passo =
    indicePedido >= 0 && indicePedido <= indiceLimite ? PASSOS[indicePedido].id : primeiroIncompleto;

  return (
    <>
      <Indicador atual={passo} />

      {passo === "empresa" ? (
        <>
          {atual ? null : <ConvitesPendentes />}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados da empresa</CardTitle>
              <CardDescription>
                O porte define como tratamos os itens exclusivos para ME/EPP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormularioAcao acao={passoEmpresa} rotulo="Continuar">
                <CamposEmpresa
                  razaoSocial={atual?.org.razao_social}
                  cnpj={atual?.org.cnpj}
                  porte={atual?.org.porte}
                />
              </FormularioAcao>
            </CardContent>
          </Card>
        </>
      ) : null}

      {passo === "ufs" && atual ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estados atendidos</CardTitle>
            <CardDescription>
              Só mostramos licitações dos estados em que a sua empresa entrega.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao acao={passoUfs} rotulo="Continuar" aoLado={<Voltar para="empresa" />}>
              <SeletorUfs selecionadas={atual.org.ufs} />
            </FormularioAcao>
          </CardContent>
        </Card>
      ) : null}

      {passo === "segmentos" && atual ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Segmentos de interesse</CardTitle>
            <CardDescription>
              Marque as áreas em que a sua empresa atua. Dá para mudar depois em Configurações.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao acao={passoSegmentos} rotulo="Continuar" aoLado={<Voltar para="ufs" />}>
              <SeletorSegmentos
                segmentos={await listarSegmentosAtivos()}
                selecionados={segmentosDaOrg}
              />
            </FormularioAcao>
          </CardContent>
        </Card>
      ) : null}

      {passo === "tabela" && atual ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tabela de preços</CardTitle>
            <CardDescription>
              É com ela que comparamos cada item das licitações com os seus produtos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioAcao
              acao={concluirOnboarding}
              rotulo="Concluir e ver as licitações"
              aoLado={<Voltar para="segmentos" />}
            >
              <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-muted-foreground">
                  A importação da tabela (Excel ou CSV) chega na próxima etapa do app, no menu
                  <span className="font-medium text-foreground"> Catálogo</span>. Por enquanto,
                  conclua o cadastro e suba a tabela depois.
                </p>
              </div>
            </FormularioAcao>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export default function PaginaOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      }
    >
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}
