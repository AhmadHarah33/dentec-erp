import { getI18n } from "@/lib/i18n/server";
import { LinkButton } from "@/components/ui/primitives";

/**
 * An address outside every route. Rendered without the app shell (it sits
 * above the `(app)` group), so it carries the wordmark itself; a record
 * missing inside the app gets `(app)/not-found.tsx` instead, sidebar intact.
 */
export default async function RootNotFound() {
  const { t } = await getI18n();

  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="max-w-md text-center">
        <img src="/logo.svg" alt={t("app.name")} className="h-7 w-auto mx-auto mb-10" />
        <p className="num text-2xl font-bold text-faint">404</p>
        <h1 className="text-lg font-bold tracking-tight mt-3">{t("state.notFoundTitle")}</h1>
        <p className="text-xs text-muted mt-2">{t("state.notFoundHint")}</p>
        <div className="mt-6">
          <LinkButton href="/" variant="primary">
            {t("state.goHome")}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
