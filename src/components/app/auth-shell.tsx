"use client";

import type { ReactNode } from "react";
import { Logo } from "./sidebar";

/**
 * The frame for the screens you see before you are inside the app: sign-in,
 * first-run setup. One card on the canvas, the wordmark above it — nothing to
 * navigate to yet, so nothing else on the page.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>
        <div className="flex justify-center mb-8">
          <Logo className="h-8" />
        </div>
        <div className="bg-surface border border-line rounded-lg shadow-card p-6 sm:p-8">
          <h1 className="text-lg font-semibold leading-tight text-balance">{title}</h1>
          {subtitle && <p className="text-xs text-muted mt-1.5 leading-relaxed">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** A form-level message. Status colour comes from the tone tokens, never picked here. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-2xs font-medium text-danger bg-danger-soft border border-danger-line rounded-sm px-3 py-2 leading-relaxed">
      {children}
    </p>
  );
}
