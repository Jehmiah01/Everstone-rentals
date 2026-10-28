import { useState } from "react";

import { firstFreeDay, fmtMoney, shortDay } from "@/lib/dates";
import type { PublicVehicle } from "@/lib/types";

export function vehicleName(v: PublicVehicle) {
  return `${v.year} ${v.make} ${v.model}`;
}

export function RateSchedule({ vehicle }: { vehicle: PublicVehicle }) {
  if (!vehicle.rateTable) return null;
  return (
    <dl className="grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-1 font-mono text-sm">
      {vehicle.rateTable.map((c, i) => (
        <div key={i} className="contents">
          <dt className="text-subtle">{i + 1} day{i ? "s" : ""}</dt>
          <dd className="text-right">{fmtMoney(c)}</dd>
          <dd className="text-right text-subtle">{fmtMoney(Math.round(c / (i + 1)))}/day</dd>
        </div>
      ))}
    </dl>
  );
}

export function CarPhoto({ vehicle, className = "" }: { vehicle: PublicVehicle; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!vehicle.photoUrl || failed) {
    return (
      <div className={`flex items-end bg-cobalt-tint p-5 ${className}`}>
        <span className="font-mono text-5xl font-medium tracking-tight text-cobalt" aria-hidden="true">
          {vehicle.model}
        </span>
        <span className="sr-only">Photo of the {vehicleName(vehicle)} coming soon</span>
      </div>
    );
  }
  return (
    <img
      src={vehicle.photoUrl}
      alt={vehicleName(vehicle)}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

function ReserveLink({ slug, start }: { slug: string; start?: string | null }) {
  return (
    <a
      href={start ? `/book/${slug}?start=${start}` : `/book/${slug}`}
      className="group relative inline-flex min-h-11 items-center font-medium text-ink"
    >
      Reserve
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-0 h-0.5 w-6 bg-cobalt transition-all duration-300 group-hover:w-full motion-reduce:transition-none"
      />
    </a>
  );
}

function FleetCard({ v, wide, unavailable, today, to }: { v: PublicVehicle; wide: boolean; unavailable: string[]; today: string; to: string }) {
  const specs = [v.color, v.seats ? `${v.seats} seats` : null, v.transmission, v.fuel].filter(Boolean).join(", ");
  // "Out" means booked or blocked today; the label then says when it's next free.
  const out = unavailable.includes(today);
  const back = out ? firstFreeDay(unavailable, today, to) : null;
  return (
    <article className={`flex flex-col border border-line bg-surface ${wide ? "md:col-span-2 md:row-span-2" : ""}`}>
      <CarPhoto vehicle={v} className={`w-full ${wide ? "aspect-[16/10]" : "aspect-[16/9]"}`} />
      <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className={`font-semibold tracking-tight ${wide ? "text-2xl md:text-3xl" : "text-xl"}`}>{vehicleName(v)}</h3>
          <p className="font-mono text-sm text-ink">
            {fmtMoney(v.dailyRateCents)}/day <span className="text-subtle">or {fmtMoney(v.weeklyRateCents)}/week</span>
          </p>
        </div>
        {out ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="bg-warn-tint px-2 py-0.5 font-medium text-warn">Out right now</span>
            <span className="text-subtle">{back ? `Available from ${shortDay(back)}` : "Not taking bookings right now"}</span>
          </p>
        ) : null}
        {specs ? <p className="text-sm text-subtle">{specs}</p> : null}
        {v.description ? <p className="max-w-[60ch] leading-relaxed text-subtle">{v.description}</p> : null}
        <div className="mt-auto pt-2">
          <ReserveLink slug={v.slug} start={back} />
        </div>
      </div>
    </article>
  );
}

export function FleetSection({ vehicles, unavailable, today, to }: {
  vehicles: PublicVehicle[]; unavailable: Record<string, string[]>; today: string; to: string;
}) {
  return (
    <section id="fleet" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">The cars</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tighter md:text-5xl">
          {vehicles.length === 3 ? "Three cars. One address." : "Pick your car."}
        </h2>
        <p className="mt-4 max-w-[60ch] leading-relaxed text-subtle">
          Weekly rentals come out cheapest. Every car is cleaned and checked before pickup.
        </p>
        {vehicles.length === 0 ? (
          <p className="mt-10 border border-line bg-surface p-6 text-subtle">No cars are listed right now. Check back soon.</p>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {vehicles.map((v, i) => (
              <FleetCard key={v.id} v={v} wide={i === 0 && vehicles.length > 1} unavailable={unavailable[v.id] ?? []} today={today} to={to} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
