"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/primitives";
import { AuthShell, FormAlert } from "@/components/app/auth-shell";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { signIn } from "@/app/actions/auth";

export function LoginForm({ next, inactive }: { next: string; inactive?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(inactive ? t("auth.inactive") : null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn(email, password, next);
      if (result.ok) {
        router.replace(result.data);
        router.refresh();
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  return (
    <AuthShell title={t("auth.signInTitle")} subtitle={t("auth.signInSubtitle")}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t("auth.email")}>
          <Input
            type="email"
            dir="ltr"
            autoComplete="username"
            inputMode="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("auth.password")}>
          <Input
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <FormAlert>{error}</FormAlert>}
        <Button type="submit" variant="primary" disabled={pending} className="w-full mt-1">
          {t("auth.signIn")}
        </Button>
        <p className="text-2xs text-faint leading-relaxed text-center">{t("auth.forgotHint")}</p>
      </form>
    </AuthShell>
  );
}
