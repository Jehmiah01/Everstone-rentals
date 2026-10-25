// Orchestration around a reservation: agreement documents, PDFs, storage and
// the emails that go out at each step. Server-only.
import { agreementPlainText, buildEasySignAgreement, buildRentalAgreement, type AgreementContext, type AgreementDoc } from "./agreements";
import { COMPANY, PICKUP_ADDRESS, businessEmail } from "./config.server";
import { fmtMoney, formatEt, parseRateTable, prettyDay, fmtTime12 } from "./dates";
import { DRIVER_CLEARED, db, storage, type AdditionalDriver, type BookingBundle, type Vehicle } from "./db.server";
import { emailConfigured, emailShell, sendEmail } from "./email.server";
import { renderAgreementPdf, type SignatureInfo } from "./pdf.server";
import { squareConfigured } from "./square.server";
import type { CustomerBookingView, PublicVehicle } from "./types";

export const RENTAL_PDF = "motor-vehicle-rental-agreement.pdf";
export const EASY_PDF = "vehicle-rental-agreement.pdf";

export function bookingKey(id: string, file: string): string {
  return `bookings/${id}/${file}`;
}

export function toPublicVehicle(v: Vehicle): PublicVehicle {
  return {
    id: v.id, slug: v.slug, year: v.year, make: v.make, model: v.model, color: v.color,
    dailyRateCents: v.daily_rate_cents, weeklyRateCents: v.weekly_rate_cents, depositCents: v.deposit_cents,
    seats: v.seats, transmission: v.transmission, fuel: v.fuel, description: v.description, photoUrl: v.photo_url,
    rateConfirmed: v.rate_confirmed === 1,
    rateTable: parseRateTable(v.rate_table),
    driverFeeCents: v.driver_fee_cents ?? 0,
  };
}

export function agreementContext(b: BookingBundle): AgreementContext {
  const { booking, vehicle, customer } = b;
  const money = (c: number | null) => (c === null ? "" : fmtMoney(c));
  return {
    number: booking.id,
    company: { name: COMPANY.name, address: COMPANY.address },
    vehicle: {
      year: vehicle.year, make: vehicle.make, model: vehicle.model, vin: vehicle.vin ?? "", plate: vehicle.plate ?? "",
      ownerName: vehicle.owner_name ?? "", dailyCents: vehicle.daily_rate_cents, weeklyCents: vehicle.weekly_rate_cents,
      depositCents: booking.deposit_cents, lateFeeCents: vehicle.late_fee_cents, lateDailyCents: vehicle.late_daily_cents, rateTable: parseRateTable(vehicle.rate_table),
    },
    customer: {
      fullName: customer.full_name,
      address: `${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}`,
      phone: customer.phone, email: customer.email, dlNumber: customer.dl_number, dlState: customer.dl_state,
      dob: customer.dob, dlExpiration: customer.dl_expiration,
    },
    booking: {
      pickupDate: booking.pickup_date, pickupTime: booking.pickup_time, returnDate: booking.return_date, returnTime: booking.return_time,
      days: booking.days, breakdown: booking.rate_breakdown, totalCents: booking.total_cents,
      additionalDrivers: booking.additional_drivers ?? "",
      drivers: b.drivers.map((d) => ({
        fullName: d.full_name, phone: d.phone, dob: d.dob, dlNumber: d.dl_number, dlState: d.dl_state, dlExpiration: d.dl_expiration,
      })),
      paymentStatus: booking.payment_status, paidAt: booking.paid_at ? prettyDay(booking.paid_at.slice(0, 10)) : null,
      paymentMethod: booking.payment_status === "paid" ? "Square" : "Square (pending)",
      mileageOut: booking.mileage_out ?? "", fuelOut: booking.fuel_out ?? "", conditionNotes: booking.condition_notes ?? "",
      preRentalPhotos: Boolean(booking.condition_notes),
      actualReturn: booking.actual_return_at ?? "", mileageIn: booking.mileage_in ?? "", fuelIn: booking.fuel_in ?? "",
      damage: money(booking.damage_cents), fees: money(booking.fees_cents), depositRefunded: money(booking.deposit_refunded_cents),
      depositDeducted: money(booking.deposit_deducted_cents), finalPaid: money(booking.final_paid_cents),
    },
  };
}

