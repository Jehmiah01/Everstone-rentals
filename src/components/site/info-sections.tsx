import { CalendarDays, IdCard, KeyRound, PenLine } from "lucide-react";

import type { PublicVehicle } from "@/lib/types";

import { BookCta } from "./ctas";

const STEPS = [
  { icon: CalendarDays, title: "Pick your car and dates", body: "Check the calendar, choose a car, and pick your pickup and return days." },
  { icon: IdCard, title: "Enter your details once", body: "Name, address, phone and driver's license. They fill in both rental agreements for you." },
  { icon: PenLine, title: "Sign and pay", body: "Read both agreements on one page, sign with your finger or mouse, then pay securely with Square." },
  { icon: KeyRound, title: "Verify and pick up", body: "Upload a photo of your license and a selfie holding it. Once approved, we send the pickup address." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">How it works</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tighter md:text-5xl">Book it in one sitting.</h2>
        <ol className="mt-12 grid gap-0 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-l border-line py-2 pl-6 pr-4 md:pb-0">
              <span className="font-mono text-sm text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <s.icon className="mt-4 size-6 text-cobalt" aria-hidden="true" strokeWidth={1.75} />
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 pb-8 leading-relaxed text-subtle">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const RULES = [
  "At least 18 years old on the pickup date.",
  "A valid, physical driver's license that stays valid through your return date.",
  "Not accepted on their own: learner's permits, digital or photocopied licenses, or international driving permits.",
  "A one-time identity and license check at your first booking: a photo of your license and a selfie holding it.",
  "Driving stays in Maryland, within 100 miles of Baltimore County, unless we agree otherwise in writing.",
];

export function Requirements() {
  return (
    <section id="requirements" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:py-24">
        <div>
          <p aria-hidden="true" className="font-mono text-9xl font-medium leading-none tracking-tighter text-cobalt">18</p>
          <h2 className="mt-6 text-3xl font-semibold tracking-tighter md:text-4xl">Who can rent</h2>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {RULES.map((r) => (
            <li key={r} className="py-4 leading-relaxed">{r}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Pickup() {
  return (
    <section id="pickup" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto grid max-w-6xl md:grid-cols-2">
        <div className="flex min-h-64 flex-col justify-end bg-ink p-8 text-surface md:p-12">
          <p className="text-4xl font-semibold tracking-tighter md:text-6xl">Gwynn Oak</p>
          <p className="mt-2 text-surface/70">Baltimore County, Maryland</p>
        </div>
        <div className="flex flex-col justify-center gap-5 p-8 md:p-12">
          <h2 className="text-3xl font-semibold tracking-tighter">Keys at Gwynn Oak.</h2>
          <p className="max-w-[48ch] leading-relaxed text-subtle">
            Pickup and return are at one spot in Gwynn Oak. The exact address comes with your approval email and on your reservation page.
          </p>
          <div>
            <BookCta href="/#fleet" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq({ vehicles }: { vehicles: PublicVehicle[] }) {
  const noDeposit = vehicles.every((v) => v.depositCents === 0);
  const items = [
    { q: "How old do I need to be?", a: "At least 18 on the day you pick up the car." },
    { q: "Which licenses do you accept?", a: "A valid, physical driver's license. A learner's permit, a digital or photocopied license, or an international driving permit on its own is not accepted." },
    { q: "How do I pay?", a: "By debit or credit card through Square, after you sign the agreements. Your card is not kept on file." },
    { q: "Is there a security deposit?", a: noDeposit ? "No security deposit is required right now." : "Some cars have a security deposit. It is shown on the booking page before you pay." },
    { q: "Where do I pick up the car?", a: "In Gwynn Oak, Baltimore County. The exact address is sent once your reservation is approved." },
    { q: "Do I have to do the ID check every time?", a: "No. It is a one-time check. Book again with the same email and license number and you skip it." },
    { q: "Can I drive out of state?", a: "No. The car stays in Maryland, within 100 miles of Baltimore County, unless we agree otherwise in writing." },
    { q: "Is insurance included?", a: "We do not charge an insurance fee. Any insurance or protection that applies comes from a third-party provider under its own terms, as the rental agreement explains." },
    { q: "Can I extend my rental?", a: "Yes, if the car is free. Ask before your scheduled return time; extensions need approval in advance." },
    { q: "Can I smoke in the car?", a: "No. Smoking and vaping are not allowed in any of our cars." },
  ];
  return (
    <section id="faq" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <h2 className="text-center text-3xl font-semibold tracking-tighter md:text-5xl">Questions</h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {items.map((it) => (
            <details key={it.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {it.q}
                <span aria-hidden="true" className="font-mono text-xl text-cobalt transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="pb-5 leading-relaxed text-subtle">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
