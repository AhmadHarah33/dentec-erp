import { getI18n } from "@/lib/i18n/server";
import { LinkButton } from "@/components/ui/primitives";

/** A record that does not exist — usually a stale link or a deleted row. */
export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <div className="max-w-md mx-auto text-center py-20">
      <p className="num text-2xl font-bold text-faint">404</p>
      <h1 className="text-lg font-bold tracking-tight mt-3">{t("state.notFoundTitle")}</h1>
      <p className="text-xs text-muted mt-2">{t("state.notFoundHint")}</p>
      <div className="mt-6">
        <LinkButton href="/" variant="primary">
          {t("state.goHome")}
        </LinkButton>
      </div>
    </div>
  );
}
