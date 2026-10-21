import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";

import { LICENSE_ATTESTATION } from "@/lib/agreements";
import { createBooking } from "@/lib/api/booking.functions";
import { addDays, ageOn, diffDays, eachDay, fmtMoney, fmtTime12, isValidDay, prettyDay, priceVehicle } from "@/lib/dates";
import type { PublicVehicle } from "@/lib/types";

import { CarPhoto, RateSchedule, vehicleName } from "../site/fleet";
import { Checkbox, ContinueButton, Field, SectionTitle, inputClass } from "./form";

const TIMES = Array.from({ length: 23 }, (_, i) => {
  const mins = 8 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

type FormState = {
  pickupDate: string; returnDate: string; pickupTime: string; returnTime: string;
  fullName: string; email: string; phone: string; address: string; city: string; state: string; zip: string;
  dob: string; dlNumber: string; dlState: string; dlExpiration: string; additionalDrivers: string; attest: boolean;
};

export function BookForm({ vehicle, unavailable, from, to, start }: {
  vehicle: PublicVehicle; unavailable: string[]; from: string; to: string; start?: string;
}) {
  const navigate = useNavigate();
  const blocked = useMemo(() => new Set(unavailable), [unavailable]);
  const firstPickup = start && start >= from && start <= to ? start : from;
  const [f, setF] = useState<FormState>({
    pickupDate: firstPickup, returnDate: addDays(firstPickup, 7), pickupTime: "10:00", returnTime: "10:00",
    fullName: "", email: "", phone: "", address: "", city: "", state: "MD", zip: "",
    dob: "", dlNumber: "", dlState: "MD", dlExpiration: "", additionalDrivers: "", attest: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const datesValid = isValidDay(f.pickupDate) && isValidDay(f.returnDate) && f.returnDate >= f.pickupDate;
  const days = datesValid ? Math.max(1, diffDays(f.pickupDate, f.returnDate)) : 0;
  const conflict = datesValid ? (eachDay(f.pickupDate, f.returnDate).find((d) => blocked.has(d)) ?? null) : null;
  const price = days > 0 ? priceVehicle(days, vehicle) : null;

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
  const hasErrors = Object.keys(errors).length > 0;
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
          dlExpiration: f.dlExpiration, additionalDrivers: f.additionalDrivers.trim() || undefined, attestLicense: true,
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

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:py-14">
      <aside className="order-first md:order-last">
        <div className="border border-line bg-surface md:sticky md:top-24">
          <CarPhoto vehicle={vehicle} className="aspect-[16/9] w-full" />
          <div className="p-5">
            <h2 className="text-xl font-semibold tracking-tight">{vehicleName(vehicle)}</h2>
            {vehicle.rateTable ? (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-subtle">Prices by rental length</summary>
                <div className="mt-3"><RateSchedule vehicle={vehicle} /></div>
                <p className="mt-2 text-xs text-subtle">Over 7 days: {fmtMoney(vehicle.weeklyRateCents)} per full week plus the price for the extra days.</p>
              </details>
            ) : (
              <p className="mt-1 font-mono text-sm text-subtle">
                {fmtMoney(vehicle.dailyRateCents)}/day or {fmtMoney(vehicle.weeklyRateCents)}/week
              </p>
            )}
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Pickup</dt><dd>{isValidDay(f.pickupDate) ? `${prettyDay(f.pickupDate)}, ${fmtTime12(f.pickupTime)}` : "Choose a date"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Return</dt><dd>{isValidDay(f.returnDate) ? `${prettyDay(f.returnDate)}, ${fmtTime12(f.returnTime)}` : "Choose a date"}</dd></div>
              {price ? <div className="flex justify-between gap-4"><dt className="text-subtle">Rental</dt><dd className="text-right">{days} day{days === 1 ? "" : "s"}: {price.breakdown}</dd></div> : null}
              {vehicle.depositCents > 0 ? <div className="flex justify-between gap-4"><dt className="text-subtle">Deposit</dt><dd>{fmtMoney(vehicle.depositCents)}</dd></div> : null}
              <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-medium">
                <dt>Total</dt>
                <dd className="font-mono">{price ? fmtMoney(price.total_cents + vehicle.depositCents) : "-"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-subtle">Next you'll review and sign both rental agreements, then pay with Square.</p>
          </div>
        </div>
      </aside>

      <form onSubmit={onSubmit} noValidate className="space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">Reserve the {vehicle.make} {vehicle.model}</h1>
          <p className="mt-3 text-subtle">You enter this once. It fills in both rental agreements automatically.</p>
        </div>

        <fieldset className="space-y-5">
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
          <Field id="additionalDrivers" label="Additional drivers (optional)" hint="Full names of anyone else who will drive. They must meet the same requirements.">
            <textarea id="additionalDrivers" rows={2} value={f.additionalDrivers} onChange={(e) => set("additionalDrivers", e.target.value)} className={`${inputClass} h-auto py-3`} />
          </Field>
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
