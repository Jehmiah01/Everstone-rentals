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

export function AgreementView({ doc, initials, onInitials }: { doc: AgreementDoc; initials: string; onInitials: (v: string) => void }) {
  return (
    <article className="border border-line bg-surface" aria-label={doc.title}>
      <header className="border-b border-line p-5 md:px-8 md:py-6">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">{doc.subtitle}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="mt-1 font-mono text-sm text-subtle">Agreement # {doc.number}</p>
      </header>
      <div className="divide-y divide-line">
        {doc.sections.map((s) => (
          <section key={`${doc.kind}-${s.number}`} className="px-5 py-4 md:px-8">
            <h3 className="font-semibold">{s.number}. {s.heading}</h3>
            {s.blocks.map((b, i) => <Block key={i} block={b} initials={initials} onInitials={onInitials} />)}
          </section>
        ))}
      </div>
      <footer className="border-t border-line bg-ground/60 px-5 py-4 text-sm leading-relaxed md:px-8">{doc.signingNote}</footer>
    </article>
  );
}
