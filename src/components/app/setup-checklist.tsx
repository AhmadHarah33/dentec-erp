import Link from "next/link";
import type { Database } from "@/lib/data/types";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Num } from "@/components/ui/primitives";
import { IconCheck, IconChevronEnd } from "@/components/ui/icons";

interface Step {
  key: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

/** The steps that turn an empty install into a working one, judged from the data itself. */
export function setupSteps(db: Database, t: Translator): Step[] {
  const s = db.settings;
  return [
    {
      key: "company",
      title: t("setup.company"),
      hint: t("setup.companyHint"),
      href: "/settings",
      // The migration names the company; any detail beyond that means
      // someone has been through the settings page.
      done: Boolean(s.taxNumber?.trim() || s.address?.trim() || s.phone?.trim()),
    },
    {
      key: "items",
      title: t("setup.items"),
      hint: t("setup.itemsHint"),
      href: "/products",
      done: db.items.length > 0,
    },
    {
      key: "stock",
      title: t("setup.stock"),
      hint: t("setup.stockHint"),
      href: "/inventory",
      done: db.stockMoves.length > 0,
    },
    {
      key: "parties",
      title: t("setup.parties"),
      hint: t("setup.partiesHint"),
      href: "/customers",
      done: db.customers.length > 0 || db.suppliers.length > 0,
    },
  ];
}

/**
 * Shown on the dashboard until every step is done, then never again. A new
 * install has no sample data, so without this the first screen is a wall of
 * zeros and a "new invoice" button that leads to an empty customer list.
 */
export function SetupChecklist({ db, t }: { db: Database; t: Translator }) {
  const steps = setupSteps(db, t);
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  const next = steps.find((x) => !x.done)!;

  return (
    <section className="border border-line bg-surface rounded-lg shadow-card mb-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 hairline-b">
        <div>
          <h2 className="text-sm font-semibold">{t("setup.title")}</h2>
          <p className="text-2xs text-muted">{t("setup.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Num className="text-2xs font-semibold text-muted">
            {done}/{steps.length}
          </Num>
          <div className="w-28 h-1.5 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent rounded-full" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((step, i) => {
          const current = step.key === next.key;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-3.5 px-4 sm:px-5 min-h-14 py-2.5 transition-colors duration-[var(--dur-swift)] hover:bg-sunken",
                  current && "bg-accent-soft/50",
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center size-7 rounded-full shrink-0 text-2xs font-semibold",
                    step.done
                      ? "bg-success-soft text-success"
                      : current
                        ? "bg-accent text-white"
                        : "border border-line-strong text-muted",
                  )}
                >
                  {step.done ? <IconCheck size={13} /> : <Num>{i + 1}</Num>}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-xs font-medium",
                      step.done && "text-muted line-through decoration-line-strong",
                    )}
                  >
                    {step.title}
                  </span>
                  {!step.done && <span className="block text-2xs text-faint">{step.hint}</span>}
                </span>
                {!step.done && (
                  <IconChevronEnd size={14} className="text-faint shrink-0 rtl:rotate-180" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
