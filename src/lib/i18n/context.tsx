"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, translatorFor, type Locale, type Translator } from ".";

interface LocaleValue {
  locale: Locale;
  t: Translator;
  dir: "rtl" | "ltr";
}

const LocaleContext = createContext<LocaleValue>({
  locale: DEFAULT_LOCALE,
  t: translatorFor(DEFAULT_LOCALE),
  dir: "rtl",
});

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      t: translatorFor(locale),
      dir: locale === "ar" ? "rtl" : "ltr",
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

/** Shorthand for the common case. */
export function useT(): Translator {
  return useContext(LocaleContext).t;
}
