"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { VIEW_ROLES, viewRoleKey, type ViewRole } from "@/lib/roles";
import { useRole } from "./role-context";
import { TOUR_EVENT } from "./tour";
import { Button, Field, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { IconCheck, IconChevronDown, IconCoins, IconUser, IconWrench } from "@/components/ui/icons";
import { changePassword, signOut } from "@/app/actions/auth";

const ROLE_ICON: Record<ViewRole, typeof IconUser> = {
  owner: IconUser,
  accounting: IconCoins,
  service: IconWrench,
};

/**
 * Who you are and what you can do about it: replay the walkthrough, change
 * your password, sign out. In demo mode — no accounts — the same menu picks
 * which role the demo acts as, so each role's view can be tried.
 *
 * `variant="block"` is the full-width form at the foot of the mobile
 * navigation, where there is room to show the name as a labelled row.
 */
export function AccountMenu({ variant = "compact" }: { variant?: "compact" | "block" }) {
  const t = useT();
  const { role, setRole, pending, demo, name, email } = useRole();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Current = ROLE_ICON[role];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const block = variant === "block";
  const label = demo ? t(viewRoleKey(role)) : name || email;

  return (
    <div ref={ref} className={cn("relative", block && "w-full")} data-tour={block ? undefined : "account"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("account.menu")}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-line bg-surface",
          "text-2xs font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-40",
          block ? "w-full h-11 px-4 rounded-sm" : "h-9 px-3",
        )}
      >
        <Current size={15} className="text-accent shrink-0" />
        <span className={cn("truncate max-w-40", !block && "hidden md:inline")}>{label}</span>
        <IconChevronDown
          size={12}
          className={cn(
            "text-faint shrink-0 transition-transform duration-[var(--dur-swift)]",
            block && "ms-auto",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 bg-surface border border-line rounded-lg shadow-pop overflow-hidden",
            block ? "anim-pop bottom-full end-0 start-0 mb-2" : "anim-pop-end top-full end-0 mt-2 w-64",
          )}
        >
          {demo ? (
            <>
              <p className="px-4 pt-3 pb-1 text-2xs font-semibold text-muted">{t("account.demoRole")}</p>
              <p className="px-4 pb-2 text-2xs text-faint leading-snug">{t("msg.demoMode")}</p>
              {VIEW_ROLES.map((r) => {
                const RoleIcon = ROLE_ICON[r];
                const active = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setRole(r);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 h-11 text-xs transition-colors text-start",
                      active ? "bg-accent-soft text-accent font-semibold" : "hover:bg-sunken",
                    )}
                  >
                    <RoleIcon size={16} className="shrink-0" />
                    <span className="flex-1 truncate">{t(viewRoleKey(r))}</span>
                    {active && <IconCheck size={14} className="shrink-0" />}
                  </button>
                );
              })}
            </>
          ) : (
            <div className="px-4 py-3 hairline-b">
              <p className="text-xs font-semibold truncate">{name}</p>
              <p className="text-2xs text-muted truncate" dir="ltr">
                {email}
              </p>
              <p className="text-2xs text-faint mt-1">{t(`role.${role}` as MessageKey)}</p>
            </div>
          )}

          <div className={cn(demo && "hairline-t")}>
            <MenuButton
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(TOUR_EVENT));
              }}
            >
              {t("account.replayTour")}
            </MenuButton>
            {!demo && (
              <>
                <MenuButton
                  onClick={() => {
                    setOpen(false);
                    setChanging(true);
                  }}
                >
                  {t("auth.changePassword")}
                </MenuButton>
                <form action={signOut}>
                  <MenuButton type="submit" danger>
                    {t("auth.signOut")}
                  </MenuButton>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {!demo && <PasswordModal open={changing} onClose={() => setChanging(false)} />}
    </div>
  );
}

function MenuButton({
  children,
  danger,
  type = "button",
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      role="menuitem"
      onClick={onClick}
      className={cn(
        "w-full flex items-center px-4 h-11 text-xs transition-colors text-start hover:bg-sunken",
        danger && "text-danger",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Choose a new password. `forced` is the first-login form for an invited
 * account: it cannot be dismissed, because the temporary password was seen
 * by whoever created the account.
 */
export function PasswordModal({
  open,
  onClose,
  forced,
}: {
  open: boolean;
  onClose?: () => void;
  forced?: boolean;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    if (forced) return;
    setPassword("");
    setConfirm("");
    setError(null);
    setDone(false);
    onClose?.();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await changePassword(password, confirm);
      if (result.ok) {
        setDone(true);
        if (!forced) setTimeout(close, 900);
      } else {
        setError(t(result.errorKey as MessageKey));
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={forced ? t("auth.mustChangeTitle") : t("auth.changePassword")}
      dismissible={!forced}
      footer={
        <div className="flex justify-end gap-2">
          {!forced && (
            <Button variant="ghost" onClick={close} disabled={pending}>
              {t("action.cancel")}
            </Button>
          )}
          <Button variant="primary" onClick={submit} disabled={pending || done}>
            {done ? t("auth.passwordChanged") : t("action.save")}
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {forced && <p className="text-xs text-muted leading-relaxed">{t("auth.mustChangeBody")}</p>}
        <Field label={t("auth.newPassword")} hint={t("auth.passwordShort")}>
          <Input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label={t("auth.confirmPassword")}>
          <Input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && <p className="text-2xs text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
