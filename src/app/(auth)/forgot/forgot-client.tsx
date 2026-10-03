"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { requestReset } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui/primitives";
import { AuthError, AuthHeading } from "@/components/app/auth-form";

/**
 * Self-service reset when mail is configured. Without it there is no safe
 * way to prove who is asking, so the page says to ask the owner, who can
 * issue a reset link from Settings → Users.
 */
export function ForgotClient({ mailEnabled }: { mailEnabled: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestReset(String(form.get("email") ?? ""));
      if (result.ok) setSent(true);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  return (
    <>
      <AuthHeading title={t("auth.forgotTitle")} subtitle={mailEnabled ? t("auth.forgotSubtitle") : undefined} />
      {!mailEnabled ? (
        <p className="text-xs text-muted leading-relaxed mb-5">{t("auth.noMailer")}</p>
      ) : sent ? (
        <p role="status" className="text-xs text-success bg-success-soft border border-success-line rounded-sm px-3 py-2.5 leading-relaxed mb-5">
          {t("auth.sentHint")}
        </p>
      ) : (
        <form action={submit} className="flex flex-col gap-4 mb-5">
          <Field label={t("label.email")}>
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <AuthError>{error}</AuthError>
          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {t("auth.sendLink")}
          </Button>
        </form>
      )}
      <Link href="/login" className="block text-2xs font-medium text-accent hover:text-accent-strong text-center">
        {t("auth.backToLogin")}
      </Link>
    </>
  );
}
