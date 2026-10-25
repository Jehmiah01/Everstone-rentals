import { Link } from "@tanstack/react-router";

import { BookCta } from "./ctas";

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" fill="currentColor" />
      <path d="M10.5 8h11v9.6h-7.6V24h-3.4zM13.9 11.2v3.2h4.2v-3.2z" fillRule="evenodd" className="fill-surface" />
    </svg>
  );
}

const NAV = [
  { href: "/#fleet", label: "Cars" },
  { href: "/#availability", label: "Availability" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "Questions" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link to="/" className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight text-ink">
          <LogoMark className="size-7 text-cobalt" />
          <span>Providence Rentals</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-subtle md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
        <BookCta href="/#fleet" compact />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-sm text-subtle md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5 text-ink">
          <LogoMark className="size-6 text-cobalt" />
          <span className="font-semibold">Providence Rentals</span>
        </div>
        <p>Everstone Consulting Group LLC, Baltimore, Maryland. Renters 18 and up with a valid driver's license.</p>
        <p>&copy; {new Date().getFullYear()} Everstone Consulting Group LLC</p>
      </div>
    </footer>
  );
}
