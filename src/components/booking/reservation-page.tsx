import { useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { confirmExtension, confirmPayment, startCheckout, startExtension } from "@/lib/api/booking.functions";
import { BRAND } from "@/lib/brand";
import { addDays, diffDays, fmtMoney, fmtTime12, isValidDay, prettyDay, priceVehicle, shortDay } from "@/lib/dates";
import type { CustomerBookingView, CustomerDriver } from "@/lib/types";

import { Field, inputClass } from "./form";
import { IdPhotoForm } from "./id-photo-form";
import { ReservationSummary } from "./summary";
import { ProtectionCard } from "./protection-card";

const STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Waiting for approval", cls: "bg-warn-tint text-warn" },
  approved: { label: "Approved", cls: "bg-ok-tint text-ok" },
  completed: { label: "Completed", cls: "bg-cobalt-tint text-cobalt" },
  declined: { label: "Declined", cls: "bg-danger-tint text-danger" },
  cancelled: { label: "Cancelled", cls: "bg-danger-tint text-danger" },
};

const DOC_NAMES: Record<string, string> = {
  rental: "Motor Vehicle Rental Agreement",
  easy_sign: "Vehicle Rental Agreement",
};

type StepState = "done" | "current" | "waiting" | "review";

function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children?: ReactNode }) {
  const note = { done: "Done", current: "To do", waiting: "Later", review: "Under review" }[state];
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 py-6">
      <span
        aria-hidden="true"
        className={`flex size-10 items-center justify-center font-mono text-sm ${
          state === "done" ? "bg-ok text-surface" : state === "current" ? "bg-cobalt text-surface" : "border border-line text-subtle"
        }`}
      >
        {state === "done" ? <Check className="size-5" /> : n}
      </span>
      <div>
        <h3 className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold tracking-tight">
          {title}
          <span className={`text-sm font-normal ${state === "done" ? "text-ok" : state === "current" ? "text-cobalt" : "text-subtle"}`}>{note}</span>
        </h3>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}

const DRIVER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Photos needed", cls: "text-cobalt" },
  rejected: { label: "New photos needed", cls: "text-danger" },
  submitted: { label: "Under review", cls: "text-subtle" },
  approved: { label: "Approved", cls: "text-ok" },
  not_required: { label: "Already verified", cls: "text-ok" },
};

const driverNeedsPhotos = (d: CustomerDriver) => d.verificationStatus === "pending" || d.verificationStatus === "rejected";
const driverCleared = (d: CustomerDriver) => d.verificationStatus === "approved" || d.verificationStatus === "not_required";

