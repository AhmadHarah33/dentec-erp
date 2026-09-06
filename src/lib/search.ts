/**
 * The payload behind the top-bar search.
 *
 * Built once per render on the server and handed to the client as plain data,
 * because the whole dataset is small enough to filter in the browser and a
 * round trip per keystroke would feel worse than it costs to ship. If the data
 * ever outgrows this, the shape stays and the filtering moves to a server
 * action — callers do not change.
 */

import type { Database } from "./data/types";

export type SearchKind = "invoice" | "customer" | "supplier" | "item" | "job";

export interface SearchEntry {
  kind: SearchKind;
  /** What the user reads. */
  label: string;
  /** The line under it — a customer name, a SKU, a status. */
  sub: string;
  /** Everything matched against, lowercased and pre-joined. */
  haystack: string;
  href: string;
}

const norm = (s: string) => s.toLowerCase().trim();

export function buildSearchIndex(db: Database, locale: string): SearchEntry[] {
  const customerName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "";
  const itemName = (i: { nameAr: string; nameTr: string }) =>
    locale === "tr" && i.nameTr ? i.nameTr : i.nameAr;

  const entries: SearchEntry[] = [];

  for (const inv of db.salesInvoices) {
    const who = customerName(inv.customerId);
    entries.push({
      kind: "invoice",
      label: inv.number,
      sub: who,
      haystack: norm(`${inv.number} ${who}`),
      href: `/invoices/${inv.id}`,
    });
  }

  for (const c of db.customers) {
    entries.push({
      kind: "customer",
      label: c.name,
      sub: c.code || c.phone,
      haystack: norm(`${c.name} ${c.code} ${c.phone} ${c.city}`),
      href: `/customers/${c.id}`,
    });
  }

  for (const s of db.suppliers) {
    entries.push({
      kind: "supplier",
      label: s.name,
      sub: s.code || s.phone,
      haystack: norm(`${s.name} ${s.code} ${s.phone} ${s.city}`),
      href: `/suppliers/${s.id}`,
    });
  }

  for (const i of db.items) {
    const name = itemName(i);
    entries.push({
      kind: "item",
      label: name,
      sub: i.sku,
      haystack: norm(`${name} ${i.nameAr} ${i.nameTr} ${i.sku} ${i.barcode} ${i.brand} ${i.model}`),
      href: i.itemType === "spare_part" ? "/spare-parts" : "/products",
    });
  }

  for (const j of db.serviceJobs) {
    const who = customerName(j.customerId);
    entries.push({
      kind: "job",
      label: j.number,
      sub: j.machineLabel || who,
      haystack: norm(`${j.number} ${j.machineLabel} ${j.serialNo} ${who}`),
      href: `/service/${j.id}`,
    });
  }

  return entries;
}

/** Ranked matches: a prefix hit beats a hit buried in the middle of a field. */
export function searchIndex(
  entries: SearchEntry[],
  query: string,
  limit = 8,
): SearchEntry[] {
  const q = norm(query);
  if (q.length < 2) return [];

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of entries) {
    const at = entry.haystack.indexOf(q);
    if (at < 0) continue;
    scored.push({ entry, score: at === 0 ? 0 : at });
    if (scored.length > 400) break;
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
