"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { Button } from "./primitives";
import { IconClose } from "./icons";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Stop the page behind the dialog from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8 no-print">
      <div
        className="anim-fade fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "anim-rise relative w-full bg-surface border border-line rounded-lg shadow-modal my-auto",
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 h-14 hairline-b">
          <div className="min-w-0 self-center">
            <h2 className="text-sm font-semibold truncate">{title}</h2>
            {description && (
              <p className="text-2xs text-muted mt-0.5 truncate">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className="self-center text-faint hover:text-ink transition-colors p-1 -me-1"
          >
            <IconClose />
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 h-14 hairline-t bg-sunken/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  tone = "danger",
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("action.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel ?? t("action.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted leading-relaxed">{message}</p>
    </Modal>
  );
}
