"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { acceptLink } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui/primitives";
import { AuthError, AuthHeading, PasswordInput } from "@/components/app/auth-form";

const MIN_PASSWORD = 10;

export function AcceptClient({ type, token }: { type: "invite" | "recovery"; token: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(token ? null : t("auth.linkInvalid"));

  function submit(form: FormData) {
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < MIN_PASSWORD) return setError(t("auth.passwordShort"));
    if (password !== confirm) return setError(t("auth.mismatch"));
    setError(null);
    startTransition(async () => {
      const result = await acceptLink(type, token, password);
      if (result.ok) {
        router.replace(result.data);
        router.refresh();
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  return (
    <>
      <AuthHeading
        title={t(type === "invite" ? "auth.welcomeTitle" : "auth.resetTitle")}
        subtitle={t(type === "invite" ? "auth.welcomeSubtitle" : "auth.resetSubtitle")}
      />
      <form action={submit} className="flex flex-col gap-4">
        <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
          <PasswordInput name="password" autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />
        </Field>
        <Field label={t("auth.confirmPassword")}>
          <PasswordInput name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD} required />
        </Field>
        <AuthError>{error}</AuthError>
        <Button type="submit" variant="primary" disabled={pending || !token} className="w-full mt-1">
          {t("auth.savePassword")}
        </Button>
        <Link href="/login" className="text-2xs font-medium text-accent hover:text-accent-strong text-center">
          {t("auth.backToLogin")}
        </Link>
      </form>
    </>
  );
}
