import { useCallback, useEffect, useState, type ReactNode } from "react";

import { fmtMoney, fmtTime12, formatEt, prettyDay, shortDay } from "@/lib/dates";
import type { AdminBooking, AdminData, AdminVehicle } from "@/lib/types";

import { Checkbox, ContinueButton, Field, inputClass } from "../booking/form";
import { LogoMark } from "../site/chrome";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Run = (body: Record<string, unknown>, success?: string) => Promise<boolean>;

async function post<T = { ok: boolean; emailed?: boolean; error?: string }>(body: unknown): Promise<T> {
  const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

const toCents = (s: string) => {
  const n = Number.parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const dollars = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "info" | "plain"; children: ReactNode }) {
  const cls = {
    ok: "bg-ok-tint text-ok",
    warn: "bg-warn-tint text-warn",
    danger: "bg-danger-tint text-danger",
    info: "bg-cobalt-tint text-cobalt",
    plain: "bg-ground text-subtle",
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function SmallButton({ onClick, children, tone = "ink", disabled = false, type = "button" }: {
  onClick?: () => void; children: ReactNode; tone?: "ink" | "cobalt" | "danger" | "ghost"; disabled?: boolean; type?: "button" | "submit";
}) {
  const cls = {
    ink: "bg-ink text-surface hover:bg-cobalt-deep",
    cobalt: "bg-cobalt text-surface hover:bg-cobalt-deep",
    danger: "border border-danger text-danger hover:bg-danger-tint",
    ghost: "border border-line text-ink hover:border-ink",
  }[tone];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center px-4 text-sm font-medium disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

function statusBadge(b: AdminBooking) {
  const map: Record<string, [string, "ok" | "warn" | "danger" | "info" | "plain"]> = {
    requested: ["Requested", "warn"], approved: ["Approved", "ok"], completed: ["Completed", "info"],
    declined: ["Declined", "danger"], cancelled: ["Cancelled", "danger"],
  };
  const [label, tone] = map[b.status] ?? [b.status, "plain"];
  return <Badge tone={tone}>{label}</Badge>;
}

function idBadge(b: AdminBooking) {
  const map: Record<string, [string, "ok" | "warn" | "danger" | "info" | "plain"]> = {
    pending: ["ID not uploaded", "plain"], submitted: ["ID to review", "warn"], approved: ["ID approved", "ok"],
    rejected: ["ID rejected", "danger"], not_required: ["ID on file", "ok"],
  };
  const [label, tone] = map[b.verificationStatus] ?? [b.verificationStatus, "plain"];
  return <Badge tone={tone}>{label}</Badge>;
}

function payBadge(b: AdminBooking) {
  if (b.paymentStatus === "paid") return <Badge tone="ok">Paid</Badge>;
  if (b.paymentStatus === "refunded") return <Badge tone="info">Refunded</Badge>;
  if (b.paymentStatus === "link_sent") return <Badge tone="warn">Payment link sent</Badge>;
  return <Badge tone="plain">Unpaid</Badge>;
}

export function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<"reservations" | "cars" | "blocked" | "emails">("reservations");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { headers: { Accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; authed?: boolean; configured?: boolean; data?: AdminData; error?: string };
    if (res.status === 401) {
      setAuthed(false);
      setConfigured(json.configured !== false);
      return;
    }
    if (!res.ok || !json.data) {
      setNotice({ kind: "error", text: json.error ?? "Could not load the dashboard" });
      setAuthed(true);
      return;
    }
    setAuthed(true);
    setData(json.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run: Run = async (body, success) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await post(body);
      const emailNote = r.emailed === false ? " Email is not set up yet, so nothing was emailed." : "";
      setNotice({ kind: "ok", text: `${success ?? "Saved."}${emailNote}` });
      await load();
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (authed === null) return <p className="mx-auto max-w-6xl px-5 py-20 text-subtle">Loading the dashboard...</p>;
  if (!authed) return <Login configured={configured} onDone={load} />;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark className="size-8 text-cobalt" />
          <h1 className="text-2xl font-semibold tracking-tight">Owner dashboard</h1>
        </div>
        <SmallButton tone="ghost" onClick={async () => { await post({ action: "logout" }).catch(() => undefined); setAuthed(false); setData(null); }}>
          Log out
        </SmallButton>
      </div>

      {data && (!data.config.square || !data.config.email) ? (
        <div className="mt-6 border border-warn bg-warn-tint p-4 text-sm text-warn">
          {!data.config.square ? <p>Square checkout is not connected. Customers see "the owner will send a payment link"; paste a Square link on each reservation, or add the Square settings to connect checkout.</p> : null}
          {!data.config.email ? <p className={!data.config.square ? "mt-2" : ""}>Email is not set up, so nothing is emailed yet. Signed PDFs are still saved on each reservation below.</p> : null}
        </div>
      ) : null}

      {notice ? (
        <p role="status" className={`mt-6 border p-4 text-sm ${notice.kind === "ok" ? "border-ok bg-ok-tint text-ok" : "border-danger bg-danger-tint text-danger"}`}>
          {notice.text}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2 border-b border-line" role="tablist" aria-label="Dashboard sections">
        {([
          ["reservations", "Reservations"],
          ["cars", "Cars"],
          ["blocked", "Blocked dates"],
          ["emails", "Email log"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium ${tab === id ? "border-cobalt text-ink" : "border-transparent text-subtle hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!data ? null : tab === "reservations" ? (
        <Reservations data={data} run={run} busy={busy} />
      ) : tab === "cars" ? (
        <Cars vehicles={data.vehicles} run={run} busy={busy} reload={load} setNotice={setNotice} />
      ) : tab === "blocked" ? (
        <Blocked data={data} run={run} busy={busy} />
      ) : (
        <Emails data={data} />
      )}
    </div>
  );
}

function Login({ configured, onDone }: { configured: boolean; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-sm px-5 py-20">
      <LogoMark className="size-10 text-cobalt" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Owner login</h1>
      {!configured ? (
        <p className="mt-4 border border-warn bg-warn-tint p-4 text-sm text-warn">
          No admin password is set yet. Add a secret named ADMIN_PASSWORD in the website settings, then relaunch the site.
        </p>
      ) : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await post({ action: "login", password });
            await onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="admin-password" label="Password" error={error}>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <ContinueButton busy={busy} disabled={!password}>Log in</ContinueButton>
      </form>
    </div>
  );
}

function Reservations({ data, run, busy }: { data: AdminData; run: Run; busy: boolean }) {
  const [filter, setFilter] = useState<"action" | "all" | "unsigned" | "approved" | "closed">("action");
  const [open, setOpen] = useState<string | null>(null);
  const needsAction = (b: AdminBooking) =>
    b.status === "requested" && (Boolean(b.agreementsSignedAt) || b.verificationStatus === "submitted") ||
    (b.status === "approved" && b.verificationStatus === "submitted");
  const groups = {
    action: data.bookings.filter(needsAction),
    unsigned: data.bookings.filter((b) => !b.agreementsSignedAt && b.status === "requested"),
    approved: data.bookings.filter((b) => b.status === "approved"),
    closed: data.bookings.filter((b) => ["declined", "cancelled", "completed"].includes(b.status)),
    all: data.bookings,
  };
  const list = groups[filter];
  const labels: [typeof filter, string][] = [
    ["action", "Needs action"], ["unsigned", "Not signed yet"], ["approved", "Approved"], ["closed", "Closed"], ["all", "All"],
  ];
  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {labels.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium ${filter === id ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink"}`}
          >
            {label} <span className="font-mono text-xs opacity-80">{groups[id].length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mt-6 border border-line bg-surface p-6 text-subtle">Nothing here right now.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {list.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                aria-expanded={open === b.id}
                onClick={() => setOpen(open === b.id ? null : b.id)}
                className="grid w-full gap-2 p-4 text-left hover:bg-ground md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center"
              >
                <span>
                  <span className="block font-medium">{b.customer.name}</span>
                  <span className="block font-mono text-xs text-subtle">{b.id}</span>
                </span>
                <span className="text-sm">
                  {b.vehicleName}
                  <span className="block text-subtle">{shortDay(b.pickupDate)} to {shortDay(b.returnDate)}, {fmtMoney(b.totalCents + b.depositCents)}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {b.agreementsSignedAt ? <Badge tone="ok">Signed</Badge> : <Badge tone="warn">Not signed</Badge>}
                  {payBadge(b)}
                  {idBadge(b)}
                </span>
                <span>{statusBadge(b)}</span>
              </button>
              {open === b.id ? <BookingDetail b={b} run={run} busy={busy} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-sm text-subtle">{k}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function BookingDetail({ b, run, busy }: { b: AdminBooking; run: Run; busy: boolean }) {
  const [repName, setRepName] = useState(b.repName ?? "Jehmiah Johnson");
  const [reason, setReason] = useState("");
  const [idNotes, setIdNotes] = useState("");
  const [payLink, setPayLink] = useState(b.paymentLink ?? "");
  const [copied, setCopied] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [rec, setRec] = useState({
    mileageOut: b.mileageOut ?? "", fuelOut: b.fuelOut ?? "", conditionNotes: b.conditionNotes ?? "",
    mileageIn: b.mileageIn ?? "", fuelIn: b.fuelIn ?? "", actualReturnAt: b.actualReturnAt ?? "",
    damage: dollars(b.damageCents), fees: dollars(b.feesCents), refunded: dollars(b.depositRefundedCents),
    deducted: dollars(b.depositDeductedCents), finalPaid: dollars(b.finalPaidCents), notes: b.notes ?? "",
  });
  const setR = (k: keyof typeof rec, v: string) => setRec((p) => ({ ...p, [k]: v }));
  const open = b.status === "requested" || b.status === "approved";
  const docName = (kind: string) => (kind === "rental" ? "Motor Vehicle Rental Agreement" : "Vehicle Rental Agreement");

  return (
    <div className="grid gap-8 border-t border-line bg-ground/60 p-5 md:grid-cols-2 md:p-6">
      <section>
        <h3 className="font-semibold">Renter</h3>
        <dl className="mt-3 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <Row k="Name">{b.customer.name}</Row>
          <Row k="Email"><a className="underline underline-offset-4" href={`mailto:${b.customer.email}`}>{b.customer.email}</a></Row>
          <Row k="Phone"><a className="underline underline-offset-4" href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></Row>
          <Row k="Address">{b.customer.address}</Row>
          <Row k="Date of birth">{prettyDay(b.customer.dob)}</Row>
          <Row k="License">{b.customer.dlNumber} ({b.customer.dlState}), expires {prettyDay(b.customer.dlExpiration)}</Row>
          <Row k="Other drivers">{b.additionalDrivers || "None"}</Row>
          <Row k="Pickup">{prettyDay(b.pickupDate)} at {fmtTime12(b.pickupTime)}</Row>
          <Row k="Return">{prettyDay(b.returnDate)} at {fmtTime12(b.returnTime)}</Row>
          <Row k="Price">{b.days} days: {b.breakdown}. Total {fmtMoney(b.totalCents + b.depositCents)}</Row>
          <Row k="Booked">{formatEt(b.createdAt.includes("T") ? b.createdAt : `${b.createdAt.replace(" ", "T")}Z`)}</Row>
        </dl>
        <div className="mt-4">
          <SmallButton
            tone="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(b.customerLink).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy customer's private link"}
          </SmallButton>
        </div>
      </section>

      <section>
        <h3 className="font-semibold">Agreements</h3>
        <ul className="mt-3 space-y-3">
          {b.agreements.map((a) => (
            <li key={a.kind} className="border border-line bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{docName(a.kind)}</span>
                {a.status === "signed" ? <Badge tone="ok">Signed</Badge> : <Badge tone="warn">Not signed</Badge>}
              </div>
              {a.signedAt ? <p className="mt-1 text-subtle">Signed by {a.signerName} on {formatEt(a.signedAt)}, IP {a.ip}</p> : null}
              {a.sentAt ? <p className="mt-1 text-subtle">Last sent {formatEt(a.sentAt)} ({a.sendCount} total)</p> : null}
              {a.pdfUrl ? (
                <p className="mt-2 flex gap-4">
                  <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">View PDF</a>
                  <a href={`${a.pdfUrl}?download=1`} className="font-medium underline underline-offset-4">Download</a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <SmallButton tone="ghost" disabled={busy} onClick={() => run({ action: "resendAgreements", id: b.id }, b.agreementsSignedAt ? "Signed agreements re-sent to the renter and to you." : "Signing reminder sent.")}>
            {b.agreementsSignedAt ? "Resend signed agreements" : "Send signing reminder"}
          </SmallButton>
        </div>
      </section>

      <section>
        <h3 className="font-semibold">ID check</h3>
        {b.verification ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {b.verification.licenseUrl ? (
                <a href={b.verification.licenseUrl} target="_blank" rel="noreferrer"><img src={b.verification.licenseUrl} alt="Renter's license" className="aspect-[3/2] w-full border border-line object-cover" /></a>
              ) : null}
              {b.verification.selfieUrl ? (
                <a href={b.verification.selfieUrl} target="_blank" rel="noreferrer"><img src={b.verification.selfieUrl} alt="Renter's selfie holding license" className="aspect-[3/2] w-full border border-line object-cover" /></a>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-subtle">Uploaded {formatEt(b.verification.createdAt.includes("T") ? b.verification.createdAt : `${b.verification.createdAt.replace(" ", "T")}Z`)}. Check the name, photo and expiration match the reservation.</p>
            {b.verificationStatus === "submitted" ? (
              <div className="mt-3 space-y-3">
                <Field id={`idnotes-${b.id}`} label="Note to renter if rejecting (optional)">
                  <input id={`idnotes-${b.id}`} value={idNotes} onChange={(e) => setIdNotes(e.target.value)} className={inputClass} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SmallButton tone="cobalt" disabled={busy} onClick={() => run({ action: "reviewVerification", id: b.id, decision: "approve" }, "ID approved. This renter skips the check on future bookings.")}>Approve ID</SmallButton>
                  <SmallButton tone="danger" disabled={busy} onClick={() => run({ action: "reviewVerification", id: b.id, decision: "reject", notes: idNotes || undefined }, "ID rejected. The renter was asked to upload again.")}>Reject and ask again</SmallButton>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm text-subtle">{b.verificationStatus === "not_required" ? "Verified on an earlier booking." : "No photos uploaded yet. Do not hand over keys until the ID is approved."}</p>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Payment</h3>
        <p className="mt-3 text-sm">{payBadge(b)} {b.paidAt ? <span className="text-subtle">on {formatEt(b.paidAt)}</span> : null}</p>
        {b.paymentStatus === "paid" ? (
          <div className="mt-3 space-y-2">
            <SmallButton
              tone={confirmRefund ? "danger" : "ghost"}
              disabled={busy}
              onClick={async () => {
                if (!confirmRefund) {
                  setConfirmRefund(true);
                  return;
                }
                setConfirmRefund(false);
                await run({ action: "refund", id: b.id }, "Refund sent through Square. It reaches the customer's card in a few business days.");
              }}
            >
              {confirmRefund ? `Tap again to refund ${fmtMoney(b.totalCents + b.depositCents)}` : "Refund full amount"}
            </SmallButton>
            <p className="text-sm text-subtle">Goes back to the customer's card through Square.</p>
          </div>
        ) : null}
        {b.paymentStatus === "refunded" ? (
          <p className="mt-3 text-sm text-subtle">Refunded {fmtMoney(b.refundedCents ?? 0)}{b.refundedAt ? ` on ${formatEt(b.refundedAt)}` : ""}.</p>
        ) : null}
        {b.paymentStatus !== "paid" && b.paymentStatus !== "refunded" ? (
          <div className="mt-3 space-y-3">
            <Field id={`paylink-${b.id}`} label="Square payment link" hint="Create one in Square and paste it here to email it to the renter.">
              <input id={`paylink-${b.id}`} value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://square.link/..." className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SmallButton tone="ghost" disabled={busy || !payLink.startsWith("https://")} onClick={() => run({ action: "setPaymentLink", id: b.id, url: payLink }, "Payment link saved and sent.")}>Send payment link</SmallButton>
              <SmallButton tone="ink" disabled={busy} onClick={() => run({ action: "markPaid", id: b.id }, "Marked as paid.")}>Mark as paid</SmallButton>
            </div>
          </div>
        ) : null}
      </section>

      <section className="md:col-span-2">
        <h3 className="font-semibold">Decision</h3>
        {open ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-3 border border-line bg-surface p-4">
              <Field id={`rep-${b.id}`} label="Your name for the countersignature">
                <input id={`rep-${b.id}`} value={repName} onChange={(e) => setRepName(e.target.value)} className={inputClass} />
              </Field>
              <SmallButton
                tone="cobalt"
                disabled={busy || !b.agreementsSignedAt || repName.trim().length < 2}
                onClick={() => run({ action: "approve", id: b.id, repName: repName.trim() }, "Approved. The pickup address was sent to the renter.")}
              >
                {b.status === "approved" ? "Re-send approval and address" : "Approve and send pickup address"}
              </SmallButton>
              {!b.agreementsSignedAt ? <p className="text-sm text-subtle">Available once the renter signs.</p> : null}
            </div>
            <div className="space-y-3 border border-line bg-surface p-4">
              <Field id={`reason-${b.id}`} label="Reason (sent to the renter, optional)">
                <input id={`reason-${b.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <SmallButton tone="danger" disabled={busy} onClick={() => run({ action: "setStatus", id: b.id, status: "declined", reason: reason || undefined }, "Declined. The dates are open again.")}>Decline</SmallButton>
                <SmallButton tone="danger" disabled={busy} onClick={() => run({ action: "setStatus", id: b.id, status: "cancelled", reason: reason || undefined }, "Cancelled. The dates are open again.")}>Cancel</SmallButton>
                {b.status === "approved" ? <SmallButton tone="ghost" disabled={busy} onClick={() => run({ action: "setStatus", id: b.id, status: "completed" }, "Marked completed.")}>Mark completed</SmallButton> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-subtle">This reservation is {b.status}.</span>
            {b.status !== "completed" ? <SmallButton tone="ghost" disabled={busy} onClick={() => run({ action: "setStatus", id: b.id, status: "requested" }, "Reopened.")}>Reopen</SmallButton> : null}
          </div>
        )}
      </section>

      <section className="md:col-span-2">
        <h3 className="font-semibold">Pickup and return record</h3>
        <p className="mt-1 text-sm text-subtle">Saved into both agreement PDFs.</p>
        <form
          className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({
              action: "updateRecord", id: b.id,
              mileageOut: rec.mileageOut || null, fuelOut: rec.fuelOut || null, conditionNotes: rec.conditionNotes || null,
              mileageIn: rec.mileageIn || null, fuelIn: rec.fuelIn || null, actualReturnAt: rec.actualReturnAt || null,
              damageCents: toCents(rec.damage), feesCents: toCents(rec.fees), depositRefundedCents: toCents(rec.refunded),
              depositDeductedCents: toCents(rec.deducted), finalPaidCents: toCents(rec.finalPaid), notes: rec.notes || null,
            }, "Record saved and PDFs updated.");
          }}
        >
          {([
            ["mileageOut", "Mileage out"], ["fuelOut", "Fuel level out"], ["mileageIn", "Mileage in"], ["fuelIn", "Fuel level in"],
            ["actualReturnAt", "Actual return date/time"], ["damage", "Damage charges ($)"], ["fees", "Fees, taxes, other ($)"], ["finalPaid", "Final amount paid ($)"],
            ["refunded", "Deposit refunded ($)"], ["deducted", "Deposit deducted ($)"],
          ] as [keyof typeof rec, string][]).map(([k, label]) => (
            <Field key={k} id={`${k}-${b.id}`} label={label}>
              <input id={`${k}-${b.id}`} value={rec[k]} onChange={(e) => setR(k, e.target.value)} className={inputClass} />
            </Field>
          ))}
          <Field id={`cond-${b.id}`} label="Condition notes at pickup" className="sm:col-span-2">
            <textarea id={`cond-${b.id}`} rows={2} value={rec.conditionNotes} onChange={(e) => setR("conditionNotes", e.target.value)} className={`${inputClass} h-auto py-3`} />
          </Field>
          <Field id={`notes-${b.id}`} label="Private notes" className="sm:col-span-2">
            <textarea id={`notes-${b.id}`} rows={2} value={rec.notes} onChange={(e) => setR("notes", e.target.value)} className={`${inputClass} h-auto py-3`} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <SmallButton tone="ink" type="submit" disabled={busy}>Save record</SmallButton>
          </div>
        </form>
      </section>
    </div>
  );
}

type VehicleDraft = {
  id?: string; year: string; make: string; model: string; color: string; vin: string; plate: string; ownerName: string;
  tiers: string[]; deposit: string; lateFee: string; lateDaily: string; seats: string; transmission: string;
  fuel: string; description: string; photoUrl: string; active: boolean;
};

const DEFAULT_TIERS = [8500, 16000, 22500, 28000, 32500, 34500, 35000];

const draftFrom = (v?: AdminVehicle): VehicleDraft => ({
  id: v?.id, year: v ? String(v.year) : "", make: v?.make ?? "", model: v?.model ?? "", color: v?.color ?? "",
  vin: v?.vin ?? "", plate: v?.plate ?? "", ownerName: v?.ownerName ?? "",
  tiers: (v?.rateTable ?? DEFAULT_TIERS).map((c) => dollars(c)), deposit: dollars(v?.depositCents ?? 0),
  lateFee: dollars(v?.lateFeeCents ?? 2500), lateDaily: dollars(v?.lateDailyCents ?? 1000), seats: String(v?.seats ?? 5),
  transmission: v?.transmission ?? "Automatic", fuel: v?.fuel ?? "Gasoline", description: v?.description ?? "",
  photoUrl: v?.photoUrl ?? "", active: v ? v.active : true,
});

function VehicleForm({ vehicle, run, busy, onSaved, reload, setNotice }: {
  vehicle?: AdminVehicle; run: Run; busy: boolean; onSaved?: () => void; reload: () => Promise<void>; setNotice: (n: Notice) => void;
}) {
  const [d, setD] = useState<VehicleDraft>(() => draftFrom(vehicle));
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const idp = vehicle?.id ?? "new";

  async function save() {
    const tierCents = d.tiers.map(toCents);
    const cents = { deposit: toCents(d.deposit), lateFee: toCents(d.lateFee), lateDaily: toCents(d.lateDaily) };
    if (tierCents.some((c) => c === null) || Object.values(cents).some((c) => c === null)) {
      setNotice({ kind: "error", text: "Enter every rate as a dollar amount, for example 50 or 350.00" });
      return;
    }
    const ok = await run(
      {
        action: "saveVehicle",
        vehicle: {
          id: d.id, year: Number.parseInt(d.year, 10), make: d.make, model: d.model, color: d.color || undefined,
          vin: d.vin || undefined, plate: d.plate || undefined, ownerName: d.ownerName || undefined,
          dailyRateCents: tierCents[0], weeklyRateCents: tierCents[6], rateTable: tierCents as number[], depositCents: cents.deposit,
          lateFeeCents: cents.lateFee, lateDailyCents: cents.lateDaily, seats: Number.parseInt(d.seats, 10) || 5,
          transmission: d.transmission || undefined, fuel: d.fuel || undefined, description: d.description || undefined,
          photoUrl: d.photoUrl || undefined, active: d.active,
        },
      },
      vehicle ? "Car saved. New agreements use these details." : "Car added. It now shows on the site and calendar.",
    );
    if (ok && onSaved) onSaved();
  }

  async function upload(file: File) {
    if (!vehicle) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("vehicleId", vehicle.id);
      form.append("file", file);
      const res = await fetch("/api/admin", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      set("photoUrl", json.url);
      setNotice({ kind: "ok", text: "Photo uploaded." });
      await reload();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  const input = (k: keyof VehicleDraft, label: string, extra: { inputMode?: "numeric" | "decimal"; className?: string } = {}) => (
    <Field id={`${k}-${idp}`} label={label} className={extra.className}>
      <input id={`${k}-${idp}`} inputMode={extra.inputMode} value={String(d[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className={inputClass} />
    </Field>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {input("year", "Year", { inputMode: "numeric" })}
      {input("make", "Make")}
      {input("model", "Model")}
      {input("color", "Color")}
      {input("vin", "VIN", { className: "sm:col-span-2" })}
      {input("plate", "License plate (tag)")}
      {input("ownerName", "Vehicle owner (for the agreement)")}
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="text-sm font-medium">Price by rental length (total $)</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {d.tiers.map((t, i) => (
            <div key={i}>
              <label htmlFor={`tier-${i}-${idp}`} className="block text-xs text-subtle">{i + 1} day{i ? "s" : ""}</label>
              <input
                id={`tier-${i}-${idp}`}
                inputMode="decimal"
                value={t}
                onChange={(e) => setD((p) => ({ ...p, tiers: p.tiers.map((x, j) => (j === i ? e.target.value : x)) }))}
                className={`${inputClass} mt-1`}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">Rentals over 7 days: the 7-day price for each full week, plus the price for the remaining days.</p>
      </fieldset>
      {input("deposit", "Security deposit ($)", { inputMode: "decimal" })}
      {input("seats", "Seats", { inputMode: "numeric" })}
      {input("lateFee", "Late payment fee ($)", { inputMode: "decimal" })}
      {input("lateDaily", "Late fee per extra day ($)", { inputMode: "decimal" })}
      {input("transmission", "Transmission")}
      {input("fuel", "Fuel")}
      <Field id={`description-${idp}`} label="Description" className="sm:col-span-2 lg:col-span-4">
        <textarea id={`description-${idp}`} rows={2} value={d.description} onChange={(e) => set("description", e.target.value)} className={`${inputClass} h-auto py-3`} />
      </Field>
      {vehicle ? (
        <div className="sm:col-span-2">
          <label htmlFor={`photo-${idp}`} className="block text-sm font-medium">Photo</label>
          <div className="mt-2 flex items-center gap-4">
            {d.photoUrl ? <img src={d.photoUrl} alt="" className="h-16 w-24 border border-line object-cover" /> : <span className="text-sm text-subtle">No photo yet</span>}
            <input
              id={`photo-${idp}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
              className="text-sm file:mr-3 file:h-11 file:border-0 file:bg-ink file:px-4 file:font-medium file:text-surface"
            />
          </div>
        </div>
      ) : null}
      <div className="flex items-end sm:col-span-2">
        <Checkbox id={`active-${idp}`} checked={d.active} onChange={(v) => set("active", v)}>Show on the website and accept bookings</Checkbox>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <SmallButton tone="cobalt" disabled={busy || !d.make || !d.model || !d.year} onClick={save}>{vehicle ? "Save car" : "Add car"}</SmallButton>
      </div>
    </div>
  );
}

function Cars({ vehicles, run, busy, reload, setNotice }: { vehicles: AdminVehicle[]; run: Run; busy: boolean; reload: () => Promise<void>; setNotice: (n: Notice) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mt-6 space-y-6">
      {vehicles.map((v) => (
        <details key={v.id} className="border border-line bg-surface" open={!v.rateConfirmed || !v.vin}>
          <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="font-medium">{v.year} {v.make} {v.model}</span>
            <span className="flex flex-wrap gap-1.5">
              {!v.active ? <Badge tone="plain">Hidden</Badge> : null}
              {!v.rateConfirmed ? <Badge tone="warn">Confirm rates</Badge> : null}
              {!v.vin || !v.plate ? <Badge tone="warn">Add VIN and plate</Badge> : null}
              <Badge tone="info">{fmtMoney(v.dailyRateCents)}/day, {fmtMoney(v.weeklyRateCents)}/week</Badge>
            </span>
          </summary>
          <div className="border-t border-line p-4">
            <VehicleForm vehicle={v} run={run} busy={busy} reload={reload} setNotice={setNotice} />
          </div>
        </details>
      ))}
      {adding ? (
        <div className="border border-line bg-surface p-4">
          <h3 className="mb-4 font-semibold">Add a car</h3>
          <VehicleForm run={run} busy={busy} reload={reload} setNotice={setNotice} onSaved={() => setAdding(false)} />
        </div>
      ) : (
        <SmallButton tone="ink" onClick={() => setAdding(true)}>Add a car</SmallButton>
      )}
      <p className="text-sm text-subtle">New cars appear on the homepage, the calendar and in every new agreement automatically. Upload a photo after adding.</p>
    </div>
  );
}

function Blocked({ data, run, busy }: { data: AdminData; run: Run; busy: boolean }) {
  const [vehicleId, setVehicleId] = useState(data.vehicles[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const name = (id: string) => {
    const v = data.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : id;
  };
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-subtle">Block days when a car is in the shop or you're using it. Blocked days show as booked on the calendar.</p>
      <form
        className="grid gap-4 border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run({ action: "addBlackout", vehicleId, startDate: start, endDate: end || start, reason: reason || undefined }, "Dates blocked.");
          if (ok) { setStart(""); setEnd(""); setReason(""); }
        }}
      >
        <Field id="blk-car" label="Car">
          <select id="blk-car" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
            {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
          </select>
        </Field>
        <Field id="blk-start" label="From">
          <input id="blk-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field id="blk-end" label="Through">
          <input id="blk-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
        <Field id="blk-reason" label="Reason (private)">
          <input id="blk-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex items-end">
          <SmallButton tone="ink" type="submit" disabled={busy || !vehicleId || !start}>Block dates</SmallButton>
        </div>
      </form>
      {data.blackouts.length === 0 ? (
        <p className="text-subtle">No blocked dates.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {data.blackouts.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <span>
                <span className="font-medium">{name(b.vehicleId)}</span>: {prettyDay(b.startDate)} through {prettyDay(b.endDate)}
                {b.reason ? <span className="text-subtle"> ({b.reason})</span> : null}
              </span>
              <SmallButton tone="ghost" disabled={busy} onClick={() => run({ action: "removeBlackout", blackoutId: b.id }, "Dates unblocked.")}>Remove</SmallButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Emails({ data }: { data: AdminData }) {
  return (
    <div className="mt-6">
      {data.emails.length === 0 ? (
        <p className="text-subtle">No emails yet.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-subtle">
              <tr>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">To</th>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.emails.map((e) => (
                <tr key={e.id}>
                  <td className="p-3 whitespace-nowrap">{formatEt(e.createdAt.includes("T") ? e.createdAt : `${e.createdAt.replace(" ", "T")}Z`)}</td>
                  <td className="p-3">{e.to}</td>
                  <td className="p-3">{e.subject}</td>
                  <td className="p-3">
                    {e.status === "sent" ? <Badge tone="ok">Sent</Badge> : e.status === "skipped" ? <Badge tone="plain">Not sent (email off)</Badge> : <Badge tone="danger">Failed</Badge>}
                    {e.error && e.status === "failed" ? <span className="block text-xs text-danger">{e.error}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
