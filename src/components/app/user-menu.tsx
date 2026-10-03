"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { signOut } from "@/app/actions/auth";
import { useMember } from "./member-context";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "•";
}

/**
 * Who is signed in, and the way out. `block` is the full-width form used at
 * the foot of the mobile navigation drawer.
 */
export function UserMenu({ variant = "compact" }: { variant?: "compact" | "block" }) {
  const t = useT();
  const member = useMember();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const roleLabel = t(`role.${member.role}` as MessageKey);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const avatar = (
    <span className="grid place-items-center size-8 rounded-full bg-accent text-white text-2xs font-semibold shrink-0">
      {initials(member.name)}
    </span>
  );

  const signOutForm = (
    <form action={signOut}>
      <button
        type="submit"
        className="w-full h-10 px-3 text-start text-xs text-danger hover:bg-danger-soft rounded-sm transition-colors"
      >
        {t("auth.signOut")}
      </button>
    </form>
  );

  if (variant === "block") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{member.name}</div>
            <div className="text-2xs text-faint truncate">{roleLabel}</div>
          </div>
        </div>
        {signOutForm}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 h-10 ps-1 pe-3 rounded-full border border-line bg-surface hover:bg-sunken transition-colors",
          open && "bg-sunken",
        )}
      >
        {avatar}
        <span className="hidden md:block text-start leading-tight max-w-36">
          <span className="block text-2xs font-semibold truncate">{member.name}</span>
          <span className="block text-2xs text-faint truncate">{roleLabel}</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="anim-pop-end absolute z-40 top-12 end-0 w-60 bg-surface border border-line rounded-sm shadow-pop p-1.5"
        >
          <div className="px-3 py-2.5 mb-1 hairline-b">
            <div className="text-xs font-semibold truncate">{member.name}</div>
            <div className="text-2xs text-faint truncate" dir="ltr">
              {member.email}
            </div>
            <div className="text-2xs text-muted mt-1">{roleLabel}</div>
          </div>
          {signOutForm}
        </div>
      )}
    </div>
  );
}
