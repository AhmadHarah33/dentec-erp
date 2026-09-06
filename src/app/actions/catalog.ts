"use server";

import { revalidatePath } from "next/cache";
import { create, remove, snapshot, update } from "@/lib/data/repository";
import type { Category, Item } from "@/lib/data/types";
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
  if (!input.nameAr.trim()) return fail("msg.requiredField");

  // A category cannot be its own parent, nor a descendant of itself.
  if (id && input.parentId) {
    const db = await snapshot();
    let cursor: string | null = input.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return fail("msg.error");
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = db.categories.find((c) => c.id === cursor)?.parentId ?? null;
    }
  }

  const row = id
    ? await update("categories", id, input)
    : await create("categories", input);
  refresh(CATALOG_PATHS);
  return ok(row.id);
}

export async function deleteCategory(id: string): Promise<Result> {
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
  if (!input.nameAr.trim() || !input.sku.trim()) return fail("msg.requiredField");

  const db = await snapshot();
  const clash = db.items.find(
    (i) => i.sku.toLowerCase() === input.sku.trim().toLowerCase() && i.id !== id,
  );
  if (clash) return fail("msg.error", "duplicate-sku");

  const row = id ? await update("items", id, input) : await create("items", input);
  refresh(CATALOG_PATHS);
  return ok(row.id);
}

/**
 * Items with movement history are deactivated, not deleted. Removing one would
 * orphan every stock move and invoice line that references it, and those are
 * the records the business actually needs to keep.
 */
export async function deleteItem(id: string): Promise<Result<"deleted" | "archived">> {
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

