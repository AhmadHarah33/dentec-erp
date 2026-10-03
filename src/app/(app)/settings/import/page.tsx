import { requireAccess } from "@/lib/auth/server";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  await requireAccess("settings", "edit");
  return <ImportClient />;
}
