// Rental extensions the renter starts on their reservation page. The new return
// day is held as a request (ext_req_*) and only applied once its Square payment
// completes (webhook or the page's check when the renter comes back). Server-only.
import { customerUrl, loadSignature, regenerateAndStorePdfs } from "./bookings.server";
import { businessEmail } from "./config.server";
import { addDays, diffDays, fmtMoney, fmtTime12, parseRateTable, prettyDay, priceVehicle, todayDay } from "./dates";
import { db, getBookingBundle, unavailableDates, type BookingBundle } from "./db.server";
import { emailShell, sendEmail } from "./email.server";
import { refundPayment } from "./square.server";

/** Most days a renter can add online in one go. */
export const MAX_EXTENSION_DAYS = 30;

const isOpen = (status: string) => status === "requested" || status === "approved";
const carName = (b: BookingBundle) => `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}`;

/** An extension the owner made from the dashboard that is still waiting for payment. */
export function ownerExtensionDue(bk: BookingBundle["booking"]): boolean {
  return (bk.extension_cents ?? 0) > 0 && Boolean(bk.extension_link) && !bk.extension_paid_at;
}

/** The latest day this renter can extend to online, or why they can't. */
export async function extensionOffer(b: BookingBundle): Promise<{ maxDate: string | null; note: string | null }> {
  const bk = b.booking;
  if (!isOpen(bk.status) || !bk.agreements_signed_at || bk.payment_status !== "paid" || ownerExtensionDue(bk)) {
    return { maxDate: null, note: null };
  }
  const ask = "Reply to your confirmation email to ask about more time.";
  if (todayDay() > bk.return_date) return { maxDate: null, note: `Your scheduled return day has passed. ${ask}` };
  let max = addDays(bk.return_date, MAX_EXTENSION_DAYS);
  for (const exp of [b.customer.dl_expiration, ...b.drivers.map((d) => d.dl_expiration)]) {
    const last = addDays(exp, -1);
    if (last < max) max = last;
  }
  if (max <= bk.return_date) return { maxDate: null, note: `A driver's license on this reservation expires before it could be extended. ${ask}` };
  const from = addDays(bk.return_date, 1);
  const busy = ((await unavailableDates(from, max))[bk.vehicle_id] ?? []).filter((d) => d >= from).sort();
  if (busy[0] && addDays(busy[0], -1) < max) max = addDays(busy[0], -1);
  if (max <= bk.return_date) return { maxDate: null, note: `The car is booked right after your rental, so it can't be extended online. ${ask}` };
  return { maxDate: max, note: null };
}

/** Price of the added days, from the car's current price table. */
export function extensionPrice(b: BookingBundle, newReturn: string): { days: number; cents: number } {
  const days = diffDays(b.booking.return_date, newReturn);
  const p = priceVehicle(days, {
    rateTable: parseRateTable(b.vehicle.rate_table),
    dailyRateCents: b.vehicle.daily_rate_cents,
    weeklyRateCents: b.vehicle.weekly_rate_cents,
  });
  return { days, cents: p.total_cents };
}

