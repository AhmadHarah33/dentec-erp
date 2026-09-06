"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/context";
import { IconGlobe } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Language pills. Shared by the top bar and the mobile navigation drawer. */
export function LocaleToggle({ block = false }: { block?: boolean }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    // One year; the locale is a display preference, not account state.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className={cn("flex items-center gap-2", block && "w-full")}>
      {!block && <IconGlobe className="text-faint" />}
      <div
        className={cn(
          "flex items-center rounded-full border border-line bg-surface p-0.5 gap-0.5",
          block && "w-full",
        )}
      >
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            disabled={pending}
            className={cn(
              "h-9 px-3 rounded-full text-2xs transition-colors",
              block && "flex-1",
              l === locale
                ? "bg-accent text-white font-semibold"
                : "text-muted hover:text-ink hover:bg-sunken",
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
