import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDay, monthLabel, parseDay, prettyDay } from "@/lib/dates";
import type { PublicVehicle } from "@/lib/types";

import { vehicleName } from "./fleet";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// One color per car, like calendars in a calendar app.
const SWATCHES = [
  { bar: "bg-cobalt text-surface", dot: "bg-cobalt" },
  { bar: "bg-ok text-surface", dot: "bg-ok" },
  { bar: "bg-warn text-surface", dot: "bg-warn" },
  { bar: "bg-ink text-surface", dot: "bg-ink" },
];

type Props = { vehicles: PublicVehicle[]; unavailable: Record<string, string[]>; from: string; to: string };

export function AvailabilitySection({ vehicles, unavailable, from, to }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const booked = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of vehicles) map.set(v.id, new Set(unavailable[v.id] ?? []));
    return map;
  }, [vehicles, unavailable]);

  const swatchFor = (vehicleId: string) => SWATCHES[Math.max(0, vehicles.findIndex((v) => v.id === vehicleId)) % SWATCHES.length] ?? SWATCHES[0];
  const start = new Date(parseDay(from));
  const end = new Date(parseDay(to));
  const baseYear = start.getUTCFullYear();
  const baseMonth = start.getUTCMonth();
  const maxOffset = (end.getUTCFullYear() - baseYear) * 12 + (end.getUTCMonth() - baseMonth);
  const year = baseYear + Math.floor((baseMonth + offset) / 12);
  const month0 = (baseMonth + offset) % 12;
  const lead = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(formatDay(Date.UTC(year, month0, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const shown = filter === "all" ? vehicles : vehicles.filter((v) => v.id === filter);
  const isFree = (vehicleId: string, day: string) => !booked.get(vehicleId)?.has(day);
  const inRange = (day: string) => day >= from && day <= to;

  return (
    <section id="availability" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <h2 className="text-3xl font-semibold tracking-tighter md:text-5xl">Check availability</h2>
        <p className="mt-4 max-w-[60ch] leading-relaxed text-subtle">
          Colored bars are days a car is already booked. Tap a day to see which cars are free and reserve one from that date.
        </p>

        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by car">
          <FilterChip active={filter === "all"} onClick={() => { setFilter("all"); setSelected(null); }}>
            All cars
          </FilterChip>
          {vehicles.map((v) => (
            <FilterChip key={v.id} active={filter === v.id} onClick={() => { setFilter(v.id); setSelected(null); }}>
              <span aria-hidden="true" className={`size-2.5 ${swatchFor(v.id).dot}`} />
              {v.make} {v.model}
            </FilterChip>
          ))}
        </div>

        <div className="mt-6 border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-lg font-semibold tracking-tight" aria-live="polite">{monthLabel(year, month0)}</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - 1))}
                disabled={offset === 0}
                aria-label="Previous month"
                className="inline-flex size-11 items-center justify-center text-ink hover:bg-ground disabled:text-line"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
                disabled={offset >= maxOffset}
                aria-label="Next month"
                className="inline-flex size-11 items-center justify-center text-ink hover:bg-ground disabled:text-line"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-1 py-2 text-center font-mono text-xs uppercase tracking-wide text-subtle sm:px-2 sm:text-left">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} className="min-h-16 border-b border-r border-line bg-ground/50 sm:min-h-24" />;
              const usable = inRange(day);
              const bookedHere = shown.filter((v) => !isFree(v.id, day));
              const freeCount = shown.length - bookedHere.length;
              const label = `${prettyDay(day)}: ${shown.map((v) => `${vehicleName(v)} ${isFree(v.id, day) ? "available" : "booked"}`).join(", ")}`;
              const dayNum = Number.parseInt(day.slice(8), 10);
              const isSelected = selected === day;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!usable}
                  onClick={() => setSelected(day)}
                  aria-label={usable ? label : `${prettyDay(day)}: not bookable`}
                  aria-pressed={isSelected}
                  className={`flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-line p-1 text-left align-top sm:min-h-24 sm:p-2 ${
                    usable ? "hover:bg-ground" : "cursor-not-allowed bg-ground/50"
                  } ${isSelected ? "outline-2 -outline-offset-2 outline-cobalt" : ""}`}
                >
                  <span
                    className={`inline-flex size-6 items-center justify-center text-xs font-medium sm:text-sm ${
                      day === from ? "bg-cobalt text-surface" : usable ? "text-ink" : "text-subtle"
                    }`}
                  >
                    {dayNum}
                  </span>
                  {usable ? (
                    <>
                      <span className="hidden flex-col gap-0.5 sm:flex">
                        {bookedHere.map((v) => (
                          <span key={v.id} className={`truncate px-1.5 py-0.5 text-[11px] leading-tight ${swatchFor(v.id).bar}`}>
                            {v.model} booked
                          </span>
                        ))}
                      </span>
                      <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                        {bookedHere.map((v) => (
                          <span key={v.id} className={`size-2 ${swatchFor(v.id).dot}`} />
                        ))}
                      </span>
                      {freeCount > 0 && bookedHere.length === 0 && shown.length === 1 ? (
                        <span className="hidden text-[11px] text-ok sm:block">Free</span>
                      ) : null}
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle">
          {vehicles.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={`size-2.5 ${swatchFor(v.id).dot}`} />
              {vehicleName(v)} booked
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 bg-cobalt" /> Today is highlighted
          </span>
        </div>

        {selected ? (
          <div className="mt-6 border border-line bg-surface p-5" aria-live="polite">
            <h3 className="text-lg font-semibold tracking-tight">{prettyDay(selected)}</h3>
            <ul className="mt-3 divide-y divide-line">
              {shown.map((v) => {
                const free = isFree(v.id, selected);
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className={`size-2.5 ${swatchFor(v.id).dot}`} />
                      {vehicleName(v)}
                      <span className={free ? "text-ok" : "text-subtle"}>{free ? "available" : "booked"}</span>
                    </span>
                    {free ? (
                      <a
                        href={`/book/${v.slug}?start=${selected}`}
                        className="inline-flex min-h-11 items-center bg-cobalt px-4 text-sm font-medium text-surface hover:bg-cobalt-deep"
                      >
                        Reserve from this date
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium transition-colors ${
        active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}
