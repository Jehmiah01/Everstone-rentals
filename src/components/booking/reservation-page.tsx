import { useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { confirmPayment, startCheckout } from "@/lib/api/booking.functions";
import { fmtMoney } from "@/lib/dates";
import type { CustomerBookingView } from "@/lib/types";

import { ContinueButton } from "./form";
import { ReservationSummary } from "./summary";

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

const fileInputClass =
  "block w-full text-sm text-subtle file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-ink file:px-4 file:font-medium file:text-surface hover:file:bg-cobalt-deep";

function usePreview(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function IdUpload({ b, onDone }: { b: CustomerBookingView; onDone: () => void }) {
  const [license, setLicense] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const licensePreview = usePreview(license);
  const selfiePreview = usePreview(selfie);

  async function submit() {
    if (!license || !selfie) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("id", b.id);
      form.append("token", b.token);
      form.append("license", license);
      form.append("selfie", selfie);
      const res = await fetch("/api/verify", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="leading-relaxed text-subtle">
        Required once, before you get the keys. Take clear, well-lit photos. Use your physical license; a photo of a screen, a permit or an international driving permit alone is not accepted.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="license-file" className="block text-sm font-medium">Front of your driver's license</label>
          <input id="license-file" type="file" accept="image/*,.heic,.heif" onChange={(e) => setLicense(e.target.files?.[0] ?? null)} className={`mt-2 ${fileInputClass}`} />
          {licensePreview ? <img src={licensePreview} alt="Your license photo preview" className="mt-3 aspect-[3/2] w-full border border-line object-cover" /> : null}
        </div>
        <div>
          <label htmlFor="selfie-file" className="block text-sm font-medium">Selfie holding your license next to your face</label>
          <input id="selfie-file" type="file" accept="image/*,.heic,.heif" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} className={`mt-2 ${fileInputClass}`} />
          {selfiePreview ? <img src={selfiePreview} alt="Your selfie preview" className="mt-3 aspect-[3/2] w-full border border-line object-cover" /> : null}
        </div>
      </div>
      {error ? <p role="alert" className="border border-danger bg-danger-tint p-4 text-sm text-danger">{error}</p> : null}
      <ContinueButton type="button" onClick={submit} disabled={!license || !selfie} busy={busy}>Upload photos</ContinueButton>
    </div>
  );
}

export function ReservationPage({ b, justSigned, returnedFromPay }: { b: CustomerBookingView; justSigned: boolean; returnedFromPay: boolean }) {
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
                <IdUpload b={b} onDone={() => void router.invalidate()} />
              </>
            )}
          </Step>
          <Step n={4} title="Approval and pickup" state={b.pickupAddress ? "done" : "waiting"}>
            <p className="text-sm text-subtle">
              {b.pickupAddress
                ? "You're approved. The pickup address is at the top of this page and in your email."
                : "We review your reservation and email the pickup address once it's approved."}
            </p>
          </Step>
        </ol>
      ) : null}

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
