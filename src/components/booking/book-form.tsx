import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { LICENSE_ATTESTATION } from "@/lib/agreements";
import { createBooking } from "@/lib/api/booking.functions";
import { addDays, ageOn, diffDays, eachDay, extraDriverCharge, fmtMoney, fmtTime12, isValidDay, parseDay, prettyDay, priceVehicle } from "@/lib/dates";
import type { PublicVehicle } from "@/lib/types";

import { CarPhoto, vehicleName } from "../site/fleet";
import { Checkbox, ContinueButton, Field, SectionTitle, inputClass } from "./form";

const TIMES = Array.from({ length: 23 }, (_, i) => {
  const mins = 8 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu, Oct 22" for the trip summary. */
function tripDay(day: string): string {
  const d = new Date(parseDay(day));
  return `${WEEKDAYS[d.getUTCDay()] ?? ""}, ${MONTHS_SHORT[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
}

const NEXT_STEPS = [
  "Fill in your details below.",
  "Read and sign your rental paperwork, all on one page.",
  "Pay securely by card with Square.",
  "Upload a photo of your license and a selfie (first booking only). Any other drivers do the same.",
];

type FormState = {
  pickupDate: string; returnDate: string; pickupTime: string; returnTime: string;
  fullName: string; email: string; phone: string; address: string; city: string; state: string; zip: string;
  dob: string; dlNumber: string; dlState: string; dlExpiration: string; attest: boolean;
};

const MAX_DRIVERS = 3;
type DriverDraft = { key: number; fullName: string; phone: string; dob: string; dlNumber: string; dlState: string; dlExpiration: string };
type DriverField = Exclude<keyof DriverDraft, "key">;
const normLicense = (s: string) => s.trim().toLowerCase().replace(/[\s-]/g, "");

export function BookForm({ vehicle, unavailable, from, to, start }: {
  vehicle: PublicVehicle; unavailable: string[]; from: string; to: string; start?: string;
}) {
  const navigate = useNavigate();
  const blocked = useMemo(() => new Set(unavailable), [unavailable]);
  const firstPickup = start && start >= from && start <= to ? start : from;
  const [f, setF] = useState<FormState>({
    pickupDate: firstPickup, returnDate: addDays(firstPickup, 7), pickupTime: "10:00", returnTime: "10:00",
    fullName: "", email: "", phone: "", address: "", city: "", state: "MD", zip: "",
    dob: "", dlNumber: "", dlState: "MD", dlExpiration: "", attest: false,
  });
  const [drivers, setDrivers] = useState<DriverDraft[]>([]);
  const nextDriverKey = useRef(1);
  const addDriver = () =>
    setDrivers((p) => [...p, { key: nextDriverKey.current++, fullName: "", phone: "", dob: "", dlNumber: "", dlState: "MD", dlExpiration: "" }]);
  const removeDriver = (key: number) => setDrivers((p) => p.filter((d) => d.key !== key));
  const setDriver = (key: number, field: DriverField, value: string) =>
    setDrivers((p) => p.map((d) => (d.key === key ? { ...d, [field]: value } : d)));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const datesValid = isValidDay(f.pickupDate) && isValidDay(f.returnDate) && f.returnDate >= f.pickupDate;
  const days = datesValid ? Math.max(1, diffDays(f.pickupDate, f.returnDate)) : 0;
  const conflict = datesValid ? (eachDay(f.pickupDate, f.returnDate).find((d) => blocked.has(d)) ?? null) : null;
  const price = days > 0 ? priceVehicle(days, vehicle) : null;
  const table = vehicle.rateTable;
  const oneDayCents = table ? (table[0] ?? vehicle.dailyRateCents) : vehicle.dailyRateCents;
  const weekCents = table ? (table[6] ?? vehicle.weeklyRateCents) : vehicle.weeklyRateCents;
  const savings = price ? days * oneDayCents - price.total_cents : 0;
  const driverFee = extraDriverCharge(drivers.length, days, vehicle.driverFeeCents, vehicle.driverFeeCapCents);
  const grandTotal = price ? price.total_cents + driverFee.cents + vehicle.depositCents : 0;

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!isValidDay(f.pickupDate) || f.pickupDate < from) errors.pickupDate = "Pick a date from today on";
  if (!isValidDay(f.returnDate) || f.returnDate < f.pickupDate) errors.returnDate = "Return must be on or after the pickup date";
  else if (days > 60) errors.returnDate = "Bookings are limited to 60 days";
  else if (f.returnDate > to) errors.returnDate = `Book through ${prettyDay(to)} at the latest`;
  if (conflict) errors.returnDate = `This car is booked on ${prettyDay(conflict)}. Choose other dates.`;
  if (f.fullName.trim().length < 2) errors.fullName = "Enter your full legal name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = "Enter a valid email";
  if (f.phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a 10-digit phone number";
  if (f.address.trim().length < 3) errors.address = "Enter your street address";
  if (!f.city.trim()) errors.city = "Enter your city";
  if (f.state.trim().length < 2) errors.state = "Enter your state";
  if (f.zip.trim().length < 5) errors.zip = "Enter your ZIP code";
  if (!isValidDay(f.dob)) errors.dob = "Enter your date of birth";
  else if (isValidDay(f.pickupDate) && ageOn(f.dob, f.pickupDate) < 18) errors.dob = "You must be at least 18 on the pickup date";
  if (f.dlNumber.trim().length < 3) errors.dlNumber = "Enter your driver's license number";
  if (f.dlState.trim().length < 2) errors.dlState = "Enter the issuing state or country";
  if (!isValidDay(f.dlExpiration)) errors.dlExpiration = "Enter the expiration date";
  else if (datesValid && f.dlExpiration <= f.returnDate) errors.dlExpiration = "Your license must stay valid past your return date";
  if (!f.attest) errors.attest = "Please confirm the license requirements";
  const driverErrors = drivers.map((d, i) => {
    const e: Partial<Record<DriverField, string>> = {};
    if (d.fullName.trim().length < 2) e.fullName = "Enter their full legal name";
    if (d.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit phone number";
    if (!isValidDay(d.dob)) e.dob = "Enter their date of birth";
    else if (isValidDay(f.pickupDate) && ageOn(d.dob, f.pickupDate) < 18) e.dob = "Drivers must be at least 18 on the pickup date";
    if (d.dlNumber.trim().length < 3) e.dlNumber = "Enter their driver's license number";
    else if (f.dlNumber.trim() && normLicense(d.dlNumber) === normLicense(f.dlNumber)) e.dlNumber = "That's your license number. List only other people who will drive.";
    else if (drivers.some((o, j) => j < i && normLicense(o.dlNumber) === normLicense(d.dlNumber))) e.dlNumber = "This license is already listed above";
    if (d.dlState.trim().length < 2) e.dlState = "Enter the issuing state or country";
    if (!isValidDay(d.dlExpiration)) e.dlExpiration = "Enter the expiration date";
    else if (datesValid && d.dlExpiration <= f.returnDate) e.dlExpiration = "Their license must stay valid past your return date";
    return e;
  });
  const hasErrors = Object.keys(errors).length > 0 || driverErrors.some((e) => Object.keys(e).length > 0);
  const err = (k: keyof FormState) => (submitted || (k === "returnDate" && conflict) ? (errors[k] ?? null) : null);
  const a11y = (k: keyof FormState) => ({
    "aria-invalid": Boolean(err(k)),
    "aria-describedby": err(k) ? `${k}-error` : undefined,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (hasErrors) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const res = await createBooking({
        data: {
          vehicleId: vehicle.id, pickupDate: f.pickupDate, returnDate: f.returnDate, pickupTime: f.pickupTime, returnTime: f.returnTime,
          fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone.trim(), address: f.address.trim(), city: f.city.trim(),
          state: f.state.trim(), zip: f.zip.trim(), dob: f.dob, dlNumber: f.dlNumber.trim(), dlState: f.dlState.trim(),
          dlExpiration: f.dlExpiration,
          drivers: drivers.map((d) => ({
            fullName: d.fullName.trim(), phone: d.phone.trim(), dob: d.dob, dlNumber: d.dlNumber.trim(), dlState: d.dlState.trim(), dlExpiration: d.dlExpiration,
          })),
          attestLicense: true,
          origin: window.location.origin,
        },
      });
      await navigate({ to: "/booking/$id/sign", params: { id: res.id }, search: { token: res.token } });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const text = (k: keyof FormState, label: string, opts: { type?: string; autoComplete?: string; hint?: string; className?: string; inputMode?: "numeric" | "tel" | "email" | "text" } = {}) => (
    <Field id={k} label={label} hint={opts.hint} error={err(k)} className={opts.className}>
      <input
        id={k}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete}
        value={String(f[k])}
        onChange={(e) => set(k, e.target.value as never)}
        className={inputClass}
        {...a11y(k)}
      />
    </Field>
  );

  const driverText = (d: DriverDraft, i: number, k: DriverField, label: string, opts: { type?: string; hint?: string; inputMode?: "numeric" | "tel" | "text" } = {}) => {
    const id = `driver-${d.key}-${k}`;
    const error = submitted ? (driverErrors[i]?.[k] ?? null) : null;
    return (
      <Field id={id} label={label} hint={opts.hint} error={error}>
        <input
          id={id}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete="off"
          value={d[k]}
          onChange={(e) => setDriver(d.key, k, e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </Field>
    );
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:py-14">
      <aside className="order-first md:order-last">
        <div className="border border-line bg-surface md:sticky md:top-24">
          <CarPhoto vehicle={vehicle} className="aspect-[16/9] w-full" />
          <div className="p-5">
            <h2 className="text-xl font-semibold tracking-tight">{vehicleName(vehicle)}</h2>

            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-medium">Your trip</h3>
                <a href="#your-dates" className="text-sm font-medium text-cobalt underline underline-offset-4">Change dates</a>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-subtle">Pick up</dt><dd className="text-right">{isValidDay(f.pickupDate) ? `${tripDay(f.pickupDate)} at ${fmtTime12(f.pickupTime)}` : "Choose a date"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Return</dt><dd className="text-right">{isValidDay(f.returnDate) ? `${tripDay(f.returnDate)} at ${fmtTime12(f.returnTime)}` : "Choose a date"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-subtle">Length</dt><dd>{days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "-"}</dd></div>
              </dl>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              {price && (vehicle.depositCents > 0 || driverFee.cents > 0) ? (
                <dl className="mb-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-subtle">Rental</dt><dd className="font-mono">{fmtMoney(price.total_cents)}</dd></div>
                  {driverFee.cents > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-subtle">
                        {drivers.length === 1 ? "Extra driver" : `${drivers.length} extra drivers`}
                        <span className="block text-xs">
                          {driverFee.capped
                            ? `${fmtMoney(driverFee.perDriverCents)} each (the most per rental)`
                            : `${fmtMoney(vehicle.driverFeeCents)} a day each, ${days} day${days === 1 ? "" : "s"}`}
                        </span>
                      </dt>
                      <dd className="font-mono">{fmtMoney(driverFee.cents)}</dd>
                    </div>
                  ) : null}
                  {vehicle.depositCents > 0 ? <div className="flex justify-between gap-4"><dt className="text-subtle">Deposit</dt><dd className="font-mono">{fmtMoney(vehicle.depositCents)}</dd></div> : null}
                </dl>
              ) : null}
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-base font-medium">Total</span>
                <span className="font-mono text-2xl font-medium tracking-tight">{price ? fmtMoney(grandTotal) : "-"}</span>
              </div>
              {price && price.weeks > 0 && price.rem > 0 ? <p className="mt-1 text-right text-xs text-subtle">{price.breakdown}</p> : null}
              {price && savings > 0 ? <p className="mt-2 text-sm font-medium text-ok">You save {fmtMoney(savings)} compared with paying {fmtMoney(oneDayCents)} a day.</p> : null}
            </div>

            {table ? (
              <details className="group mt-4 border-t border-line pt-4 text-sm">
                <summary className="cursor-pointer list-none font-medium text-cobalt underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">See prices for 1 to 7 days</span>
                  <span className="hidden group-open:inline">Hide prices</span>
                </summary>
                <p className="mt-3 text-subtle">The longer you rent, the less you pay per day.</p>
                <ul className="mt-3 divide-y divide-line border border-line">
                  {table.map((cents, i) => {
                    const n = i + 1;
                    const mine = days === n;
                    return (
                      <li key={n} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${mine ? "bg-cobalt-tint" : ""}`}>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={mine ? "font-medium" : ""}>{n} day{n === 1 ? "" : "s"}</span>
                          {mine ? (
                            <span className="bg-cobalt px-1.5 py-0.5 text-xs font-medium text-surface">Your trip</span>
                          ) : n === 7 ? (
                            <span className="bg-ok-tint px-1.5 py-0.5 text-xs font-medium text-ok">Best value</span>
                          ) : null}
                        </span>
                        <span className="text-right">
                          <span className={`block font-mono ${mine ? "font-medium" : ""}`}>{fmtMoney(cents)}</span>
                          {n > 1 ? <span className="block text-xs text-subtle">{fmtMoney(Math.round(cents / n))} a day</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-subtle">
                  Longer than a week? Each full week is {fmtMoney(weekCents)}, plus the price above for any extra days. For example, 9 days is {fmtMoney(weekCents)} + {fmtMoney(table[1] ?? 0)} = {fmtMoney(priceVehicle(9, vehicle).total_cents)}.
                </p>
              </details>
            ) : (
              <p className="mt-4 border-t border-line pt-4 font-mono text-sm text-subtle">
                {fmtMoney(vehicle.dailyRateCents)} a day or {fmtMoney(vehicle.weeklyRateCents)} a week
              </p>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-sm font-medium">What happens next</h3>
              <ol className="mt-3 space-y-2.5 text-sm">
                {NEXT_STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center bg-ink font-mono text-xs text-surface">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-subtle">Nothing is charged until step 3.</p>
            </div>
          </div>
        </div>
      </aside>

      <form onSubmit={onSubmit} noValidate className="space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">Reserve the {vehicle.make} {vehicle.model}</h1>
          <p className="mt-3 text-subtle">Fill this in once and we'll add it to your rental paperwork for you.</p>
        </div>

        <fieldset id="your-dates" className="scroll-mt-24 space-y-5">
          <legend><SectionTitle>Your dates</SectionTitle></legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="pickupDate" label="Pickup date" error={err("pickupDate")}>
              <input id="pickupDate" type="date" min={from} max={to} value={f.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} className={inputClass} {...a11y("pickupDate")} />
            </Field>
            <Field id="pickupTime" label="Pickup time">
              <select id="pickupTime" value={f.pickupTime} onChange={(e) => set("pickupTime", e.target.value)} className={inputClass}>
                {TIMES.map((t) => <option key={t} value={t}>{fmtTime12(t)}</option>)}
              </select>
            </Field>
            <Field id="returnDate" label="Return date" error={err("returnDate")}>
              <input id="returnDate" type="date" min={f.pickupDate || from} max={to} value={f.returnDate} onChange={(e) => set("returnDate", e.target.value)} className={inputClass} {...a11y("returnDate")} />
            </Field>
            <Field id="returnTime" label="Return time">
              <select id="returnTime" value={f.returnTime} onChange={(e) => set("returnTime", e.target.value)} className={inputClass}>
                {TIMES.map((t) => <option key={t} value={t}>{fmtTime12(t)}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend><SectionTitle>About you</SectionTitle></legend>
          {text("fullName", "Full legal name", { autoComplete: "name", hint: "As it appears on your driver's license" })}
          <div className="grid gap-5 sm:grid-cols-2">
            {text("email", "Email", { type: "email", autoComplete: "email", inputMode: "email" })}
            {text("phone", "Mobile phone", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
          </div>
          {text("address", "Street address", { autoComplete: "street-address" })}
          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {text("city", "City", { autoComplete: "address-level2" })}
            {text("state", "State", { autoComplete: "address-level1" })}
            {text("zip", "ZIP", { autoComplete: "postal-code", inputMode: "numeric" })}
          </div>
          {text("dob", "Date of birth", { type: "date", autoComplete: "bday" })}
        </fieldset>

        <fieldset className="space-y-5">
          <legend><SectionTitle>Driver's license</SectionTitle></legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {text("dlNumber", "License number")}
            {text("dlState", "Issuing state or country")}
          </div>
          {text("dlExpiration", "License expiration date", { type: "date" })}
        </fieldset>

        <fieldset className="space-y-5">
          <legend><SectionTitle>Other drivers</SectionTitle></legend>
          <p className="leading-relaxed text-subtle">
            Only you and the people you list here may drive the car. Each one must be 18 or older with a valid physical license, and does the same quick ID check before driving.
            {vehicle.driverFeeCents > 0
              ? ` Each extra driver is ${fmtMoney(vehicle.driverFeeCents)} a day${vehicle.driverFeeCapCents > 0 ? `, and never more than ${fmtMoney(vehicle.driverFeeCapCents)} per rental` : ""}.`
              : ""}
          </p>
          {drivers.map((d, i) => (
            <div key={d.key} className="space-y-5 border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold">Other driver {drivers.length > 1 ? i + 1 : ""}</h3>
                <button type="button" onClick={() => removeDriver(d.key)} className="min-h-11 text-sm font-medium text-danger underline underline-offset-4">
                  Remove
                </button>
              </div>
              {driverText(d, i, "fullName", "Full legal name", { hint: "As it appears on their driver's license" })}
              <div className="grid gap-5 sm:grid-cols-2">
                {driverText(d, i, "phone", "Mobile phone", { type: "tel", inputMode: "tel" })}
                {driverText(d, i, "dob", "Date of birth", { type: "date" })}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {driverText(d, i, "dlNumber", "License number")}
                {driverText(d, i, "dlState", "Issuing state or country")}
              </div>
              {driverText(d, i, "dlExpiration", "License expiration date", { type: "date" })}
            </div>
          ))}
          {drivers.length < MAX_DRIVERS ? (
            <button type="button" onClick={addDriver} className="inline-flex min-h-12 items-center gap-2 border border-ink bg-surface px-5 font-medium text-ink hover:bg-ground">
              <Plus className="size-4" aria-hidden="true" />
              {drivers.length === 0 ? "Add another driver" : "Add one more driver"}
            </button>
          ) : (
            <p className="text-sm text-subtle">Up to {MAX_DRIVERS} other drivers per reservation.</p>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend><SectionTitle>Confirm</SectionTitle></legend>
          <Checkbox id="attest" checked={f.attest} onChange={(v) => set("attest", v)}>{LICENSE_ATTESTATION}</Checkbox>
          {err("attest") ? <p id="attest-error" className="text-sm text-danger">{err("attest")}</p> : null}
        </fieldset>

        <div className="space-y-3">
          {serverError ? <p role="alert" className="border border-danger bg-danger-tint p-4 text-sm text-danger">{serverError}</p> : null}
          {submitted && hasErrors ? <p role="alert" className="text-sm text-danger">Please fix the highlighted fields.</p> : null}
          <ContinueButton busy={busy}>Continue to agreements</ContinueButton>
        </div>
      </form>
    </div>
  );
}
