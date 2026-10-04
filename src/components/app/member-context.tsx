"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/data/types";
import { can, type Area, type Level } from "@/lib/permissions";

export interface MemberInfo {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const MemberContext = createContext<MemberInfo | null>(null);

/**
 * The signed-in member, for client components. Filled by the (app) layout
 * from `requireMember()`. Hiding a button with `useCan` is courtesy — the
 * server action behind it checks again and refuses on its own.
 */
export function MemberProvider({ member, children }: { member: MemberInfo; children: ReactNode }) {
  return <MemberContext.Provider value={member}>{children}</MemberContext.Provider>;
}

export function useMember(): MemberInfo {
  const member = useContext(MemberContext);
  if (!member) throw new Error("useMember() outside MemberProvider");
  return member;
}

/** `const canEdit = useCan("invoices", "edit");` */
export function useCan(area: Area, level: Level): boolean {
  const member = useContext(MemberContext);
  return member ? can(member.role, area, level) : false;
}
