import type { ReactNode } from "react";

export const inputClass =
  "h-12 w-full border border-line bg-surface px-3 text-base text-ink placeholder:text-subtle focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/20 aria-[invalid=true]:border-danger";

export function Field({ id, label, hint, error, children, className = "" }: {
  id: string; label: string; hint?: string; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {hint ? <p id={`${id}-hint`} className="mt-1 text-sm text-subtle">{hint}</p> : null}
      <div className="mt-2">{children}</div>
      {error ? <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** Form CTA: full-width ink block with a cobalt top rule. */
export function ContinueButton({ children, disabled = false, busy = false, type = "submit", onClick }: {
  children: ReactNode; disabled?: boolean; busy?: boolean; type?: "submit" | "button"; onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-3 border-t-2 border-cobalt bg-ink px-6 text-base font-medium text-surface transition-colors hover:bg-cobalt-deep active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-subtle"
    >
      {busy ? "Working..." : children}
    </button>
  );
}

export function Checkbox({ id, checked, onChange, children }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3 py-2 leading-relaxed">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-cobalt" />
      <span>{children}</span>
    </label>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}
