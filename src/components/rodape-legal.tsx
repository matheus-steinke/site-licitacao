import Link from "next/link";

export function RodapeLegal() {
  return (
    <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <Link href="/termos" className="hover:text-foreground hover:underline">
        Termos de Uso
      </Link>
      <Link href="/privacidade" className="hover:text-foreground hover:underline">
        Política de Privacidade
      </Link>
    </nav>
  );
}
