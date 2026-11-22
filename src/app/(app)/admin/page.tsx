import { redirect } from "next/navigation";

import { exigirAdmin } from "@/lib/auth";

export default async function PaginaAdmin() {
  await exigirAdmin();
  redirect("/admin/segmentos");
}
