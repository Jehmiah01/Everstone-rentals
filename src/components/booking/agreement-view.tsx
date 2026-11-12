import type { AgreementBlock, AgreementDoc } from "@/lib/agreements";

import { inputClass } from "./form";

function Block({ block, initials, onInitials }: { block: AgreementBlock; initials: string; onInitials: (v: string) => void }) {
  if (block.kind === "fields") {
    return (
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        {block.fields.map((f) => (
          <div key={f.label} className="contents">
            <dt className="text-sm text-subtle">{f.label}</dt>
            <dd className="text-sm">{f.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (block.kind === "paragraphs") {
    return (
      <div className="mt-2 space-y-2">
        {block.text.map((t) => <p key={t} className="text-sm leading-relaxed">{t}</p>)}
      </div>
    );
  }
  if (block.kind === "bullets") {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {block.items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    );
  }
  return (
    <div className="mt-4 max-w-xs bg-cobalt-tint p-4">
      <label htmlFor={`doc-initials-${block.id}`} className="block text-sm font-medium">{block.label}</label>
      <input
        id={`doc-initials-${block.id}`}
        value={initials}
        maxLength={4}
        autoComplete="off"
        onChange={(e) => onInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
        className={`${inputClass} mt-2 font-mono uppercase`}
        placeholder="e.g. JJ"
      />
    </div>
  );
}

// Each agreement starts folded into one tidy row. Renters tap it to read
// the full text before signing; it stays on the page, nothing is hidden.
export function AgreementView({ doc, initials, onInitials }: { doc: AgreementDoc; initials: string; onInitials: (v: string) => void }) {
  return (
    <details className="group border border-line bg-surface">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold tracking-tight">{doc.title}</span>
          <span className="block text-sm text-subtle">
            {doc.sections.length} sections · <span className="whitespace-nowrap">Agreement # {doc.number}</span>
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-cobalt underline underline-offset-4">
          <span className="group-open:hidden">Read</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <article aria-label={doc.title} className="border-t border-line">
        <p className="px-5 pt-4 font-mono text-xs uppercase tracking-[0.14em] text-subtle md:px-6">{doc.subtitle}</p>
        <div className="divide-y divide-line">
          {doc.sections.map((s) => (
            <section key={`${doc.kind}-${s.number}`} className="px-5 py-4 md:px-6">
              <h3 className="text-sm font-semibold">{s.number}. {s.heading}</h3>
              {s.blocks.map((b, i) => <Block key={i} block={b} initials={initials} onInitials={onInitials} />)}
            </section>
          ))}
        </div>
        <footer className="border-t border-line bg-ground/60 px-5 py-4 text-sm leading-relaxed md:px-6">{doc.signingNote}</footer>
      </article>
    </details>
  );
}
