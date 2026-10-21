import type { ReactNode } from "react";

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Primary CTA: cobalt block, arrow slides on hover. */
export function BookCta({ href, label = "Book a car", compact = false }: { href: string; label?: string; compact?: boolean }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-3 bg-cobalt font-medium text-surface transition-colors hover:bg-cobalt-deep active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt ${compact ? "h-10 px-4 text-sm" : "h-12 px-6 text-base"}`}
    >
      {label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
    </a>
  );
}

/** Secondary CTA: underlined inline link with a trailing arrow. */
export function InlineArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="group inline-flex min-h-11 items-center gap-2 font-medium text-ink underline decoration-line decoration-2 underline-offset-[6px] hover:decoration-cobalt">
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </a>
  );
}
