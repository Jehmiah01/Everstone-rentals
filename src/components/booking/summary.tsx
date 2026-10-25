import { fmtMoney, fmtTime12, prettyDay } from "@/lib/dates";
import type { CustomerBookingView } from "@/lib/types";

import { vehicleName } from "../site/fleet";

export function ReservationSummary({ b }: { b: CustomerBookingView }) {
  const rows: [string, string][] = [
    ["Agreement #", b.id],
    ["Car", vehicleName(b.vehicle)],
    ["Pickup", `${prettyDay(b.pickupDate)} at ${fmtTime12(b.pickupTime)}`],
    ["Return", `${prettyDay(b.returnDate)} at ${fmtTime12(b.returnTime)}`],
    ["Rental", `${b.days} day${b.days === 1 ? "" : "s"}: ${b.breakdown}`],
  ];
  const otherDrivers = b.drivers.length > 0 ? b.drivers.map((d) => d.fullName).join(", ") : b.additionalDrivers;
  if (otherDrivers) rows.push(["Other drivers", otherDrivers]);
  if (b.depositCents > 0) rows.push(["Security deposit", fmtMoney(b.depositCents)]);
  rows.push(["Total", fmtMoney(b.totalCents + b.depositCents)]);
  return (
    <dl className="grid gap-x-6 gap-y-2 border border-line bg-surface p-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm text-subtle">{k}</dt>
          <dd className={k === "Total" || k === "Agreement #" ? "font-mono font-medium" : ""}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReservationError() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">We couldn't open this reservation.</h1>
      <p className="mt-3 leading-relaxed text-subtle">
        Use the link from your confirmation email; it includes a private code that opens your reservation. If the problem continues, reply to that email.
      </p>
      <a href="/" className="mt-6 inline-flex h-11 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep">
        Back to Providence Rentals
      </a>
    </div>
  );
}
