import { BookCta, InlineArrowLink } from "./ctas";

export function HomeHero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-20 md:pt-24 md:pb-28">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">Baltimore, Maryland</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-tighter md:text-6xl">
          Rent a car in Baltimore, no runaround.
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-subtle">
          Three reliable cars, one pickup spot in Gwynn Oak, and a booking you finish on your phone in minutes.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <BookCta href="/#fleet" />
          <InlineArrowLink href="/#availability">Check availability</InlineArrowLink>
        </div>
      </div>
    </section>
  );
}
