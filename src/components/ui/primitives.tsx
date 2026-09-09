import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "default" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm border font-medium " +
  "transition-[background-color,border-color,color,transform] duration-[var(--dur-swift)] select-none whitespace-nowrap " +
  "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border-accent shadow-card hover:bg-accent-strong hover:border-accent-strong",
  default: "bg-surface text-ink border-line shadow-card hover:bg-sunken",
  ghost: "bg-transparent text-muted border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-danger border-line hover:bg-danger-soft hover:border-danger",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-2xs",
  md: "h-10 px-4 text-xs",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/** Same skin as Button, for links. */
export function LinkButton({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <a
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

// No width here on purpose: controls default to 100% via a base-layer rule in
// globals.css, which a `w-36` utility at the call site can still override. A
// `w-full` baked in here would win against those utilities instead.
const CONTROL =
  "h-10 rounded-sm border border-line bg-surface px-3 text-xs text-ink " +
  "placeholder:text-faint transition-colors hover:border-line-strong " +
  "focus:border-accent disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

/** Numeric input: LTR digits and tabular figures even inside an RTL form. */
export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      dir="ltr"
      className={cn(CONTROL, "text-end [font-variant-numeric:tabular-nums]", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "cursor-pointer pe-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(CONTROL, "h-auto min-h-20 py-2 leading-relaxed", className)} {...props} />
  );
}

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-2xs font-semibold text-muted">
          {label}
          {required && <span className="text-danger ms-0.5">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="text-2xs text-faint leading-snug">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

/**
 * Status is read by colour before it is read by word, so every state in the
 * system maps to one of these six. `accent` means in progress, `success` means
 * finished and correct, `warn` means needs a look, `danger` means wrong.
 */
export type Tone = "neutral" | "accent" | "success" | "danger" | "warn" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink border-line",
  accent: "bg-accent-soft text-accent border-accent-line",
  success: "bg-success-soft text-success border-success-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  muted: "bg-transparent text-faint border-line",
};

/** A tone as a tinted square, for the icon on a KPI tile. */
export const TONE_TINT: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  muted: "bg-sunken text-faint",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-6 px-2.5 rounded-full border text-2xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A bare status marker: a 5px dot plus a label, for dense tables. */
export function Dot({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const color =
    tone === "accent"
      ? "bg-accent"
      : tone === "success"
        ? "bg-success"
        : tone === "danger"
          ? "bg-danger"
          : tone === "warn"
            ? "bg-warn"
            : "bg-faint";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full shrink-0", color)} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("border border-line bg-surface rounded-lg shadow-card min-w-0", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-12 hairline-b">
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
        {meta && <span className="text-2xs text-faint truncate">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

/**
 * A row of mutually exclusive options as pills — day / week / month above a
 * chart, or a status filter above a table. Use it instead of a Select when
 * there are three or four choices and the current one should stay visible.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-line bg-sunken"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 px-3.5 rounded-full text-2xs font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-card font-semibold"
                : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Numbers get their own component so the tabular/LTR treatment is never forgotten. */
export function Num({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** Native tooltip — used to explain a flagged figure, e.g. over credit limit. */
  title?: string;
}) {
  return (
    <span className={cn("num", className)} title={title}>
      {children}
    </span>
  );
}
