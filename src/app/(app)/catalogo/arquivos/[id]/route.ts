import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { criarClienteServidor } from "@/lib/supabase/server";

/** Download de um arquivo de produto: gera um link temporário (60 s) e redireciona. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const supabase = await criarClienteServidor();
  // O RLS só devolve a linha se o usuário for membro da organização dona do arquivo.
  const { data: arquivo } = await supabase
    .from("produto_arquivos")
    .select("caminho, nome")
    .eq("id", id.data)
    .maybeSingle();
  if (!arquivo) return new NextResponse("Arquivo não encontrado.", { status: 404 });

  const { data, error } = await supabase.storage
    .from("produtos")
    .createSignedUrl(arquivo.caminho, 60, { download: arquivo.nome });
  if (error || !data) {
    console.error("[catalogo] link de download:", error?.message);
    return new NextResponse("Não foi possível abrir o arquivo.", { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
