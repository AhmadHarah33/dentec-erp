import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseEnabled } from "@/lib/supabase/config";
import { setupState } from "@/app/actions/auth";
import { AuthShell, FormAlert } from "@/components/app/auth-shell";
import { SetupWizard } from "./setup-wizard";

/**
 * First run on an empty Supabase database: company details, then the owner
 * account. Reachable without signing in — there is nobody to sign in as yet —
 * and it closes itself for good once the first owner exists.
 */
export default async function SetupPage() {
  if (!isSupabaseEnabled()) redirect("/");
  const state = await setupState();
  if (state === "done") redirect("/login");

  const { t } = await getI18n();
  if (state !== "ready") {
    return (
      <AuthShell title={t("setup.title")}>
        <FormAlert>{t(state === "no-service-key" ? "setup.missingServiceKey" : "setup.schemaMissing")}</FormAlert>
      </AuthShell>
    );
  }

  return <SetupWizard />;
}
