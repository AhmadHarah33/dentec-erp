import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translatorFor, type Locale } from ".";

/** The active locale for this request. Server components only. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Locale plus a bound translator — what most server pages want. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: translatorFor(locale) };
}