function DriverCheck({ b, d, onDone }: { b: CustomerBookingView; d: CustomerDriver; onDone: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const st = DRIVER_STATUS[d.verificationStatus] ?? { label: d.verificationStatus, cls: "text-subtle" };
  const first = d.fullName.split(" ")[0] || d.fullName;

  async function sendLink() {
    const url = `${window.location.origin}${d.link}`;
    const text = `${b.customer.fullName} listed you as a driver on a ${BRAND.name} reservation. Please upload a photo of your license and a selfie here:`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Your ID check", text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{d.fullName}</span>
        <span className={`text-sm font-medium ${st.cls}`}>{st.label}</span>
      </div>
      {driverNeedsPhotos(d) ? (
        <div className="mt-3 space-y-4">
          {d.verificationStatus === "rejected" ? (
            <p className="border border-danger bg-danger-tint p-3 text-sm text-danger">We need clearer photos of {d.fullName}. Please upload them again.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sendLink} className="inline-flex min-h-11 items-center bg-cobalt px-4 text-sm font-medium text-surface hover:bg-cobalt-deep">
              {copied ? "Link copied. Paste it in a text to them." : `Send ${first} their link`}
            </button>
            <button
              type="button"
              aria-expanded={uploading}
              onClick={() => setUploading((v) => !v)}
              className="inline-flex min-h-11 items-center border border-line bg-surface px-4 text-sm font-medium hover:border-ink"
            >
              {uploading ? "Close" : "Upload their photos here"}
            </button>
          </div>
          {uploading ? (
            <IdPhotoForm endpoint="/api/verify-driver" fields={{ driverId: d.id, token: b.token }} subject={{ name: d.fullName }} idPrefix={`drv-${d.id}`} onDone={onDone} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const EXTEND_PICKS: [number, string][] = [[1, "+1 day"], [3, "+3 days"], [7, "+1 week"]];
const btnPrimary = "inline-flex h-12 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep disabled:bg-subtle";

/** "Need the car longer?": pay for more days online; the extension is confirmed once Square takes the payment. */
function ExtendSection({ b, returnedFromExtend }: { b: CustomerBookingView; returnedFromExtend: boolean }) {
  const router = useRouter();
  const x = b.extension;
  const max = x.maxDate;
  const [date, setDate] = useState(() => (max ? (addDays(b.returnDate, 7) <= max ? addDays(b.returnDate, 7) : max) : ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!returnedFromExtend && x.dueCents === 0 && !x.pendingDate) return;
    let stop = false;
    confirmExtension({ data: { id: b.id, token: b.token, origin: window.location.origin } })
      .then((r) => {
        if (stop) return;
        if (r.changed) void router.invalidate();
        else if (returnedFromExtend && r.waiting) setMsg("Square is still confirming your payment. Refresh this page in a minute.");
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
    // Run once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extra = max && isValidDay(date) ? diffDays(b.returnDate, date) : 0;
  const valid = Boolean(max) && extra > 0 && date <= (max ?? "");
  const price = valid ? priceVehicle(extra, b.vehicle).total_cents : 0;

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await startExtension({ data: { id: b.id, token: b.token, returnDate: date, origin: window.location.origin } });
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setMsg(r.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start the extension. Please try again.");
    }
    setBusy(false);
  }

  const justExtended = returnedFromExtend && Boolean(x.originalReturnDate) && !x.pendingDate && x.dueCents === 0;
  if (!justExtended && x.dueCents === 0 && !max && !x.note) return null;

  return (
    <section className="mt-8 border border-line bg-surface p-5 md:p-6" aria-labelledby="extend-heading">
      {justExtended ? (
        <p role="status" className="mb-5 border border-ok bg-ok-tint p-4 text-ok">
          Payment received. Your car is now due back {prettyDay(b.returnDate)} at {fmtTime12(b.returnTime)}.
        </p>
      ) : null}
      {x.dueCents > 0 && x.payLink ? (
        <>
          <h2 id="extend-heading" className="text-xl font-semibold tracking-tight">Pay for your extension</h2>
          <p className="mt-2 text-subtle">
            Your rental was extended to <strong className="font-medium text-ink">{prettyDay(b.returnDate)} at {fmtTime12(b.returnTime)}</strong>. Pay {fmtMoney(x.dueCents)} to confirm it.
          </p>
          <a href={x.payLink} className={`mt-4 ${btnPrimary}`}>Pay {fmtMoney(x.dueCents)} with Square</a>
        </>
      ) : max ? (
        <>
          <h2 id="extend-heading" className="text-xl font-semibold tracking-tight">Need the car longer?</h2>
          <p className="mt-2 text-subtle">
            It's due back {prettyDay(b.returnDate)} at {fmtTime12(b.returnTime)}. Pick a new return day and pay for the extra days. It's confirmed as soon as you pay.
          </p>
          {x.pendingDate ? (
            <p className="mt-4 border border-warn bg-warn-tint p-3 text-sm text-warn">
              You started extending to {prettyDay(x.pendingDate)} ({fmtMoney(x.pendingCents)}) but it isn't paid yet.{" "}
              {x.pendingLink ? <a href={x.pendingLink} className="font-medium underline underline-offset-4">Finish paying</a> : null}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {EXTEND_PICKS.filter(([n]) => addDays(b.returnDate, n) <= max).map(([n, label]) => {
              const d = addDays(b.returnDate, n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={date === d}
                  onClick={() => setDate(d)}
                  className={`inline-flex min-h-11 items-center border px-4 text-sm font-medium ${date === d ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-ink"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Field id="extend-date" label="New return day" hint={`Latest available: ${prettyDay(max)}`} className="mt-4 max-w-xs">
            <input id="extend-date" type="date" min={addDays(b.returnDate, 1)} max={max} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <p className="mt-4">
            {valid
              ? <>{extra} extra day{extra === 1 ? "" : "s"}: <strong className="font-semibold">{fmtMoney(price)}</strong>. Due back {prettyDay(date)} at {fmtTime12(b.returnTime)}.</>
              : <span className="text-subtle">Pick a day between {shortDay(addDays(b.returnDate, 1))} and {shortDay(max)}.</span>}
          </p>
          <button type="button" onClick={go} disabled={!valid || busy} className={`mt-4 ${btnPrimary}`}>
            {busy ? "Opening Square..." : valid ? `Pay ${fmtMoney(price)} and extend` : "Extend"}
          </button>
        </>
      ) : x.note ? (
        <>
          <h2 id="extend-heading" className="text-xl font-semibold tracking-tight">Need the car longer?</h2>
          <p className="mt-2 text-subtle">{x.note}</p>
        </>
      ) : null}
      {msg ? <p role="status" className="mt-3 text-sm text-ink">{msg}</p> : null}
    </section>
  );
}

export function ReservationPage({ b, justSigned, returnedFromPay, returnedFromExtend = false }: { b: CustomerBookingView; justSigned: boolean; returnedFromPay: boolean; returnedFromExtend?: boolean }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const status = STATUS[b.status] ?? { label: b.status, cls: "bg-ground text-ink" };
  const closed = b.status === "declined" || b.status === "cancelled";
  const signed = Boolean(b.agreementsSignedAt);
  const paid = b.paymentStatus === "paid";
  const total = b.totalCents + b.depositCents;
  const signUrl = `/booking/${encodeURIComponent(b.id)}/sign?token=${b.token}`;

  useEffect(() => {
    if (!returnedFromPay || paid) return;
    let cancelled = false;
    confirmPayment({ data: { id: b.id, token: b.token } })
      .then((r) => {
        if (cancelled) return;
        if (r.paymentStatus === "paid") void router.invalidate();
        else setPayMsg("Square is still confirming your payment. Refresh this page in a minute.");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Run once when returning from Square.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    setPaying(true);
    setPayMsg(null);
    try {
      const r = await startCheckout({ data: { id: b.id, token: b.token, origin: window.location.origin } });
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setPayMsg(r.message);
    } catch (e) {
      setPayMsg(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
    }
    setPaying(false);
  }

  const verifyState: StepState =
    b.verificationStatus === "approved" || b.verificationStatus === "not_required"
      ? "done"
      : b.verificationStatus === "submitted"
        ? "review"
        : "current";

  const hasDrivers = b.drivers.length > 0;
  const driversState: StepState = b.drivers.every(driverCleared) ? "done" : b.drivers.some(driverNeedsPhotos) ? "current" : "review";

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:py-14">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-sm text-subtle">Reservation {b.id}</p>
        <span className={`px-2.5 py-1 text-sm font-medium ${status.cls}`}>{status.label}</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tighter md:text-4xl">
        {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
      </h1>

      {justSigned && signed ? (
        <p role="status" className="mt-6 border border-ok bg-ok-tint p-4 text-ok">{b.emailReady ? `Both agreements are signed. Copies were emailed to ${b.customer.email}.` : "Both agreements are signed. You can view and download them below."}</p>
      ) : null}
      {closed ? (
        <p role="status" className="mt-6 border border-danger bg-danger-tint p-4 text-danger">This reservation was {b.status}. Reply to your confirmation email with any questions.</p>
      ) : null}

      {b.pickupAddress ? (
        <section className="mt-8 bg-ink p-6 text-surface md:p-8" aria-labelledby="pickup-heading">
          <h2 id="pickup-heading" className="text-sm font-medium uppercase tracking-[0.14em] text-surface/70">Pickup address</h2>
          <p className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">{b.pickupAddress}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.pickupAddress)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center font-medium text-surface underline underline-offset-4"
          >
            Open in Maps
          </a>
          <p className="mt-4 text-surface/80">Bring your physical driver's license.</p>
        </section>
      ) : null}

      {!closed ? (
        <ol className="mt-8 divide-y divide-line border-y border-line">
          <Step n={1} title="Sign both agreements" state={signed ? "done" : "current"}>
            {signed ? null : (
              <a href={signUrl} className="inline-flex h-12 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep">
                Review and sign
              </a>
            )}
          </Step>
          <Step n={2} title={`Pay ${fmtMoney(total)}`} state={paid ? "done" : signed ? "current" : "waiting"}>
            {paid ? null : signed ? (
              <div className="space-y-3">
                {b.paymentLink && !b.squareReady ? (
                  <a href={b.paymentLink} className="inline-flex h-12 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep">
                    Pay with Square
                  </a>
                ) : (
                  <button type="button" onClick={pay} disabled={paying} className="inline-flex h-12 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep disabled:bg-subtle">
                    {paying ? "Opening Square..." : "Pay with Square"}
                  </button>
                )}
                <p className="text-sm text-subtle">Secure card checkout by Square. Your card is not kept on file.</p>
              </div>
            ) : (
              <p className="text-sm text-subtle">Available after you sign.</p>
            )}
            {payMsg ? <p role="status" className="mt-3 text-sm text-ink">{payMsg}</p> : null}
          </Step>
          <Step n={3} title="Verify your license" state={verifyState}>
            {verifyState === "done" ? (
              <p className="text-sm text-subtle">{b.verificationStatus === "not_required" ? "Already verified from a past booking." : "Your license was approved."}</p>
            ) : verifyState === "review" ? (
              <p className="text-sm text-subtle">Thanks. Your photos are uploaded and being reviewed.</p>
            ) : (
              <>
                {b.verificationStatus === "rejected" ? (
                  <p className="mb-4 border border-danger bg-danger-tint p-4 text-sm text-danger">We need clearer photos. Please upload them again.</p>
                ) : null}
                <IdPhotoForm endpoint="/api/verify" fields={{ id: b.id, token: b.token }} subject="you" idPrefix="renter" onDone={() => void router.invalidate()} />
              </>
            )}
          </Step>
          {hasDrivers ? (
            <Step n={4} title={b.drivers.length === 1 ? "Verify the other driver" : "Verify the other drivers"} state={driversState}>
              <p className="text-sm text-subtle">
                Everyone you listed needs the same one-time ID check before they drive. Send them their own link, or upload their photos here if they're with you.
              </p>
              <ul className="mt-2 divide-y divide-line">
                {b.drivers.map((d) => (
                  <DriverCheck key={d.id} b={b} d={d} onDone={() => void router.invalidate()} />
                ))}
              </ul>
            </Step>
          ) : null}
          <Step n={hasDrivers ? 5 : 4} title="Approval and pickup" state={b.pickupAddress ? "done" : "waiting"}>
            <p className="text-sm text-subtle">
              {b.pickupAddress
                ? "You're approved. The pickup address is at the top of this page and in your email."
                : "We review your reservation and email the pickup address once it's approved."}
            </p>
          </Step>
        </ol>
      ) : null}
      {!closed ? <ExtendSection b={b} returnedFromExtend={returnedFromExtend} /> : null}
      {!closed ? <ProtectionCard /> : null}

      <section className="mt-10" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-xl font-semibold tracking-tight">Details</h2>
        <div className="mt-4"><ReservationSummary b={b} /></div>
      </section>

      {b.agreements.some((a) => a.pdfUrl) ? (
        <section className="mt-10" aria-labelledby="docs-heading">
          <h2 id="docs-heading" className="text-xl font-semibold tracking-tight">Your signed agreements</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {b.agreements.map((a) =>
              a.pdfUrl ? (
                <li key={a.kind} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>{DOC_NAMES[a.kind] ?? a.kind}</span>
                  <span className="flex gap-5 text-sm font-medium">
                    <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="min-h-11 content-center underline decoration-line underline-offset-4 hover:decoration-cobalt">View PDF</a>
                    <a href={`${a.pdfUrl}&download=1`} className="min-h-11 content-center underline decoration-line underline-offset-4 hover:decoration-cobalt">Download</a>
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-sm text-subtle">Keep this page's link private. It opens your reservation without a password.</p>
    </div>
  );
}
