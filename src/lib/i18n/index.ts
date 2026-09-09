import ar, { type MessageKey } from "./ar";
import tr from "./tr";

export type Locale = "ar" | "tr";
export type { MessageKey };

export const LOCALES: Locale[] = ["ar", "tr"];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "dentec_locale";

export const LOCALE_LABEL: Record<Locale, string> = {
  ar: "العربية",
  tr: "Türkçe",
};

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isLocale(v: unknown): v is Locale {
  return v === "ar" || v === "tr";
}

/**
 * Look up a message. `tr.ts` is now a complete mirror of `ar.ts` — every
 * `MessageKey` resolves in both locales, enforced at compile time by
 * `tr`'s `Record<MessageKey, string>` type. The `ar[key] ?? key` fallback
 * stays only as a defensive guard; it should never actually trigger.
 *
 * `{name}` placeholders are replaced from `vars`.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const message = (locale === "tr" ? tr[key] : undefined) ?? ar[key] ?? key;
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

/** Bind a translator to one locale. */
export function translatorFor(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}
