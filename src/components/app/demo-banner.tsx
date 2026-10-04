"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { DEMO_ROLES } from "@/lib/demo";
import { useMember } from "@/components/app/member-context";
import { cn } from "@/lib/cn";
import { switchDemoRole } from "@/app/actions/demo";

/**
 * Showcase copy only: says the data is fictional and lets the visitor browse
 * as each role, to see what that role can and cannot do.
 */
export function DemoBanner() {
  const t = useT();
  const router = useRouter();
  const member = useMember();
  const [pending, startTransition] = useTransition();

  function choose(role: string) {
    if (role === member.role) return;
    startTransition(async () => {
      await switchDemoRole(role);
      router.refresh();
    });
  }

  return (
    <div className="bg-accent/10 text-accent text-2xs hairline-b px-4 py-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <span className="font-medium">{t("demo.banner")}</span>
      <span className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-muted">{t("demo.browseAs")}</span>
        {DEMO_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            disabled={pending}
            onClick={() => choose(role)}
            aria-pressed={member.role === role}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-medium border transition-colors",
              member.role === role
                ? "bg-accent text-white border-accent"
                : "bg-surface text-accent border-line hover:border-accent",
              pending && "opacity-60",
            )}
          >
            {t(`role.${role}` as MessageKey)}
          </button>
        ))}
      </span>
    </div>
  );
}
