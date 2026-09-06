"use client";

import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_ROLE, ROLE_COOKIE, type ViewRole } from "@/lib/roles";

interface RoleValue {
  role: ViewRole;
  setRole: (next: ViewRole) => void;
  pending: boolean;
}

const RoleContext = createContext<RoleValue>({
  role: DEFAULT_ROLE,
  setRole: () => {},
  pending: false,
});

/**
 * Holds the view role for the client tree. The value comes from the server on
 * every render, so the cookie is the single source of truth and a switch is a
 * cookie write plus a refresh — the same shape as the locale toggle.
 */
export function RoleProvider({ role, children }: { role: ViewRole; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const value = useMemo<RoleValue>(
    () => ({
      role,
      pending,
      setRole: (next) => {
        if (next === role) return;
        document.cookie = `${ROLE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      },
    }),
    [role, pending, router],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleValue {
  return useContext(RoleContext);
}
