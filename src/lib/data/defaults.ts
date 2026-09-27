import type { Settings } from "./types";

/**
 * What a brand-new system starts from before the first-run setup fills in the
 * company. Every field is present, so no screen has to guard against a
 * half-empty settings row; `store-supabase.ts` spreads the stored settings
 * over this, which also fills in any field added after a row was written.
 */
export function blankSettings(): Settings {
  return {
    companyName: "",
    companyNameTr: "",
    address: "",
    phone: "",
    email: "",
    taxNumber: "",
    baseCurrency: "USD",
    currencies: [{ code: "USD", rate: 1 }],
    defaultTaxRate: 0,
    lowStockDefault: 3,
    invoicePrefix: "INV",
    purchasePrefix: "PO",
    servicePrefix: "SRV",
    updatedAt: new Date(0).toISOString(),
  };
}
