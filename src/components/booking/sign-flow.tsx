import { useRef, useState } from "react";

import { ESIGN_CONSENT, LICENSE_ATTESTATION } from "@/lib/agreements";
import type { AgreementDocs, CustomerBookingView } from "@/lib/types";

import { AgreementView } from "./agreement-view";
import { Checkbox, ContinueButton, Field, inputClass } from "./form";
import { SignaturePad } from "./signature-pad";
import { ReservationSummary } from "./summary";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function SignFlow({ booking, docs }: { booking: CustomerBookingView; docs: AgreementDocs }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [initials, setInitials] = useState("");
  const [typedName, setTypedName] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [consentEsign, setConsentEsign] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reservationUrl = `/booking/${encodeURIComponent(booking.id)}?token=${booking.token}`;

  if (booking.agreementsSignedAt || booking.status === "declined" || booking.status === "cancelled") {
    const signed = Boolean(booking.agreementsSignedAt);
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">{signed ? "Your agreements are signed." : "This reservation is closed."}</h1>
        <p className="mt-3 text-subtle">{signed ? (booking.emailReady ? "Signed copies were emailed to you and saved with your reservation." : "Signed copies are saved with your reservation.") : "It can no longer be signed. Reply to your confirmation email with any questions."}</p>
        <a href={reservationUrl} className="mt-6 inline-flex h-11 items-center bg-cobalt px-5 font-medium text-surface hover:bg-cobalt-deep">Open your reservation</a>
      </div>
    );
  }

  const nameOk = norm(typedName) === norm(booking.customer.fullName);
  const missing: string[] = [];
  if (!initials) missing.push("your initials in section 7");
  if (!nameOk) missing.push("your full name exactly as on the reservation");
  if (!hasInk) missing.push("your signature");
  if (!consentEsign || !consentTerms || !attest) missing.push("all three confirmations");
  const ready = missing.length === 0;

  async function submit() {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error("Could not read your signature. Please try again.");
      const form = new FormData();
      form.append("id", booking.id);
      form.append("token", booking.token);
      form.append("typedName", typedName);
      form.append("initials", initials);
      form.append("consentEsign", String(consentEsign));
      form.append("consentTerms", String(consentTerms));
      form.append("attestLicense", String(attest));
      form.append("signature", blob, "signature.jpg");
      const res = await fetch("/api/sign", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Signing failed. Please try again.");
      window.location.assign(`${reservationUrl}&signed=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:py-14">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">Step 2 of 3</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tighter md:text-4xl">Review and sign your agreements</h1>
      <p className="mt-3 leading-relaxed text-subtle">
        Both agreements are filled in from your reservation. Read them, add your initials in section 7, then sign once at the bottom to sign both.
      </p>
      <div className="mt-6"><ReservationSummary b={booking} /></div>

      <div className="mt-8 space-y-8">
        <AgreementView doc={docs.rental} initials={initials} onInitials={setInitials} />
        <AgreementView doc={docs.easy} initials={initials} onInitials={setInitials} />
      </div>

      <section aria-labelledby="sign-heading" className="mt-10 space-y-6 border-2 border-ink bg-surface p-5 md:p-8">
        <h2 id="sign-heading" className="text-2xl font-semibold tracking-tight">Sign both agreements</h2>
        <Field id="typedName" label="Type your full legal name" hint={`Exactly as on your reservation: ${booking.customer.fullName}`} error={typedName && !nameOk ? "This doesn't match the name on your reservation yet" : null}>
          <input id="typedName" value={typedName} autoComplete="name" onChange={(e) => setTypedName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="initials-sign" label="Your initials for section 7 (additional charges)">
          <input id="initials-sign" value={initials} maxLength={4} autoComplete="off" onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} className={`${inputClass} max-w-40 font-mono uppercase`} />
        </Field>
        <div>
          <p className="text-sm font-medium">Your signature</p>
          <div className="mt-2"><SignaturePad canvasRef={canvasRef} onInk={setHasInk} typedName={typedName} /></div>
        </div>
        <div className="divide-y divide-line border-y border-line">
          <Checkbox id="consentEsign" checked={consentEsign} onChange={setConsentEsign}>{ESIGN_CONSENT}</Checkbox>
          <Checkbox id="consentTerms" checked={consentTerms} onChange={setConsentTerms}>I have read the Motor Vehicle Rental Agreement and the Vehicle Rental Agreement above and agree to their terms.</Checkbox>
          <Checkbox id="attest" checked={attest} onChange={setAttest}>{LICENSE_ATTESTATION}</Checkbox>
        </div>
        {error ? <p role="alert" className="border border-danger bg-danger-tint p-4 text-sm text-danger">{error}</p> : null}
        {!ready ? <p className="text-sm text-subtle">Still needed: {missing.join(", ")}.</p> : null}
        <ContinueButton type="button" onClick={submit} disabled={!ready} busy={busy}>Sign both agreements</ContinueButton>
        <p className="text-xs leading-relaxed text-subtle">Signing records the date, time, your IP address and device with the signed copies, which are emailed to you and to Everstone Consulting Group LLC.</p>
      </section>
    </div>
  );
}
