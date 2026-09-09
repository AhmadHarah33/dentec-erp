/**
 * Arabic counted-noun agreement.
 *
 * Arabic does not have one plural — it picks the noun's form from the count,
 * and getting it wrong is the difference between "منذ 6 يوم" (wrong, reads as
 * broken machine output) and "منذ 6 أيام". The rule keys off the last two
 * digits of the number:
 *
 *   0        → plural            لا أيام
 *   1        → singular          يوم
 *   2        → dual              يومان
 *   3 – 10   → plural            أيام
 *   11 – 99  → accusative        يومًا   (tamyīz, singular + fatḥatān)
 *   100, 1000, … (last two digits 0) → singular   مئة يوم
 *
 * Above 100 the last two digits decide, so 103 behaves like 3 and 111 like 11.
 */

import type { Locale } from "./i18n";

export interface ArabicNounForms {
  /** يوم — used for 1, and for round hundreds/thousands. */
  singular: string;
  /** يومان — used for exactly 2. */
  dual: string;
  /** أيام — used for 0 and 3–10. */
  plural: string;
  /** يومًا — the tamyīz form, used for 11–99. */
  accusative: string;
}

/**
 * Pick the noun form that agrees with `count`. Returns the noun only, so the
 * caller keeps control of where the digits sit in the sentence.
 */
export function formatArabicPlural(
  count: number,
  words: ArabicNounForms,
): string {
  const n = Math.abs(Math.trunc(count || 0));
  const lastTwo = n % 100;

  if (n === 0) return words.plural;
  if (lastTwo === 0) return words.singular; // 100, 200, 1000 …
  if (lastTwo === 1) return words.singular;
  if (lastTwo === 2) return words.dual;
  if (lastTwo >= 3 && lastTwo <= 10) return words.plural;
  return words.accusative; // 11 – 99
}

/* ------------------------------------------------------------------ */
/* The nouns the app actually counts                                   */
/* ------------------------------------------------------------------ */

/**
 * Dual forms are given in the accusative/genitive (يومين, not يومان) because
 * every site in this app puts the noun after a preposition or a number, which
 * is where that case lands.
 */
export const AR_NOUNS = {
  day: {
    singular: "يوم",
    dual: "يومين",
    plural: "أيام",
    accusative: "يومًا",
  },
  invoice: {
    singular: "فاتورة",
    dual: "فاتورتين",
    plural: "فواتير",
    accusative: "فاتورة",
  },
  job: {
    singular: "أمر صيانة",
    dual: "أمري صيانة",
    plural: "أوامر صيانة",
    accusative: "أمر صيانة",
  },
  item: {
    singular: "صنف",
    dual: "صنفين",
    plural: "أصناف",
    accusative: "صنفًا",
  },
  order: {
    singular: "أمر شراء",
    dual: "أمري شراء",
    plural: "أوامر شراء",
    accusative: "أمر شراء",
  },
} as const satisfies Record<string, ArabicNounForms>;

export type CountedNoun = keyof typeof AR_NOUNS;

/** Turkish has no dual and no agreement after a numeral — one form each. */
const TR_NOUNS: Record<CountedNoun, string> = {
  day: "gün",
  invoice: "fatura",
  job: "servis kaydı",
  item: "kalem",
  order: "satın alma",
};

/**
 * The noun form to interpolate into a `{unit}` placeholder, for whichever
 * locale is rendering. Messages keep their digits and their preposition in
 * `ar.ts`; only the noun varies with the count.
 */
export function countedNoun(
  locale: Locale,
  noun: CountedNoun,
  count: number,
): string {
  if (locale === "tr") return TR_NOUNS[noun];
  return formatArabicPlural(count, AR_NOUNS[noun]);
}

/**
 * The whole counted phrase — digits and noun together — ready to drop into a
 * `{d}` placeholder.
 *
 * This exists because Arabic does not always want the numeral written. The
 * singular and the dual already carry their count: "يومين" *is* "two days", so
 * "منذ 2 يومين" reads like "two two-days". From three upward the
 * numeral is written and the noun agrees with it. Turkish has no such rule:
 * the numeral is always written and the noun never changes.
 */
export function countedPhrase(
  locale: Locale,
  noun: CountedNoun,
  count: number,
): string {
  if (locale === "tr") return `${Math.abs(Math.trunc(count || 0))} ${TR_NOUNS[noun]}`;

  const n = Math.abs(Math.trunc(count || 0));
  const words = AR_NOUNS[noun];
  // 1 and 2 are carried by the noun's own form; writing the digit as well
  // duplicates the count.
  if (n === 1) return words.singular;
  if (n === 2) return words.dual;
  return `${n} ${formatArabicPlural(n, words)}`;
}

/**
 * A bare duration in days, agreeing correctly: 1 → "يوم واحد", 6 → "6 أيام",
 * 13 → "13 يومًا". The digits are Latin to match `formatNumber` and the
 * tabular figures the rest of the app aligns on.
 *
 * Callers that need "منذ …" or "متأخرة …" wrap this with their own message
 * key rather than baking the preposition in here.
 */
export function formatArabicDuration(days: number): string {
  const n = Math.abs(Math.trunc(days || 0));
  // "يوم واحد" rather than a bare "يوم": read on its own, without a
  // preposition in front of it, the singular wants the emphatic "one".
  if (n === 1) return "يوم واحد";
  return countedPhrase("ar", "day", n);
}
