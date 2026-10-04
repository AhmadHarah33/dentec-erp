"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { IconAlert, IconCheck, IconClose } from "./icons";

type ToastTone = "success" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type ToastFn = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastFn>(() => {});

/**
 * Confirmation that something happened, when the screen alone does not say
 * so — a record saved inside a dialog that has already closed, a row that
 * quietly disappeared after a delete.
 *
 * Errors that block a task stay inline beside the form that caused them;
 * a toast is for the outcome of an action, not for the reason it failed.
 *
 * The region is portalled to <body> and polite, so a screen reader hears
 * "تم الحفظ" without losing its place.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback<ToastFn>(
    (message, tone = "success") => {
      const id = ++seq.current;
      // Keep at most three; a fourth means the oldest is no longer news.
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "danger" ? 6000 : 3200);
    },
    [dismiss],
  );

  const region = (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] bottom-4 inset-x-4 sm:inset-x-auto sm:end-6 sm:bottom-6 flex flex-col items-stretch sm:items-end gap-2 pointer-events-none no-print"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "anim-rise pointer-events-auto flex items-center gap-3 min-h-11 ps-3.5 pe-1.5 py-1.5 rounded-sm shadow-pop sm:min-w-64 sm:max-w-sm",
            "bg-ink text-white text-xs",
          )}
        >
          <span
            className={cn(
              "grid place-items-center size-5 rounded-full shrink-0",
              item.tone === "success" ? "bg-success" : "bg-danger",
            )}
          >
            {item.tone === "success" ? <IconCheck size={12} /> : <IconAlert size={12} />}
          </span>
          <span className="flex-1 min-w-0">{item.message}</span>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="grid place-items-center size-8 rounded-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label={t("action.close")}
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {mounted && createPortal(region, document.body)}
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast(t("msg.saved"));` */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}
