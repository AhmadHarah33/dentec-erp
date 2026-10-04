import { databaseLabel, snapshot } from "@/lib/data/repository";
import { SettingsClient } from "./settings-client";
import { requireAccess } from "@/lib/auth/server";

export default async function SettingsPage() {
  await requireAccess("settings", "edit");
  const db = await snapshot();

  return <SettingsClient settings={db.settings} database={databaseLabel()} />;
}