export function agreementDocs(b: BookingBundle): { rental: AgreementDoc; easy: AgreementDoc } {
  const ctx = agreementContext(b);
  return { rental: buildRentalAgreement(ctx), easy: buildEasySignAgreement(ctx) };
}

export function customerUrl(origin: string, b: BookingBundle): string {
  return `${origin}/booking/${encodeURIComponent(b.booking.id)}?token=${b.booking.token}`;
}

/** Site-relative link to an additional driver's own ID check page. */
export function driverPath(driver: AdditionalDriver): string {
  return `/driver/${encodeURIComponent(driver.id)}?token=${driver.token}`;
}

/** Names of listed drivers who have not passed the ID check yet. */
export function driversNotCleared(b: BookingBundle): string[] {
  return b.drivers.filter((d) => !DRIVER_CLEARED.has(d.verification_status)).map((d) => d.full_name);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fileUrl(b: BookingBundle, file: string): string {
  return `/api/files/${bookingKey(b.booking.id, file)}?b=${encodeURIComponent(b.booking.id)}&t=${b.booking.token}`;
}

export async function loadSignature(b: BookingBundle): Promise<Uint8Array | null> {
  const obj = await storage().get(bookingKey(b.booking.id, "signature.jpg"));
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

/** Render both agreement PDFs from the current reservation state and store them. */
export async function regenerateAndStorePdfs(b: BookingBundle, signatureJpeg: Uint8Array | null): Promise<{ rental: Uint8Array; easy: Uint8Array }> {
  const docs = agreementDocs(b);
  const rentalRow = b.agreements.find((a) => a.kind === "rental");
  const easyRow = b.agreements.find((a) => a.kind === "easy_sign");
  const base: Omit<SignatureInfo, "docHash"> = {
    renterName: rentalRow?.signer_name ?? b.customer.full_name,
    initials: rentalRow?.initials ?? "",
    signedAt: rentalRow?.signed_at ? formatEt(rentalRow.signed_at) : "Not yet signed",
    ip: rentalRow?.ip ?? "",
    userAgent: rentalRow?.user_agent ?? "",
    signatureJpeg,
    repName: b.booking.rep_name,
    repSignedAt: b.booking.rep_signed_at ? formatEt(b.booking.rep_signed_at) : null,
  };
  const rental = renderAgreementPdf(docs.rental, { ...base, docHash: rentalRow?.doc_hash ?? "" }, COMPANY.name);
  const easy = renderAgreementPdf(docs.easy, { ...base, docHash: easyRow?.doc_hash ?? "" }, COMPANY.name);
  const rentalKey = bookingKey(b.booking.id, RENTAL_PDF);
  const easyKey = bookingKey(b.booking.id, EASY_PDF);
  await storage().put(rentalKey, rental, { httpMetadata: { contentType: "application/pdf" } });
  await storage().put(easyKey, easy, { httpMetadata: { contentType: "application/pdf" } });
  await db().prepare("UPDATE agreements SET pdf_key = ?1 WHERE booking_id = ?2 AND kind = 'rental'").bind(rentalKey, b.booking.id).run();
  await db().prepare("UPDATE agreements SET pdf_key = ?1 WHERE booking_id = ?2 AND kind = 'easy_sign'").bind(easyKey, b.booking.id).run();
  return { rental, easy };
}

export function docHashes(b: BookingBundle): { rental: string; easy: string } {
  const docs = agreementDocs(b);
  return { rental: agreementPlainText(docs.rental), easy: agreementPlainText(docs.easy) };
}

function summaryHtml(b: BookingBundle): string {
  const { booking, vehicle } = b;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 0;color:#5B6270">Agreement #</td><td style="padding:4px 0"><strong>${booking.id}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#5B6270">Vehicle</td><td style="padding:4px 0">${vehicle.year} ${vehicle.make} ${vehicle.model}</td></tr>
    <tr><td style="padding:4px 0;color:#5B6270">Pickup</td><td style="padding:4px 0">${prettyDay(booking.pickup_date)} at ${fmtTime12(booking.pickup_time)}</td></tr>
    <tr><td style="padding:4px 0;color:#5B6270">Return</td><td style="padding:4px 0">${prettyDay(booking.return_date)} at ${fmtTime12(booking.return_time)}</td></tr>
    <tr><td style="padding:4px 0;color:#5B6270">Total</td><td style="padding:4px 0">${fmtMoney(booking.total_cents)} (${booking.rate_breakdown})</td></tr>
    ${b.drivers.length > 0 ? `<tr><td style="padding:4px 0;color:#5B6270">Other drivers</td><td style="padding:4px 0">${b.drivers.map((d) => esc(d.full_name)).join(", ")}</td></tr>` : ""}
  </table>`;
}

function driversNoteHtml(b: BookingBundle): string {
  const waiting = b.drivers.filter((d) => !DRIVER_CLEARED.has(d.verification_status));
  if (waiting.length === 0) return "";
  return `<p>Each other driver also needs a one-time ID check: a photo of their license and a selfie holding it. You can upload them from your reservation page, or send each driver their own link from there.</p>`;
}

export async function sendBookingReceived(b: BookingBundle, origin: string) {
  const link = customerUrl(origin, b);
  await sendEmail({
    bookingId: b.booking.id,
    to: [b.customer.email],
    subject: `Reservation ${b.booking.id}: next, sign your rental agreements`,
    html: emailShell(
      `Thanks, ${b.customer.full_name.split(" ")[0] ?? ""}. Your request is in.`,
      `${summaryHtml(b)}<p>Next step: review and sign both rental agreements on your phone or computer, then pay through Square.</p>${driversNoteHtml(b)}
       <p><a href="${link}" style="display:inline-block;background:#C8102E;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">Open your reservation</a></p>
       <p style="font-size:13px;color:#5B6270">Keep this link; it is your private access to this reservation.</p>`,
    ),
  });
  await sendEmail({
    bookingId: b.booking.id,
    to: [businessEmail()],
    subject: `New reservation request ${b.booking.id}: ${b.customer.full_name}`,
    html: emailShell(
      "New reservation request",
      `${summaryHtml(b)}<p>Renter: ${b.customer.full_name}, ${b.customer.phone}, ${b.customer.email}</p><p>Open the dashboard at <a href="${origin}/admin">${origin}/admin</a> to approve.</p>`,
    ),
  });
}

export async function sendSignedAgreements(b: BookingBundle, pdfs: { rental: Uint8Array; easy: Uint8Array }, origin: string) {
  const attachments = [
    { filename: `${b.booking.id}-motor-vehicle-rental-agreement.pdf`, content: pdfs.rental },
    { filename: `${b.booking.id}-vehicle-rental-agreement.pdf`, content: pdfs.easy },
  ];
  const link = customerUrl(origin, b);
  await sendEmail({
    bookingId: b.booking.id,
    to: [b.customer.email],
    subject: `Signed: rental agreements ${b.booking.id}`,
    html: emailShell(
      "Your signed agreements",
      `${summaryHtml(b)}<p>Both agreements are attached as PDFs with your electronic signature and timestamp.</p><p><a href="${link}">Open your reservation</a> to pay and upload your license photo.</p>`,
    ),
    attachments,
  });
  await sendEmail({
    bookingId: b.booking.id,
    to: [businessEmail()],
    subject: `Agreements signed ${b.booking.id}: ${b.customer.full_name}`,
    html: emailShell("Agreements signed", `${summaryHtml(b)}<p>Copies attached and saved under this reservation in the dashboard.</p>`),
    attachments,
  });
  await db()
    .prepare("UPDATE agreements SET sent_at = ?1, send_count = send_count + 1 WHERE booking_id = ?2")
    .bind(new Date().toISOString(), b.booking.id)
    .run();
}

export async function sendApproval(b: BookingBundle, origin: string) {
  const link = customerUrl(origin, b);
  await sendEmail({
    bookingId: b.booking.id,
    to: [b.customer.email],
    subject: `Approved: ${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}, pickup ${prettyDay(b.booking.pickup_date)}`,
    html: emailShell(
      "You're approved. Here is where to pick up.",
      `${summaryHtml(b)}<p style="font-size:17px"><strong>Pickup address:</strong><br>${PICKUP_ADDRESS}</p>
       <p>Bring the physical driver's license you entered. Before you get the keys, upload a photo of your license and a selfie holding it from your reservation page if you have not already.</p>
       <p><a href="${link}" style="display:inline-block;background:#C8102E;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">Open your reservation</a></p>`,
    ),
  });
  await db().prepare("UPDATE bookings SET address_sent_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), b.booking.id).run();
}

export async function sendAgreementReminder(b: BookingBundle, origin: string) {
  const link = `${origin}/booking/${encodeURIComponent(b.booking.id)}/sign?token=${b.booking.token}`;
  await sendEmail({
    bookingId: b.booking.id,
    to: [b.customer.email],
    subject: `Reminder: sign your rental agreements for ${b.booking.id}`,
    html: emailShell(
      "Your agreements are waiting for a signature",
      `${summaryHtml(b)}<p><a href="${link}" style="display:inline-block;background:#C8102E;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">Review and sign</a></p>`,
    ),
  });
  await db()
    .prepare("UPDATE agreements SET sent_at = ?1, send_count = send_count + 1 WHERE booking_id = ?2")
    .bind(new Date().toISOString(), b.booking.id)
    .run();
}

export function customerView(b: BookingBundle): CustomerBookingView {
  const { booking, vehicle, customer, agreements, verification } = b;
  const approved = booking.status === "approved" || booking.status === "completed";
  return {
    id: booking.id,
    token: booking.token,
    status: booking.status,
    paymentStatus: booking.payment_status,
    paymentLink: booking.payment_link,
    paidAt: booking.paid_at,
    agreementsSignedAt: booking.agreements_signed_at,
    verificationStatus: booking.verification_status,
    pickupDate: booking.pickup_date, returnDate: booking.return_date, pickupTime: booking.pickup_time, returnTime: booking.return_time,
    days: booking.days, breakdown: booking.rate_breakdown, totalCents: booking.total_cents, depositCents: booking.deposit_cents,
    additionalDrivers: booking.additional_drivers,
    vehicle: toPublicVehicle(vehicle),
    customer: {
      fullName: customer.full_name, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city,
      state: customer.state, zip: customer.zip, dob: customer.dob, dlNumber: customer.dl_number, dlState: customer.dl_state,
      dlExpiration: customer.dl_expiration,
    },
    pickupAddress: approved ? PICKUP_ADDRESS : null,
    agreements: agreements.map((a) => ({
      kind: a.kind,
      status: a.status,
      signedAt: a.signed_at,
      pdfUrl: a.pdf_key ? `/api/files/${a.pdf_key}?b=${encodeURIComponent(booking.id)}&t=${booking.token}` : null,
    })),
    verification: verification
      ? {
          status: verification.status,
          licenseUrl: verification.license_key ? `/api/files/${verification.license_key}?b=${encodeURIComponent(booking.id)}&t=${booking.token}` : null,
          selfieUrl: verification.selfie_key ? `/api/files/${verification.selfie_key}?b=${encodeURIComponent(booking.id)}&t=${booking.token}` : null,
        }
      : null,
    drivers: b.drivers.map((d) => ({ id: d.id, fullName: d.full_name, verificationStatus: d.verification_status, link: driverPath(d) })),
    squareReady: squareConfigured(),
    emailReady: emailConfigured(),
    createdAt: booking.created_at,
  };
}
