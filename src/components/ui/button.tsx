import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-orange-600 text-white shadow-sm hover:bg-orange-500 active:bg-orange-700 disabled:bg-orange-600/50",
  secondary:
    "bg-emerald-950 text-emerald-50 shadow-sm hover:bg-emerald-900 active:bg-emerald-950 disabled:bg-emerald-950/50",
  ghost:
    "border-[1.5px] border-emerald-950/20 bg-[color-mix(in_srgb,var(--surface)_85%,var(--kraft))] text-emerald-950 shadow-sm hover:border-emerald-950/35 hover:bg-[var(--surface)] active:bg-emerald-50/80 disabled:bg-[color-mix(in_srgb,var(--kraft)_50%,var(--surface))]",
  danger:
    "bg-red-700 text-white shadow-sm hover:bg-red-600 active:bg-red-800 disabled:bg-red-700/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 rounded-lg px-3 text-sm font-semibold",
  md: "min-h-11 gap-2 rounded-xl px-5 text-sm font-semibold",
  lg: "min-h-12 gap-2 rounded-xl px-6 text-base font-semibold",
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
    "inline-flex items-center justify-center transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
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
