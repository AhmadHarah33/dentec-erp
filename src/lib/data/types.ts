/**
 * Domain types — the single source of truth for the whole app.
 * The JSON adapter, the Supabase adapter that replaces it, and every page
 * all agree on these shapes.
 */

export type ID = string;
export type ISODate = string; // "2026-09-03"
export type ISODateTime = string; // full ISO timestamp

/** Every stored record carries these. */
export interface Base {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type CurrencyCode = "USD" | "TRY" | "SAR" | "AED" | "EUR" | "SYP";

export interface Settings {
  companyName: string;
  companyNameTr: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  baseCurrency: CurrencyCode;
  /** Currencies offered on documents; rate means 1 unit = N units of base. */
  currencies: { code: CurrencyCode; rate: number }[];
  defaultTaxRate: number; // percent, e.g. 20
  lowStockDefault: number;
  invoicePrefix: string;
  purchasePrefix: string;
  servicePrefix: string;
  updatedAt: ISODateTime;
  /* --- Printed-document footer. All optional: a settings row written before
     these existed is still valid, and a blank field simply omits its row. --- */
  bankName?: string;
  bankAccountName?: string;
  iban?: string;
  swift?: string;
  /** Warranty wording printed under the totals. */
  warrantyTerms?: string;
  /** Dentec's own Vergi Dairesi, for the TR document header. */
  taxOffice?: string;
  tradeRegistryNo?: string;
  mersisNo?: string;
}

/* ------------------------------------------------------------------ */
/* Billing region                                                      */
/* ------------------------------------------------------------------ */

/**
 * Dentec bills into two legal regimes and they do not converge:
 *
 * - **TR** is e-transformation territory. The GİB decides the document type
 *   from whether the buyer is a registered e-Fatura user, VAT is KDV at
 *   1 / 10 / 20 %, and a shipped machine needs an e-İrsaliye alongside its
 *   invoice.
 * - **SY** is cross-border export. The document is a commercial export
 *   invoice, priced in hard currency, usually VAT-exempt at origin, and what
 *   matters on the page is the customs and transit wording.
 *
 * The region lives on both the customer (their standing regime) and the
 * invoice (the regime that document was actually raised under), because a
 * customer can be re-domiciled without rewriting their history.
 */
export type BillingRegion = "TR" | "SY";

export const BILLING_REGIONS: BillingRegion[] = ["TR", "SY"];

/** VKN is the 10-digit company number; TCKN the 11-digit personal one. */
export type TurkishTaxIdKind = "vkn" | "tckn";

export interface TurkeyTaxProfile {
  taxIdKind: TurkishTaxIdKind;
  /** VKN (10 digits) or T.C. Kimlik No (11 digits). */
  taxId: string;
  /** Vergi Dairesi — the tax office the taxpayer is registered with. */
  taxOffice: string;
  /** Ticaret Sicil No — trade registry number. */
  tradeRegistryNo: string;
  /**
   * GİB mailbox alias — `urn:mail:defaultpk@…` for receiving (PK) or
   * `urn:mail:defaultgb@…` for sending (GB). Empty means the party is not a
   * registered e-Fatura user, which forces e-Arşiv instead.
   */
  gibAlias: string;
  /** Registered in the GİB e-Fatura user list. Decides e-Fatura vs e-Arşiv. */
  eInvoiceUser: boolean;
  /** Mersis No, when the party has one. */
  mersisNo: string;
}

export interface SyriaTaxProfile {
  /** السجل التجاري — commercial register number. */
  commercialRegisterNo: string;
  /** رقم الإجازة الاستيرادية — the buyer's import licence, if any. */
  importLicenseNo: string;
  /** Border post / crossing the goods transit through. */
  customsOffice: string;
  /** Free-text exemption or transit wording printed on the document. */
  exemptionNote: string;
}

/** KDV bands. Turkey has exactly these three; anything else is a data error. */
export const KDV_RATES = [1, 10, 20] as const;
export type KdvRate = (typeof KDV_RATES)[number];

/**
 * What kind of document this invoice legally is.
 *
 * - `fatura`      — paper/standard invoice, no e-transformation
 * - `e_fatura`    — taxpayer to registered taxpayer, routed through the GİB
 * - `e_arsiv`     — taxpayer to non-registered buyer or end consumer
 * - `e_irsaliye`  — electronic dispatch note travelling with the goods
 * - `export`      — Syrian / cross-border commercial export invoice
 */
export type InvoiceDocumentType =
  | "fatura"
  | "e_fatura"
  | "e_arsiv"
  | "e_irsaliye"
  | "export";

/**
 * Everything an e-İrsaliye has to carry that an invoice does not. Required
 * only when the document type is `e_irsaliye`; a chair or an autoclave does
 * not move without one.
 */
export interface DispatchInfo {
  /** Araç Plakası — vehicle plate. */
  vehiclePlate: string;
  driverName: string;
  /** Driver's T.C. Kimlik No, which the GİB expects on the dispatch note. */
  driverTckn: string;
  carrierName: string;
  /** Carrier's VKN. */
  carrierTaxId: string;
  /** Fiili sevk tarihi — when the goods actually left. */
  dispatchedAt: ISODateTime;
  deliveryAddress: string;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type Role = "owner" | "accountant" | "sales" | "technician" | "viewer";

export interface User extends Base {
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
}

export type PartyKind = "clinic" | "hospital" | "lab" | "dealer" | "other";

/** Customers and suppliers share a shape; they differ only in which file they live in. */
export interface Party extends Base {
  code: string;
  name: string;
  kind: PartyKind;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  taxNumber: string;
  creditLimit: number; // base currency, 0 = none
  notes: string;
  active: boolean;
  /**
   * Which regime this party is billed under. Optional so rows written before
   * dual-region billing stay valid; `resolveRegion()` in
   * `src/lib/billing/region.ts` supplies the default for those.
   */
  billingRegion?: BillingRegion;
  /** Present when `billingRegion` is "TR". */
  turkey?: TurkeyTaxProfile;
  /** Present when `billingRegion` is "SY". */
  syria?: SyriaTaxProfile;
}

export type Customer = Party;
export type Supplier = Party;

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type ItemType = "product" | "spare_part";
export type CategoryScope = ItemType | "both";

export interface Category extends Base {
  nameAr: string;
  nameTr: string;
  parentId: ID | null;
  appliesTo: CategoryScope;
  sortOrder: number;
}

export type Unit = "piece" | "box" | "set" | "meter" | "kg" | "liter";

export interface Item extends Base {
  sku: string;
  nameAr: string;
  nameTr: string;
  itemType: ItemType;
  categoryId: ID | null;
  unit: Unit;
  /** Standard cost in base currency — drives stock valuation and margin. */
  cost: number;
  price: number;
  taxRate: number; // percent
  minStock: number;
  brand: string;
  model: string;
  barcode: string;
  /** For spare parts: which machines this part fits. */
  fitsItemIds: ID[];
  notes: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export interface Warehouse extends Base {
  nameAr: string;
  nameTr: string;
  location: string;
  isDefault: boolean;
  active: boolean;
}

export type MoveType =
  | "opening"
  | "purchase"
  | "sale"
  | "service"
  | "transfer"
  | "adjustment"
  | "return";

export type RefType =
  | "purchase_order"
  | "sales_invoice"
  | "service_job"
  | "transfer"
  | "manual";

/**
 * Append-only ledger. On-hand is ALWAYS derived by summing qtyDelta.
 * Never mutate or delete a move — correct it with an opposing move.
 */
export interface StockMove extends Base {
  date: ISODate;
  itemId: ID;
  warehouseId: ID;
  qtyDelta: number; // positive = in, negative = out
  type: MoveType;
  refType: RefType;
  refId: ID | null;
  unitCost: number; // base currency at time of move
  note: string;
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "draft" | "issued" | "partial" | "paid" | "void";
export type PurchaseStatus =
  | "draft"
  | "ordered"
  | "partial"
  | "received"
  | "cancelled";

export type DiscountKind = "percent" | "amount";

export interface DocumentLine {
  id: ID;
  itemId: ID | null;
  description: string;
  qty: number;
  unitPrice: number; // in the currency of the parent document
  discountPercent: number;
  taxRate: number; // percent
}

export interface SalesInvoice extends Base {
  number: string;
  date: ISODate;
  dueDate: ISODate;
  customerId: ID;
  warehouseId: ID;
  currency: CurrencyCode;
  /** 1 unit of `currency` = fxRate units of base. Frozen when the doc is issued. */
  fxRate: number;
  status: InvoiceStatus;
  discountKind: DiscountKind;
  discountValue: number;
  lines: DocumentLine[];
  notes: string;
  /** Set when the invoice leaves draft and its stock moves are written. */
  issuedAt: ISODateTime | null;
  /**
   * The regime this document was raised under. Copied from the customer when
   * the invoice is created and then frozen — re-domiciling a customer must
   * not rewrite invoices already issued to them. Optional for rows that
   * predate the field.
   */
  billingRegion?: BillingRegion;
  /** Optional for legacy rows; `resolveDocumentType()` derives the default. */
  documentType?: InvoiceDocumentType;
  /** Required when `documentType` is "e_irsaliye", ignored otherwise. */
  dispatch?: DispatchInfo;
  /**
   * Rate from this document's currency to the customer's local currency, for
   * the "converted to" line an SY export invoice prints. Independent of
   * `fxRate`, which converts to the company's base currency.
   */
  localRate?: number;
  localCurrency?: CurrencyCode;
}

export interface PurchaseOrder extends Base {
  number: string;
  date: ISODate;
  expectedDate: ISODate;
  supplierId: ID;
  warehouseId: ID;
  currency: CurrencyCode;
  fxRate: number;
  status: PurchaseStatus;
  discountKind: DiscountKind;
  discountValue: number;
  lines: DocumentLine[];
  notes: string;
  receivedAt: ISODateTime | null;
  /**
   * Set when this order was drafted to un-block a service job. Optional: rows
   * written before the link existed simply do not carry it.
   */
  serviceJobId?: ID | null;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export type PaymentDirection = "in" | "out";
export type PaymentMethod = "cash" | "bank" | "cheque" | "card";
export type PartyType = "customer" | "supplier";

export interface Payment extends Base {
  date: ISODate;
  direction: PaymentDirection;
  partyType: PartyType;
  partyId: ID;
  /** Optional link to the document being settled. */
  invoiceId: ID | null;
  amount: number; // in `currency`
  currency: CurrencyCode;
  fxRate: number;
  method: PaymentMethod;
  reference: string;
  note: string;
}

export type ExpenseCategory =
  | "rent"
  | "salaries"
  | "utilities"
  | "shipping"
  | "marketing"
  | "maintenance"
  | "other";

export interface Expense extends Base {
  date: ISODate;
  category: ExpenseCategory;
  amount: number;
  currency: CurrencyCode;
  fxRate: number;
  method: PaymentMethod;
  description: string;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export type ServiceStatus =
  | "received"
  | "diagnosed"
  | "awaiting_parts"
  | "in_progress"
  | "done"
  | "delivered";

export interface ServicePart {
  id: ID;
  itemId: ID;
  qty: number;
  unitPrice: number;
  warehouseId: ID;
  /** True once the stock move for this part has been written. */
  consumed: boolean;
}

export interface ServiceJob extends Base {
  number: string;
  date: ISODate;
  customerId: ID;
  /** The machine being serviced — an item of type "product". */
  machineItemId: ID | null;
  machineLabel: string;
  serialNo: string;
  reportedFault: string;
  diagnosis: string;
  status: ServiceStatus;
  technicianId: ID | null;
  laborCharge: number;
  underWarranty: boolean;
  parts: ServicePart[];
  notes: string;
  closedAt: ISODateTime | null;
  /** The invoice raised from this job, if it has been billed. */
  invoiceId?: ID | null;
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface Database {
  settings: Settings;
  users: User[];
  categories: Category[];
  items: Item[];
  warehouses: Warehouse[];
  stockMoves: StockMove[];
  customers: Customer[];
  suppliers: Supplier[];
  salesInvoices: SalesInvoice[];
  purchaseOrders: PurchaseOrder[];
  payments: Payment[];
  expenses: Expense[];
  serviceJobs: ServiceJob[];
}

/** Every collection key except the settings singleton. */
export type CollectionName = Exclude<keyof Database, "settings">;
