"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { signIn } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui/primitives";
import { AuthError, AuthHeading, PasswordInput } from "@/components/app/auth-form";

export function LoginClient({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""), next);
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
      <AuthHeading title={t("auth.signInTitle")} subtitle={t("auth.signInSubtitle")} />
      <form action={submit} className="flex flex-col gap-4">
        <Field label={t("label.email")}>
          <Input name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label={t("auth.password")}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </Field>
        <AuthError>{error}</AuthError>
        <Button type="submit" variant="primary" disabled={pending} className="w-full mt-1">
          {t("auth.signIn")}
        </Button>
        <Link href="/forgot" className="text-2xs font-medium text-accent hover:text-accent-strong text-center">
          {t("auth.forgot")}
        </Link>
      </form>
    </>
  );
}
