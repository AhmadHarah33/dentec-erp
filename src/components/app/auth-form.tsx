"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

/** Title block for the signed-out cards. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="text-xs text-muted mt-1.5 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/** An inline error under the form — a sentence, never a stack trace. */
export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-2xs text-danger bg-danger-soft border border-danger-line rounded-sm px-3 py-2 leading-relaxed">
      {children}
    </p>
  );
}

/**
 * A password field with a show/hide toggle. Typing a long password blind on
 * a phone is how people end up locked out.
 */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        dir="ltr"
        className={cn(
          "h-10 rounded-sm border border-line bg-surface ps-3 pe-11 text-xs text-ink",
          "placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent",
          props.className,
        )}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={t("auth.showPassword")}
        aria-pressed={shown}
        className="absolute inset-y-0 end-0 w-10 grid place-items-center text-faint hover:text-ink transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
          <circle cx="8" cy="8" r="2" />
          {shown && <path d="M2.5 13.5 13.5 2.5" />}
        </svg>
      </button>
    </div>
  );
}
