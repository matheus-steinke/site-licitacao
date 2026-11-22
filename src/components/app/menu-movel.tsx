"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NOME_APP } from "@/lib/app";

/** Menu lateral em telas pequenas. Fecha sozinho ao tocar em um link. */
export function MenuMovel({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Abrir menu" />}>
        <Menu aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
        <SheetHeader className="border-b">
          <SheetTitle>{NOME_APP}</SheetTitle>
          <SheetDescription className="sr-only">Menu principal</SheetDescription>
        </SheetHeader>
        <div
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-3"
          onClick={(evento) => {
            if ((evento.target as HTMLElement).closest("a")) setAberto(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
