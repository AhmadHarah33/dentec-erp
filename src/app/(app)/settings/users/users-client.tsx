"use client";

import { useState, useTransition } from "react";
import type { Role, User } from "@/lib/data/types";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { ROLES } from "@/lib/permissions";
import { saveUser, deleteUser, issueAccountLink } from "@/app/actions/admin";
import { PageHeader } from "@/components/ui/page";
import { Badge, Button, Dot, Field, Input, Num, Select, type Tone } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { Modal, Confirm } from "@/components/ui/modal";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { IconPlus, IconTrash } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

/** Whether a person can get in, as far as the owner needs to know. */
export type Access = "active" | "invited" | "none" | "disabled";

const ACCESS_TONE: Record<Access, Tone> = {
  active: "success",
  invited: "warn",
  none: "muted",
  disabled: "danger",
};

const ACCESS_KEY: Record<Access, MessageKey> = {
  active: "users.accessActive",
  invited: "users.accessInvited",
  none: "users.accessNone",
  disabled: "users.accessDisabled",
};

interface UserRow {
  user: User;
  access: Access;
  jobsCount: number;
}

interface Form {
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
}

const BLANK: Form = { name: "", email: "", phone: "", role: "viewer", active: true };

export function UsersClient({
  rows,
  selfId,
}: {
  rows: UserRow[];
  selfId: string;
  /** Whether links are also emailed. Kept for the page to pass; the dialog reports what was actually sent. */
  mailEnabled: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [link, setLink] = useState<{ url: string; kind: "invite" | "recovery"; name: string; mailedTo: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const isSelf = editing?.user.id === selfId;

  function openNew() {
    setForm({ ...BLANK });
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(row: UserRow) {
    const { name, email, phone, role, active } = row.user;
    setForm({ name, email, phone, role, active });
    setEditing(row);
    setError(null);
    setOpen(true);
  }

  function errorText(result: { errorKey: string; detail?: string }) {
    return t(result.errorKey as MessageKey);
  }

  function submit() {
    if (!form.name.trim()) return setError(t("msg.requiredField"));
    setError(null);
    startTransition(async () => {
      const result = await saveUser(editing?.user.id ?? null, form);
      if (result.ok) {
        setOpen(false);
        toast(t("msg.saved"));
      } else setError(errorText(result));
    });
  }

  function confirmDelete() {
    if (!editing) return;
    startTransition(async () => {
      const result = await deleteUser(editing.user.id);
      setConfirming(false);
      if (result.ok) {
        toast(t(result.data === "archived" ? "msg.saved" : "msg.deleted"));
        setOpen(false);
      } else setError(errorText(result));
    });
  }

  function issue(kind: "invite" | "recovery") {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      // Save first, so an email typed in this dialog is the one invited.
      const saved = await saveUser(editing.user.id, form);
      if (!saved.ok) return setError(errorText(saved));
      const result = await issueAccountLink(editing.user.id, kind);
      if (!result.ok) return setError(errorText(result));
      setOpen(false);
      setCopied(false);
      setLink({ url: result.data.url, kind, name: form.name, mailedTo: result.data.mailedTo });
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast(t("users.copied"));
    } catch {
      /* the field is selectable; the person can copy by hand */
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: t("label.name"),
      sort: (r) => r.user.name,
      search: (r) => `${r.user.name} ${r.user.email} ${r.user.phone}`,
      render: (r) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className={r.user.active ? "font-medium truncate" : "text-muted line-through truncate"}>
            {r.user.name}
          </span>
          {r.user.id === selfId && <Badge tone="accent">{t("users.you")}</Badge>}
        </span>
      ),
    },
    {
      key: "role",
      header: t("label.role"),
      width: "120px",
      sort: (r) => r.user.role,
      render: (r) => <Badge tone="muted">{t(`role.${r.user.role}` as MessageKey)}</Badge>,
    },
    {
      key: "access",
      header: t("users.access"),
      width: "150px",
      sort: (r) => r.access,
      render: (r) => (
        <span className="text-2xs text-muted">
          <Dot tone={ACCESS_TONE[r.access]}>{t(ACCESS_KEY[r.access])}</Dot>
        </span>
      ),
    },
    {
      key: "email",
      header: t("label.email"),
      tertiary: true,
      sort: (r) => r.user.email,
      render: (r) => <Num className="text-muted text-2xs">{r.user.email || "—"}</Num>,
    },
    {
      key: "jobs",
      header: t("nav.service"),
      align: "end",
      width: "80px",
      secondary: true,
      sort: (r) => r.jobsCount,
      render: (r) => <Num className="text-muted">{r.jobsCount}</Num>,
    },
  ];

  const canIssue = editing && editing.user.active && form.email.trim();

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

      <DataTable<UserRow>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.user.id}
        onRowClick={openEdit}
        emptyTitle={t("empty.none")}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? editing.user.name : t("page.users.new")}
        description={t("users.roleHelp")}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {editing && !isSelf && (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={pending}>
                <IconTrash />
                {t("action.delete")}
              </Button>
            )}
            <div className="flex-1" />
            {canIssue && (
              <Button onClick={() => issue(editing.access === "active" ? "recovery" : "invite")} disabled={pending}>
                {editing.access === "active"
                  ? t("users.resetLink")
                  : editing.access === "invited"
                    ? t("users.inviteAgain")
                    : t("users.invite")}
              </Button>
            )}
            <Button variant="primary" onClick={submit} disabled={pending}>
              {t("action.save")}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("label.name")} required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t("label.email")}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t("label.phone")}>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t("label.role")} required>
            <Select
              value={form.role}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs cursor-pointer self-end h-10">
            <input
              type="checkbox"
              checked={form.active}
              disabled={isSelf}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="size-4 accent-[var(--color-accent)]"
            />
            {t("label.active")}
          </label>
        </div>
        {error && <p className="text-2xs text-danger mt-4">{error}</p>}
      </Modal>

      <Modal
        open={link !== null}
        onClose={() => setLink(null)}
        title={t("users.linkTitle")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLink(null)}>
              {t("action.close")}
            </Button>
            <Button variant="primary" onClick={copy}>
              {copied ? t("users.copied") : t("users.copy")}
            </Button>
          </div>
        }
      >
        {link && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted leading-relaxed">
              {t(link.kind === "invite" ? "users.linkHintInvite" : "users.linkHintReset", { name: link.name })}
            </p>
            <input
              readOnly
              value={link.url}
              dir="ltr"
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 rounded-sm border border-line bg-sunken px-3 text-2xs text-ink font-mono"
            />
            {link.mailedTo && (
              <p className="text-2xs text-success">{t("users.linkMailed", { email: link.mailedTo })}</p>
            )}
          </div>
        )}
      </Modal>

      <Confirm
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmDelete}
        title={t("msg.confirmDelete")}
        message={t("msg.confirmDeleteHint")}
        confirmLabel={t("action.delete")}
        pending={pending}
      />
    </>
  );
}
