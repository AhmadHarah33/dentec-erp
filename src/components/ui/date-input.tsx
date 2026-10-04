"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { useLocale } from "@/lib/i18n/context";
import { IconCalendar, IconClose } from "./icons";

/**
 * A date field that reads in the app's own format.
 *
 * A bare `<input type="date">` paints its value in the operating system's
 * locale, so on an English Windows machine an Arabic form shows
 * `mm/dd/yyyy` — the wrong order for every reader of this app. Browsers
 * offer no way to restyle that text, so the native input sits invisibly on
 * top (it still owns focus, keyboard entry and the platform calendar,
 * which is what a phone user expects) and a display layer underneath shows
 * the value through `formatDate`, exactly as the tables print it.
 *
 * The value is an ISO `YYYY-MM-DD` string in and out, and `onChange`
 * receives that string rather than an event.
 */
export function DateInput({
  value,
  onChange,
  placeholder,
  clearable,
  required,
  disabled,
  min,
  max,
  className,
  "aria-label": ariaLabel,
  id,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Shows a clear button while a value is set. Use for filters, not for required fields. */
  clearable?: boolean;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const { locale, t } = useLocale();
  const ref = useRef<HTMLInputElement>(null);
  const text = value ? formatDate(value, locale) : "";
  const showClear = clearable && !!value && !disabled;

  function openPicker() {
    try {
      ref.current?.showPicker?.();
    } catch {
      // showPicker throws outside a user gesture in some browsers; the
      // focused native input still accepts typed digits.
    }
  }

  return (
    <div className={cn("relative h-10 min-w-36", className)}>
      <input
        ref={ref}
        id={id}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        aria-label={ariaLabel ?? placeholder}
        className="peer absolute inset-0 size-full opacity-0 cursor-pointer disabled:cursor-default"
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none h-full flex items-center gap-2 rounded-sm border border-line bg-surface ps-3 text-xs",
          showClear ? "pe-9" : "pe-3",
          "transition-colors peer-hover:border-line-strong",
          "peer-focus-visible:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-1",
          "peer-disabled:bg-sunken peer-disabled:text-muted",
        )}
      >
        <IconCalendar size={15} className="text-faint shrink-0" />
        {text ? (
          <span className="num text-ink">{text}</span>
        ) : (
          <span className="text-faint truncate">{placeholder ?? t("label.date")}</span>
        )}
      </div>
      {showClear && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("action.clear")}
          className="absolute top-1/2 -translate-y-1/2 end-1.5 grid place-items-center size-7 rounded-xs text-faint hover:text-ink hover:bg-sunken transition-colors"
        >
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}
