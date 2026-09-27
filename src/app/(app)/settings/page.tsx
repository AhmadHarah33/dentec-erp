import { dataDir, snapshot } from "@/lib/data/repository";
import { requireSection } from "@/lib/session";
import { isSupabaseEnabled } from "@/lib/supabase/config";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  await requireSection("settings");
  const db = await snapshot();

  return (
    <SettingsClient
      settings={db.settings}
      dataDir={isSupabaseEnabled() ? null : dataDir}
    />
  );
}
