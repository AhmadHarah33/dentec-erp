"use client";

import { useState, useTransition } from "react";
import type { User } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { ROLES } from "@/lib/labels";
import { saveUser, deleteUser } from "@/app/actions/admin";
import { PageHeader } from "@/components/ui/page";
import {
  Badge,
  Button,
  Field,
  Input,
  Num,
  Select,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Modal, Confirm } from "@/components/ui/modal";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { IconPlus, IconTrash, IconAlert } from "@/components/ui/icons";

interface UserRow {
  user: User;
  jobsCount: number;
}

type UserInput = Omit<User, "id" | "createdAt" | "updatedAt">;

const BLANK: UserInput = {
  name: "",
  email: "",
  phone: "",
  role: "viewer",
  active: true,
};

export function UsersClient({
  rows,
}: {
  rows: UserRow[];
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<User | null>(null);

  function openNew() {
    setForm({ ...BLANK });
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(user: User) {
    const { id, createdAt, updatedAt, ...rest } = user;
    void id;
    void createdAt;
    void updatedAt;
    setForm(rest);
    setEditing(user);
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      setError(t("msg.requiredField"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveUser(editing?.id ?? null, form);
      if (result.ok) setOpen(false);
      else setError(t(result.errorKey as MessageKey));
    });
  }

  function confirmDelete() {
    if (!confirming) return;
    startTransition(async () => {
      const result = await deleteUser(confirming.id);
      if (result.ok) {
        setConfirming(null);
        setOpen(false);
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: t("label.name"),
      sort: (r) => r.user.name,
      search: (r) => `${r.user.name} ${r.user.email} ${r.user.phone}`,
      render: (r) => (
        <button
          onClick={() => openEdit(r.user)}
          className={`text-start hover:text-accent transition-colors ${
            r.user.active ? "" : "text-muted line-through"
          }`}
        >
          {r.user.name}
        </button>
      ),
    },
    {
      key: "email",
      header: t("label.email"),
      tertiary: true,
      sort: (r) => r.user.email,
      render: (r) => (
        <span className="text-muted text-2xs" dir="ltr">
          {r.user.email || "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: t("label.phone"),
      tertiary: true,
      width: "120px",
      sort: (r) => r.user.phone,
      render: (r) => (
        <Num className="text-muted text-2xs">
          {r.user.phone || "—"}
        </Num>
      ),
    },
    {
      key: "role",
      header: t("label.role"),
      width: "100px",
      sort: (r) => r.user.role,
      render: (r) => (
        <Badge tone="muted">
          {t(`role.${r.user.role}` as MessageKey)}
        </Badge>
      ),
    },
    {
      key: "jobs",
      header: t("nav.service"),
      align: "end",
      width: "80px",
      secondary: true,
      sort: (r) => r.jobsCount,
      render: (r) => (
        <Num className="text-muted">
          {r.jobsCount}
        </Num>
      ),
    },
    {
      key: "active",
      header: t("label.active"),
      width: "80px",
      sort: (r) => (r.user.active ? 1 : 0),
      render: (r) => (
        <Badge tone={r.user.active ? "accent" : "muted"}>
          {r.user.active ? t("label.active") : t("label.inactive")}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("page.users.title")}
        subtitle={t("page.users.subtitle")}
        actions={
          <Button variant="primary" onClick={openNew}>
            <IconPlus />
            {t("page.users.new")}
          </Button>
        }
      />

      <PageTabs tabs={SETTINGS_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      {/* Warning Banner */}
      <div className="border border-warn-soft bg-warn-soft rounded-sm p-3 text-2xs text-warn flex items-start gap-2 mb-4">
        <IconAlert className="flex-shrink-0 mt-0.5" />
        <div>
          {t("page.users.noAuthWarning")}
        </div>
      </div>

      <DataTable<UserRow>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.user.id}
        emptyTitle={t("empty.none")}
        emptyAction={
          <Button variant="primary" onClick={openNew}>
            {t("page.users.new")}
          </Button>
        }
      />

      {/* Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t("action.edit") : t("page.users.new")}
        footer={
          <div className="flex items-center justify-between gap-2">
            {editing && (
              <Button
                variant="danger"
                onClick={() => setConfirming(editing)}
                disabled={pending}
              >
                <IconTrash />
                {t("action.delete")}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={pending}
            >
              {t("action.save")}
            </Button>
          </div>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("label.name")} required className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label={t("label.email")}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={t("label.phone")}>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={t("label.role")} required>
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            {t("label.active")}
          </label>
        </div>
        {error && (
          <p className="text-2xs text-danger mt-3">{error}</p>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Confirm
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirmDelete}
        title={t("msg.confirmDelete")}
        message={t("msg.confirmDeleteHint")}
        confirmLabel={t("action.delete")}
        pending={pending}
      />
    </>
  );
}
