"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, update } from "@/lib/data/repository";
import type { Category, Item } from "@/lib/data/types";
import { guard } from "@/lib/auth/server";
import { categoryInput, itemInput } from "@/lib/inputs";
import { parse } from "@/lib/validate";
import { fail, ok, type Result } from "./shared";

type CategoryInput = Omit<Category, "id" | "createdAt" | "updatedAt">;
type ItemInput = Omit<Item, "id" | "createdAt" | "updatedAt">;

const CATALOG_PATHS = ["/categories", "/products", "/spare-parts", "/inventory"];

function refresh(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export async function saveCategory(
  id: string | null,
  input: CategoryInput,
): Promise<Result<string>> {
  const gate = await guard("catalog", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => categoryInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.nameAr.trim()) return fail("msg.requiredField");

  const known = await snapshot();
  if (data.parentId && !known.categories.some((c) => c.id === data.parentId)) {
    return fail("msg.error", "unknown-reference");
  }
  if (id && !known.categories.some((c) => c.id === id)) return fail("msg.error", "not-found");

  // A category cannot be its own parent, nor a descendant of itself.
  if (id && data.parentId) {
    const db = known;
    let cursor: string | null = data.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return fail("msg.error");
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = db.categories.find((c) => c.id === cursor)?.parentId ?? null;
    }
  }

  const row = id
    ? await update("categories", id, data)
    : await create("categories", data);
  refresh(CATALOG_PATHS);
  return ok(row.id);
}

export async function deleteCategory(id: string): Promise<Result> {
  const gate = await guard("catalog", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  if (db.items.some((i) => i.categoryId === id)) {
    return fail("msg.error", "category-in-use");
  }
  if (db.categories.some((c) => c.parentId === id)) {
    return fail("msg.error", "category-has-children");
  }
  await remove("categories", id);
  refresh(CATALOG_PATHS);
  return ok(undefined);
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export async function saveItem(id: string | null, input: ItemInput): Promise<Result<string>> {
  const gate = await guard("catalog", "edit");
  if (!gate.ok) return gate;
  const parsed = parse(() => itemInput(input));
  if (!parsed.ok) return parsed;
  const data = parsed.data;
  if (!data.nameAr.trim() || !data.sku.trim()) return fail("msg.requiredField");

  const db = await snapshot();
  const clash = db.items.find(
    (i) => i.sku.toLowerCase() === data.sku.trim().toLowerCase() && i.id !== id,
  );
  if (clash) return fail("msg.error", "duplicate-sku");
  if (id && !db.items.some((i) => i.id === id)) return fail("msg.error", "not-found");
  if (data.categoryId && !db.categories.some((c) => c.id === data.categoryId)) {
    return fail("msg.error", "unknown-reference");
  }

  const row = id ? await update("items", id, data) : await create("items", data);
  refresh(CATALOG_PATHS);
  return ok(row.id);
}

/**
 * Items with movement history are deactivated, not deleted. Removing one would
 * orphan every stock move and invoice line that references it, and those are
 * the records the business actually needs to keep.
 */
export async function deleteItem(id: string): Promise<Result<"deleted" | "archived">> {
  const gate = await guard("catalog", "edit");
  if (!gate.ok) return gate;
  const db = await snapshot();
  const referenced =
    db.stockMoves.some((m) => m.itemId === id) ||
    db.salesInvoices.some((i) => i.lines.some((l) => l.itemId === id)) ||
    db.purchaseOrders.some((o) => o.lines.some((l) => l.itemId === id)) ||
    db.serviceJobs.some((j) => j.parts.some((p) => p.itemId === id));

  if (referenced) {
    await update("items", id, { active: false });
    refresh(CATALOG_PATHS);
    return ok("archived");
  }

  await remove("items", id);
  refresh(CATALOG_PATHS);
  return ok("deleted");
}

