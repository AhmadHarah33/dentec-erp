import { dataDir, snapshot } from "@/lib/data/repository";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const db = await snapshot();

  return (
    <SettingsClient
      settings={db.settings}
      dataDir={dataDir}
    />
  );
}
