import { createContext, useContext } from "react";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  duration?: number;
  message?: string;
  title: string;
  variant?: ToastVariant;
}

export interface ToastContextValue {
  dismissToast: (id: string) => void;
  showToast: (input: ToastInput) => string;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