async function refreshPdfs(id: string) {
  const fresh = await getBookingBundle(id);
  if (fresh?.booking.agreements_signed_at) {
    try {
      await regenerateAndStorePdfs(fresh, await loadSignature(fresh));
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Apply the renter's paid extension. Safe to call more than once (webhook and
 * page check): only the first call for an order changes anything. If another
 * reservation took the days in the meantime, the payment is refunded instead.
 */
export async function applyPaidExtension(bookingId: string, orderId: string, origin: string): Promise<"applied" | "refunded" | "none"> {
  const b = await getBookingBundle(bookingId);
  if (!b) return "none";
  const bk = b.booking;
  if (!bk.ext_req_order_id || bk.ext_req_order_id !== orderId || !bk.ext_req_date) return "none";
  const now = new Date().toISOString();
  const cents = bk.ext_req_cents ?? 0;
  const newReturn = bk.ext_req_date;
  const newTime = bk.ext_req_time ?? bk.return_time;
  const link = customerUrl(origin, b);

  const clash =
    newReturn <= bk.return_date ||
    !isOpen(bk.status) ||
    Boolean(
      await db()
        .prepare("SELECT id FROM bookings WHERE vehicle_id = ?1 AND id != ?2 AND status IN ('requested','approved') AND return_date >= ?3 AND pickup_date <= ?4 LIMIT 1")
        .bind(bk.vehicle_id, bk.id, addDays(bk.return_date, 1), newReturn)
        .first<{ id: string }>(),
    );

  if (clash) {
    const cleared = await db()
      .prepare("UPDATE bookings SET ext_req_date = NULL, ext_req_time = NULL, ext_req_cents = NULL, ext_req_link = NULL, ext_req_link_id = NULL, ext_req_order_id = NULL, ext_req_at = NULL WHERE id = ?1 AND ext_req_order_id = ?2")
      .bind(bk.id, orderId)
      .run();
    if (!cleared.meta.changes) return "none";
    let refunded = false;
    try {
      await refundPayment({ paymentId: null, orderId, amountCents: cents, reason: `Extension for ${bk.id} could not be added`, idempotencyKey: `extrf-${orderId}` });
      refunded = true;
    } catch (err) {
      console.error(err);
    }
    await sendEmail({
      bookingId: bk.id,
      to: [b.customer.email],
      subject: "We couldn't extend your rental",
      html: emailShell(
        "We couldn't extend your rental",
        `<p>The ${carName(b)} was booked by someone else for those days just before your payment went through, so your rental still ends <strong>${prettyDay(bk.return_date)} at ${fmtTime12(bk.return_time)}</strong>.</p><p>${refunded ? `Your ${fmtMoney(cents)} was refunded to your card. It can take a few business days to show.` : `We will refund your ${fmtMoney(cents)}.`}</p><p>Questions? Reply to this email.</p>`,
      ),
    });
    await sendEmail({
      bookingId: bk.id,
      to: [businessEmail()],
      subject: refunded ? `Extension refunded: ${b.customer.full_name}` : `Refund needed: ${b.customer.full_name}'s extension`,
      html: emailShell(
        refunded ? "Extension payment refunded" : "Refund needed",
        `<p>${b.customer.full_name} paid ${fmtMoney(cents)} to extend reservation ${bk.id} to ${prettyDay(newReturn)}, but the car was already booked for some of those days.</p><p>${refunded ? "The payment was refunded automatically through Square." : "The automatic refund didn't go through. Please refund it in your Square app."}</p>`,
      ),
    });
    return "refunded";
  }

  const res = await db()
    .prepare(
      `UPDATE bookings SET original_return_date = COALESCE(original_return_date, return_date), original_return_time = COALESCE(original_return_time, return_time),
        return_date = ext_req_date, return_time = COALESCE(ext_req_time, return_time), extended_at = ?1, extension_by = 'renter',
        extension_cents = COALESCE(extension_cents, 0) + COALESCE(ext_req_cents, 0), extension_link = ext_req_link, extension_link_cents = ext_req_cents,
        extension_order_id = ext_req_order_id, extension_paid_at = ?1,
        ext_req_date = NULL, ext_req_time = NULL, ext_req_cents = NULL, ext_req_link = NULL, ext_req_link_id = NULL, ext_req_order_id = NULL, ext_req_at = NULL
       WHERE id = ?2 AND ext_req_order_id = ?3`,
    )
    .bind(now, bk.id, orderId)
    .run();
  if (!res.meta.changes) return "none";
  await refreshPdfs(bk.id);

  const was = `${prettyDay(bk.return_date)} at ${fmtTime12(bk.return_time)}`;
  const due = `${prettyDay(newReturn)} at ${fmtTime12(newTime)}`;
  await sendEmail({
    bookingId: bk.id,
    to: [b.customer.email],
    subject: `Your rental is extended to ${prettyDay(newReturn)}`,
    html: emailShell(
      "Your rental is extended",
      `<p>Thanks, we received your ${fmtMoney(cents)} payment. Your ${carName(b)} is now due back <strong>${due}</strong>. It was due ${was}.</p><p>Everything else in your rental agreement stays the same. <a href="${link}">Open your reservation</a></p><p>Questions? Reply to this email.</p>`,
    ),
  });
  await sendEmail({
    bookingId: bk.id,
    to: [businessEmail()],
    subject: `${b.customer.full_name} extended to ${prettyDay(newReturn)} and paid ${fmtMoney(cents)}`,
    html: emailShell(
      "A renter extended online",
      `<p>${b.customer.full_name} extended reservation ${bk.id} (${carName(b)}) and paid <strong>${fmtMoney(cents)}</strong> through Square.</p><p>New return: <strong>${due}</strong>. It was ${was}.</p><p>The car stays booked through the new day. Nothing else to do.</p>`,
    ),
  });
  return "applied";
}

/** A dashboard extension link was paid: mark it, update the PDFs and tell both sides. */
export async function markOwnerExtensionPaid(orderId: string, origin: string): Promise<boolean> {
  const row = await db()
    .prepare("SELECT id FROM bookings WHERE extension_order_id = ?1 AND extension_paid_at IS NULL LIMIT 1")
    .bind(orderId)
    .first<{ id: string }>();
  if (!row) return false;
  const r = await db()
    .prepare("UPDATE bookings SET extension_paid_at = ?1 WHERE id = ?2 AND extension_paid_at IS NULL")
    .bind(new Date().toISOString(), row.id)
    .run();
  if (!r.meta.changes) return false;
  await refreshPdfs(row.id);
  const b = await getBookingBundle(row.id);
  if (b) {
    const amount = fmtMoney(b.booking.extension_link_cents ?? b.booking.extension_cents);
    const due = `${prettyDay(b.booking.return_date)} at ${fmtTime12(b.booking.return_time)}`;
    await sendEmail({
      bookingId: b.booking.id,
      to: [b.customer.email],
      subject: "Payment received for your extension",
      html: emailShell(
        "Payment received",
        `<p>Thanks, we received your ${amount} payment. Your ${carName(b)} is due back <strong>${due}</strong>.</p><p><a href="${customerUrl(origin, b)}">Open your reservation</a></p>`,
      ),
    });
    await sendEmail({
      bookingId: b.booking.id,
      to: [businessEmail()],
      subject: `${b.customer.full_name} paid ${amount} for the extension`,
      html: emailShell(
        "Extension paid",
        `<p>${b.customer.full_name} paid <strong>${amount}</strong> for the extension on reservation ${b.booking.id} (${carName(b)}).</p><p>Due back ${due}.</p>`,
      ),
    });
  }
  return true;
}
