import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "../../styles/cn";
import { ToastContext, type ToastInput, type ToastVariant } from "./ToastContext";

interface ToastMessage extends ToastInput {
  id: string;
  variant: ToastVariant;
}

const variantClasses: Record<ToastVariant, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const variantIcons: Record<ToastVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const idPrefix = useId();
  const nextId = useRef(0);
  const timers = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ duration = 6000, message, title, variant = "success" }: ToastInput) => {
      const id = `${idPrefix}-${nextId.current++}`;
      setToasts((current) => [
        ...current.slice(-2),
        { duration, id, ...(message === undefined ? {} : { message }), title, variant },
      ]);
      if (duration > 0) {
        const timer = window.setTimeout(() => dismissToast(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismissToast, idPrefix],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ dismissToast, showToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed right-3 bottom-3 z-[100] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-3 sm:top-20 sm:right-6 sm:bottom-auto"
        role="region"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function ToastItem({ onDismiss, toast }: { onDismiss: (id: string) => void; toast: ToastMessage }) {
  const Icon = variantIcons[toast.variant];
  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border-strong bg-surface p-4 text-foreground shadow-lg"
      role={toast.variant === "danger" ? "alert" : "status"}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-5 shrink-0", variantClasses[toast.variant])}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message ? (
          <p className="mt-1 text-sm leading-5 text-muted">{toast.message}</p>
        ) : null}
      </div>
      <button
        aria-label={`Dismiss ${toast.title}`}
        className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
