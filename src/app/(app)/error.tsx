"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/context";
import { Button, LinkButton } from "@/components/ui/primitives";
import { IconAlert } from "@/components/ui/icons";

/**
 * A page that threw. The shell — sidebar, search, navigation — stays up, so
 * one broken screen never strands someone with nowhere to go.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto text-center py-20">
      <span className="inline-grid place-items-center size-12 rounded-full bg-danger-soft text-danger mb-5">
        <IconAlert size={22} />
      </span>
      <h1 className="text-lg font-bold tracking-tight">{t("state.errorTitle")}</h1>
      <p className="text-xs text-muted mt-2 leading-relaxed">{t("state.errorHint")}</p>
      {error.digest && <p className="num text-2xs text-faint mt-3">{error.digest}</p>}
      <div className="flex justify-center gap-2 mt-6">
        <Button variant="primary" onClick={reset}>
          {t("state.retry")}
        </Button>
        <LinkButton href="/">{t("state.goHome")}</LinkButton>
      </div>
    </div>
  );
}
