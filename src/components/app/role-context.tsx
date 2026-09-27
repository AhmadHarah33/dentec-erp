"use client";

import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_ROLE, ROLE_COOKIE, type ViewRole } from "@/lib/roles";
import { can as roleCan, canVisit, type Capability } from "@/lib/permissions";

/** What the client tree knows about the person using it. Plain data from the server. */
export interface ClientSession {
  role: ViewRole;
  demo: boolean;
  name: string;
  email: string;
  tourPending: boolean;
}

interface RoleValue extends ClientSession {
  /** Demo mode only: act as another role. With Supabase the role is the account's. */
  setRole: (next: ViewRole) => void;
  pending: boolean;
  can: (capability: Capability) => boolean;
  canVisit: (href: string) => boolean;
}

const RoleContext = createContext<RoleValue>({
  role: DEFAULT_ROLE,
  demo: true,
  name: "",
  email: "",
  tourPending: false,
  setRole: () => {},
  pending: false,
  can: () => true,
  canVisit: () => true,
});

/**
 * Holds the session for the client tree. The value comes from the server on
 * every render. In demo mode the role cookie is the source of truth and a
 * switch is a cookie write plus a refresh — the same shape as the locale
 * toggle; with Supabase the switch does nothing, the role is the account's.
 *
 * `can` / `canVisit` hide what a role cannot use. They are presentation only:
 * the server re-checks every action and page, and RLS sits under both.
 */
export function RoleProvider({ session, children }: { session: ClientSession; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const value = useMemo<RoleValue>(
    () => ({
      ...session,
      pending,
      can: (capability) => roleCan(session.role, capability),
      canVisit: (href) => canVisit(session.role, href),
      setRole: (next) => {
        if (!session.demo || next === session.role) return;
        document.cookie = `${ROLE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      },
    }),
    [session, pending, router],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleValue {
  return useContext(RoleContext);
}
