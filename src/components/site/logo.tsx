import Link from "next/link";
import { cn } from "@/lib/cn";

/** Wordmark. Uses the uploaded logo if the admin set one; otherwise a monogram + name. */
export function Logo({ name, logoUrl, className, href = "/" }: { name: string; logoUrl?: string | null; className?: string; href?: string }) {
  return (
    <Link href={href} aria-label={`${name} — home`} className={cn("flex shrink-0 items-center gap-2.5 font-display font-extrabold tracking-tight", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-auto" />
      ) : (
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-fg text-[15px] font-black text-bg">
          {name.trim().charAt(0).toUpperCase() || "F"}
          <span className="-ml-0.5 mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      )}
      <span className="text-[17px] leading-none">{name}</span>
    </Link>
  );
}
