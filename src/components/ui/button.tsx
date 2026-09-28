import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Shared geometry across variants: fixed height (border-box), 1px border
 * (transparent on filled variants), identical pill radius + padding.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-brand text-white shadow-sm hover:bg-brand/90 active:bg-brand/80 disabled:bg-brand/50",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-white shadow-sm hover:bg-[#353535] active:bg-[#2a2a2a] disabled:opacity-50",
  ghost:
    "border border-[var(--border)] bg-transparent text-white shadow-sm hover:border-emerald-950/35 hover:bg-[var(--surface)] active:bg-emerald-50/80 disabled:opacity-50",
  danger:
    "border border-transparent bg-danger text-white shadow-sm hover:bg-danger/90 active:bg-danger/80 disabled:bg-danger/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-full px-4 text-sm font-semibold",
  md: "h-11 gap-2 rounded-full px-5 text-sm font-semibold",
  lg: "h-12 gap-2 rounded-full px-6 text-base font-semibold",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center box-border transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
    "disabled:pointer-events-none disabled:opacity-60",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading && (
        <LoaderCircle
          aria-hidden
          className={cn(
            "shrink-0 animate-spin",
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
        />
      )}
      {children}
    </button>
  );
}
