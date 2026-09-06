"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, CategoryScope } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import { localName } from "@/lib/labels";
import { formatNumber } from "@/lib/money";
import { deleteCategory, saveCategory } from "@/app/actions/catalog";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge, Button, Card, Field, Input, Num, Select } from "@/components/ui/primitives";
import { Modal, Confirm } from "@/components/ui/modal";
import { IconEdit, IconPlus, IconTrash } from "@/components/ui/icons";
import type { MessageKey } from "@/lib/i18n";

const SCOPES: CategoryScope[] = ["product", "spare_part", "both"];

const BLANK = {
  nameAr: "",
  nameTr: "",
  parentId: null as string | null,
  appliesTo: "both" as CategoryScope,
  sortOrder: 0,
};

interface TreeNode {
  category: Category;
  depth: number;
}

export function CategoriesClient({
  categories,
  counts,
  locale,
}: {
  categories: Category[];
  counts: Record<string, number>;
  locale: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [confirming, setConfirming] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Flatten the tree once, depth-first, so rendering stays a simple list. */
  const tree = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (parentId: string | null, depth: number) => {
      categories
        .filter((c) => c.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.nameAr.localeCompare(b.nameAr))
        .forEach((category) => {
          out.push({ category, depth });
          walk(category.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [categories]);

  function openNew() {
    setForm({ ...BLANK, sortOrder: categories.length });
    setEditing(null);
    setCreating(true);
    setError(null);
  }

  function openEdit(category: Category) {
    setForm({
      nameAr: category.nameAr,
      nameTr: category.nameTr,
      parentId: category.parentId,
      appliesTo: category.appliesTo,
      sortOrder: category.sortOrder,
    });
    setEditing(category);
    setCreating(true);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCategory(editing?.id ?? null, form);
      if (result.ok) setCreating(false);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  function confirmDelete() {
    if (!confirming) return;
    startTransition(async () => {
      const result = await deleteCategory(confirming.id);
      if (result.ok) setConfirming(null);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  // A category cannot be re-parented under itself or its own descendants.
  const parentOptions = useMemo(() => {
    if (!editing) return categories;
    const banned = new Set<string>([editing.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories) {
        if (c.parentId && banned.has(c.parentId) && !banned.has(c.id)) {
          banned.add(c.id);
          grew = true;
        }
      }
    }
    return categories.filter((c) => !banned.has(c.id));
  }, [categories, editing]);

  return (
    <>
      <PageHeader
        title={t("page.categories.title")}
        subtitle={t("page.categories.subtitle")}
        actions={
          <Button variant="primary" onClick={openNew}>
            <IconPlus />
            {t("page.categories.new")}
          </Button>
        }
      />

      <Card>
        {tree.length === 0 ? (
          <EmptyState
            title={t("empty.categories")}
            action={
              <Button variant="primary" onClick={openNew}>
                {t("page.categories.new")}
              </Button>
            }
          />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="hairline-b bg-sunken/60">
                <th className="h-10 px-3 text-start text-2xs font-medium text-muted">
                  {t("label.name")}
                </th>
                <th className="h-10 px-3 text-start text-2xs font-medium text-muted hidden md:table-cell">
                  {t("page.categories.scope")}
                </th>
                <th className="h-10 px-3 text-end text-2xs font-medium text-muted w-28">
                  {t("page.categories.itemCount")}
                </th>
                <th className="h-10 px-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {tree.map(({ category, depth }) => (
                <tr key={category.id} className="hairline-b last:border-b-0 group">
                  <td className="h-11 px-3">
                    <span
                      className="flex items-center gap-2"
                      style={{ paddingInlineStart: depth * 16 }}
                    >
                      {depth > 0 && <span className="text-faint select-none">└</span>}
                      <span className={depth === 0 ? "font-medium" : ""}>
                        {localName(category, locale)}
                      </span>
                      {locale !== "tr" && category.nameTr && (
                        <span className="text-2xs text-faint">{category.nameTr}</span>
                      )}
                    </span>
                  </td>
                  <td className="h-11 px-3 hidden md:table-cell">
                    <Badge tone="muted">
                      {t(`scope.${category.appliesTo}` as MessageKey)}
                    </Badge>
                  </td>
                  <td className="h-11 px-3 text-end text-muted">
                    <Num>{formatNumber(counts[category.id] ?? 0, locale, 0)}</Num>
                  </td>
                  <td className="h-11 px-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(category)}
                        aria-label={t("action.edit")}
                      >
                        <IconEdit />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          setConfirming(category);
                        }}
                        aria-label={t("action.delete")}
                        className="hover:text-danger"
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? t("action.edit") : t("page.categories.new")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={pending}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {t("action.save")}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("label.nameAr")} required>
            <Input
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label={t("label.nameTr")} hint={t("label.optional")}>
            <Input
              value={form.nameTr}
              onChange={(e) => setForm({ ...form, nameTr: e.target.value })}
              dir="ltr"
            />
          </Field>
          <Field label={t("label.parentCategory")}>
            <Select
              value={form.parentId ?? ""}
              onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}
            >
              <option value="">{t("label.none")}</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {localName(c, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("page.categories.scope")}>
            <Select
              value={form.appliesTo}
              onChange={(e) =>
                setForm({ ...form, appliesTo: e.target.value as CategoryScope })
              }
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`scope.${s}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="text-2xs text-danger mt-3">{error}</p>}
      </Modal>

      <Confirm
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirmDelete}
        title={t("msg.confirmDelete")}
        message={error ?? t("msg.confirmDeleteHint")}
        confirmLabel={t("action.delete")}
        pending={pending}
      />
    </>
  );
}
