"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark" | "soft";
type Size = "xs" | "sm" | "md" | "lg";

/** cn() is plain clsx (no class merging), so an unconditional display utility passed in (e.g. "hidden sm:inline-flex") would fight the base inline-flex. */
const hasOwnDisplay = (className?: string) => !!className && /(^|\s)(hidden|block|flex|inline|inline-block|inline-flex|grid)(\s|$)/.test(className);

export const buttonStyles = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    !hasOwnDisplay(className) && "inline-flex",
    "relative items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background,transform,box-shadow,color,border-color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 rounded-xl",
    size === "xs" && "h-7 px-2.5 text-xs rounded-lg",
    size === "sm" && "h-9 px-3.5 text-sm",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-13 px-7 text-base rounded-2xl",
    variant === "primary" && "bg-accent text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent)] hover:brightness-105 hover:-translate-y-px",
    variant === "dark" && "bg-fg text-bg hover:opacity-90",
    variant === "secondary" && "bg-surface-2 text-fg hover:bg-line",
    variant === "soft" && "bg-accent-soft text-fg hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)]",
    variant === "outline" && "border border-line-strong text-fg hover:bg-surface-2",
    variant === "ghost" && "text-muted hover:text-fg hover:bg-surface-2",
    variant === "danger" && "bg-danger-soft text-danger hover:bg-danger hover:text-white",
    className,
  );

interface BaseProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: string;
  iconRight?: string;
}

export const Button = forwardRef<HTMLButtonElement, BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
  { variant, size, loading, icon, iconRight, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonStyles(variant, size, className)} {...rest}>
      {loading ? <Icon name="loader" className="animate-spin" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={16} /> : null}
    </button>
  );
});

export function ButtonLink({ variant, size, icon, iconRight, className, children, href, ...rest }: BaseProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const external = /^https?:\/\//.test(href);
  const cls = buttonStyles(variant, size, className);
  const content = (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={16} /> : null}
    </>
  );
  return external ? (
    <a href={href} className={cls} {...rest}>
      {content}
    </a>
  ) : (
    <Link href={href} className={cls} {...rest}>
      {content}
    </Link>
  );
}
