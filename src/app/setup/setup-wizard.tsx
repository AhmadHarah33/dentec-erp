"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, NumberInput, Select } from "@/components/ui/primitives";
import { AuthShell, FormAlert } from "@/components/app/auth-shell";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import type { CurrencyCode } from "@/lib/data/types";
import { runSetup, type SetupInput } from "@/app/actions/auth";

const CURRENCY_CODES: CurrencyCode[] = ["USD", "TRY", "SAR", "AED", "EUR", "SYP"];

export function SetupWizard() {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SetupInput>({
    companyName: "",
    baseCurrency: "USD",
    defaultTaxRate: 20,
    warehouseName: t("setup.warehouseDefault"),
    ownerName: "",
    email: "",
    password: "",
  });
  const [confirm, setConfirm] = useState("");

  const set = <K extends keyof SetupInput>(key: K, value: SetupInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function next(e: FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) return setError(t("msg.requiredField"));
    setError(null);
    setStep(1);
  }

  function finish(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError(t("auth.passwordShort"));
    if (form.password !== confirm) return setError(t("auth.passwordMismatch"));
    setError(null);
    startTransition(async () => {
      const result = await runSetup(form);
      if (result.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  const steps = [t("setup.stepCompany"), t("setup.stepOwner")];

  return (
    <AuthShell title={t("setup.title")} subtitle={t("setup.subtitle")} wide>
      <ol className="flex items-center gap-2 mb-6" aria-label={t("setup.title")}>
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={cn(
                "grid place-items-center size-7 rounded-full text-2xs font-semibold shrink-0 border",
                i <= step ? "bg-accent text-white border-accent" : "bg-surface text-muted border-line",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="num">{i + 1}</span>
            </span>
            <span className={cn("text-2xs font-medium truncate", i === step ? "text-ink" : "text-muted")}>
              {label}
            </span>
            {i < steps.length - 1 && <span className="flex-1 h-px bg-line" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <form onSubmit={next} className="flex flex-col gap-4" noValidate>
          <Field label={t("setup.companyName")} required>
            <Input autoFocus value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t("label.baseCurrency")}>
              <Select
                value={form.baseCurrency}
                onChange={(e) => set("baseCurrency", e.target.value as CurrencyCode)}
              >
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("setup.defaultTax")}>
              <NumberInput
                min={0}
                max={100}
                value={form.defaultTaxRate}
                onChange={(e) => set("defaultTaxRate", Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label={t("setup.warehouse")}>
            <Input value={form.warehouseName} onChange={(e) => set("warehouseName", e.target.value)} />
          </Field>
          {error && <FormAlert>{error}</FormAlert>}
          <Button type="submit" variant="primary" className="w-full mt-1">
            {t("setup.next")}
          </Button>
        </form>
      ) : (
        <form onSubmit={finish} className="flex flex-col gap-4" noValidate>
          <p className="text-2xs text-muted leading-relaxed">{t("setup.ownerHint")}</p>
          <Field label={t("setup.ownerName")} required>
            <Input autoFocus autoComplete="name" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>
          <Field label={t("auth.email")} required>
            <Input
              type="email"
              dir="ltr"
              autoComplete="username"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t("auth.password")} hint={t("auth.passwordShort")} required>
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
            <Field label={t("auth.confirmPassword")} required>
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>
          {error && <FormAlert>{error}</FormAlert>}
          <div className="flex gap-2 mt-1">
            <Button type="button" onClick={() => setStep(0)} disabled={pending}>
              {t("action.back")}
            </Button>
            <Button type="submit" variant="primary" disabled={pending} className="flex-1">
              {t("setup.finish")}
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
