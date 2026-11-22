import { Marca } from "@/components/marca";
import { RodapeLegal } from "@/components/rodape-legal";

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Marca className="text-lg" />
      <main className="w-full max-w-sm">{children}</main>
      <RodapeLegal />
    </div>
  );
}
