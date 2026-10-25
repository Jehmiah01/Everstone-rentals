// Owner dashboard API. GET returns everything the dashboard shows; POST runs
// one action. Every action except login requires the admin session cookie.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BRAND } from "@/lib/brand";
import { adminConfigured, checkPassword, clearSessionCookie, issueSession, sessionCookie, verifySession } from "@/lib/auth.server";
import { driverPath, driversNotCleared, loadSignature, regenerateAndStorePdfs, sendAgreementReminder, sendApproval, sendSignedAgreements } from "@/lib/bookings.server";
import { isValidDay, parseRateTable } from "@/lib/dates";
import { db, getBookingBundle, newId, storage, type AdditionalDriver, type Agreement, type Booking, type Vehicle, type Verification } from "@/lib/db.server";
import { emailConfigured, emailShell, sendEmail } from "@/lib/email.server";
import { refundPayment, squareConfigured } from "@/lib/square.server";
import type { AdminBooking, AdminData, AdminVehicle } from "@/lib/types";

const json = (body: unknown, status = 200, headers?: Record<string, string>) => Response.json(body, { status, headers });
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

type BookingRow = Booking & {
  c_name: string; c_email: string; c_phone: string; c_address: string; c_city: string; c_state: string; c_zip: string;
  c_dob: string; c_dl: string; c_dl_state: string; c_dl_exp: string; c_verified_at: string | null;
  v_year: number; v_make: string; v_model: string;
};
type BlackoutRow = { id: string; vehicle_id: string; start_date: string; end_date: string; reason: string | null };
type EmailRow = { id: string; booking_id: string | null; to_email: string; subject: string; status: string; error: string | null; created_at: string };

function toAdminVehicle(v: Vehicle): AdminVehicle {
  return {
    id: v.id, slug: v.slug, year: v.year, make: v.make, model: v.model, color: v.color, vin: v.vin, plate: v.plate,
    ownerName: v.owner_name, dailyRateCents: v.daily_rate_cents, weeklyRateCents: v.weekly_rate_cents,
    depositCents: v.deposit_cents, lateFeeCents: v.late_fee_cents, lateDailyCents: v.late_daily_cents, seats: v.seats,
    transmission: v.transmission, fuel: v.fuel, description: v.description, photoUrl: v.photo_url,
    active: v.active === 1, rateConfirmed: v.rate_confirmed === 1, rateTable: parseRateTable(v.rate_table),
    driverFeeCents: v.driver_fee_cents ?? 0, driverFeeCapCents: v.driver_fee_cap_cents ?? 0,
  };
}

async function loadAdminData(origin: string): Promise<AdminData> {
  const rows = (
    await db()
      .prepare(
        `SELECT b.*, c.full_name AS c_name, c.email AS c_email, c.phone AS c_phone, c.address AS c_address, c.city AS c_city,
          c.state AS c_state, c.zip AS c_zip, c.dob AS c_dob, c.dl_number AS c_dl, c.dl_state AS c_dl_state,
          c.dl_expiration AS c_dl_exp, c.verified_at AS c_verified_at, v.year AS v_year, v.make AS v_make, v.model AS v_model
         FROM bookings b JOIN customers c ON c.id = b.customer_id JOIN vehicles v ON v.id = b.vehicle_id
         ORDER BY b.created_at DESC LIMIT 300`,
      )
      .all<BookingRow>()
  ).results;
  const agreements = (await db().prepare("SELECT * FROM agreements ORDER BY created_at DESC LIMIT 1000").all<Agreement>()).results;
  const verifications = (await db().prepare("SELECT * FROM verifications ORDER BY created_at DESC LIMIT 1000").all<Verification>()).results;
  const vehicles = (await db().prepare("SELECT * FROM vehicles ORDER BY created_at ASC").all<Vehicle>()).results;
  const blackouts = (await db().prepare("SELECT * FROM blackouts ORDER BY start_date ASC LIMIT 500").all<BlackoutRow>()).results;
  const emails = (await db().prepare("SELECT * FROM email_log ORDER BY created_at DESC LIMIT 60").all<EmailRow>()).results;
  const driverRows = (
    await db().prepare("SELECT * FROM additional_drivers ORDER BY booking_id ASC, position ASC LIMIT 3000").all<AdditionalDriver>()
  ).results;

  const latestVerification = new Map<string, Verification>();
  for (const v of verifications) if (!latestVerification.has(v.booking_id)) latestVerification.set(v.booking_id, v);
  const driversByBooking = new Map<string, AdditionalDriver[]>();
  for (const d of driverRows) {
    const list = driversByBooking.get(d.booking_id) ?? [];
    list.push(d);
    driversByBooking.set(d.booking_id, list);
  }
  const file = (key: string | null) => (key ? `/api/files/${key}` : null);

  const bookings: AdminBooking[] = rows.map((r) => {
    const ver = latestVerification.get(r.id);
    return {
      id: r.id, token: r.token, status: r.status, paymentStatus: r.payment_status, paymentLink: r.payment_link, paidAt: r.paid_at,
      agreementsSignedAt: r.agreements_signed_at, verificationStatus: r.verification_status, addressSentAt: r.address_sent_at,
      approvedAt: r.approved_at, repName: r.rep_name, pickupDate: r.pickup_date, returnDate: r.return_date,
      pickupTime: r.pickup_time, returnTime: r.return_time, days: r.days, breakdown: r.rate_breakdown, totalCents: r.total_cents,
      depositCents: r.deposit_cents, additionalDrivers: r.additional_drivers, createdAt: r.created_at,
      mileageOut: r.mileage_out, fuelOut: r.fuel_out, conditionNotes: r.condition_notes, mileageIn: r.mileage_in, fuelIn: r.fuel_in,
      actualReturnAt: r.actual_return_at, damageCents: r.damage_cents, feesCents: r.fees_cents,
      depositRefundedCents: r.deposit_refunded_cents, depositDeductedCents: r.deposit_deducted_cents,
      finalPaidCents: r.final_paid_cents, notes: r.notes, refundedCents: r.refunded_cents, refundedAt: r.refunded_at,
      vehicleId: r.vehicle_id, vehicleName: `${r.v_year} ${r.v_make} ${r.v_model}`,
      customer: {
        name: r.c_name, email: r.c_email, phone: r.c_phone, address: `${r.c_address}, ${r.c_city}, ${r.c_state} ${r.c_zip}`,
        dob: r.c_dob, dlNumber: r.c_dl, dlState: r.c_dl_state, dlExpiration: r.c_dl_exp, verifiedAt: r.c_verified_at,
      },
      agreements: agreements
        .filter((a) => a.booking_id === r.id)
        .map((a) => ({
          kind: a.kind, status: a.status, signedAt: a.signed_at, signerName: a.signer_name, ip: a.ip,
          pdfUrl: file(a.pdf_key), sentAt: a.sent_at, sendCount: a.send_count,
        })),
      verification: ver
        ? { status: ver.status, licenseUrl: file(ver.license_key), selfieUrl: file(ver.selfie_key), createdAt: ver.created_at, notes: ver.notes }
        : null,
      drivers: (driversByBooking.get(r.id) ?? []).map((d) => ({
        id: d.id, fullName: d.full_name, phone: d.phone, dob: d.dob, dlNumber: d.dl_number, dlState: d.dl_state,
        dlExpiration: d.dl_expiration, verificationStatus: d.verification_status, licenseUrl: file(d.license_key),
        selfieUrl: file(d.selfie_key), submittedAt: d.submitted_at, notes: d.notes, link: `${origin}${driverPath(d)}`,
      })),
      customerLink: `${origin}/booking/${encodeURIComponent(r.id)}?token=${r.token}`,
    };
  });

  return {
    bookings,
    vehicles: vehicles.map(toAdminVehicle),
    blackouts: blackouts.map((b) => ({ id: b.id, vehicleId: b.vehicle_id, startDate: b.start_date, endDate: b.end_date, reason: b.reason })),
    emails: emails.map((e) => ({ id: e.id, bookingId: e.booking_id, to: e.to_email, subject: e.subject, status: e.status, error: e.error, createdAt: e.created_at })),
    config: { square: squareConfigured(), email: emailConfigured() },
  };
}

const idField = z.string().min(1).max(40);
const cents = z.number().int().min(0).max(10_000_000);
const optText = z.string().trim().max(500).nullable().optional();
const optCents = cents.nullable().optional();
const day = z.string().refine(isValidDay, "Enter a valid date");

const vehicleSchema = z.object({
  id: z.string().max(40).optional(),
  year: z.number().int().min(1980).max(2100),
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(40),
  color: z.string().trim().max(40).optional(),
  vin: z.string().trim().max(17).optional(),
  plate: z.string().trim().max(12).optional(),
  ownerName: z.string().trim().max(120).optional(),
  dailyRateCents: cents,
  weeklyRateCents: cents,
  depositCents: cents,
  lateFeeCents: cents,
  lateDailyCents: cents,
  seats: z.number().int().min(1).max(15).optional(),
  transmission: z.string().trim().max(30).optional(),
  fuel: z.string().trim().max(30).optional(),
  description: z.string().trim().max(600).optional(),
  photoUrl: z.string().trim().max(300).optional(),
  rateTable: z.array(cents).length(7).optional(),
  driverFeeCents: cents.optional(),
  driverFeeCapCents: cents.optional(),
  active: z.boolean(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("approve"), id: idField, repName: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("setStatus"), id: idField, status: z.enum(["requested", "declined", "cancelled", "completed"]), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("markPaid"), id: idField }),
  z.object({ action: z.literal("refund"), id: idField, reason: z.string().trim().max(190).optional() }),
  z.object({ action: z.literal("setPaymentLink"), id: idField, url: z.string().url().max(500) }),
  z.object({ action: z.literal("resendAgreements"), id: idField }),
  z.object({ action: z.literal("reviewVerification"), id: idField, decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reviewDriver"), driverId: idField, decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal("updateRecord"), id: idField,
    mileageOut: optText, fuelOut: optText, conditionNotes: optText, mileageIn: optText, fuelIn: optText, actualReturnAt: optText,
    damageCents: optCents, feesCents: optCents, depositRefundedCents: optCents, depositDeductedCents: optCents, finalPaidCents: optCents,
    notes: optText,
  }),
  z.object({ action: z.literal("saveVehicle"), vehicle: vehicleSchema }),
  z.object({ action: z.literal("addBlackout"), vehicleId: idField, startDate: day, endDate: day, reason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("removeBlackout"), blackoutId: idField }),
]);

async function refreshPdfs(id: string) {
  const b = await getBookingBundle(id);
  if (b?.booking.agreements_signed_at) await regenerateAndStorePdfs(b, await loadSignature(b));
  return b;
}

async function uniqueSlug(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vehicle";
  let slug = clean;
  for (let n = 2; n < 50; n++) {
    const taken = await db().prepare("SELECT id FROM vehicles WHERE slug = ?1").bind(slug).first<{ id: string }>();
    if (!taken) return slug;
    slug = `${clean}-${n}`;
  }
  return `${clean}-${Date.now()}`;
}

async function uploadVehiclePhoto(form: FormData): Promise<Response> {
  const vehicleId = String(form.get("vehicleId") ?? "");
  const file = form.get("file");
  const vehicle = await db().prepare("SELECT id FROM vehicles WHERE id = ?1").bind(vehicleId).first<{ id: string }>();
  if (!vehicle) return fail("Vehicle not found", 404);
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo");
  if (file.size > 8 * 1024 * 1024) return fail("Photos must be under 8 MB");
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[file.type];
  if (!ext) return fail("Photos must be JPG, PNG or WEBP");
  const key = `vehicles/${vehicleId}-${Date.now()}.${ext}`;
  await storage().put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const url = `/api/files/${key}`;
  await db().prepare("UPDATE vehicles SET photo_url = ?1 WHERE id = ?2").bind(url, vehicleId).run();
  return json({ ok: true, url });
}

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!(await verifySession(request))) return json({ ok: false, authed: false, configured: adminConfigured() }, 401);
          return json({ ok: true, authed: true, data: await loadAdminData(new URL(request.url).origin) });
        } catch (err) {
          console.error(err);
          return fail(err instanceof Error ? err.message : "Could not load the dashboard", 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const origin = new URL(request.url).origin;
          if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
            if (!(await verifySession(request))) return fail("Please log in", 401);
            return await uploadVehiclePhoto(await request.formData());
          }
          const parsed = actionSchema.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request");
          const a = parsed.data;

          if (a.action === "login") {
            if (!adminConfigured()) return fail("Set ADMIN_PASSWORD in the website settings first, then redeploy");
            if (!(await checkPassword(a.password))) {
              await new Promise((r) => setTimeout(r, 700));
              return fail("Wrong password", 401);
            }
            return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(await issueSession()) });
          }
          if (a.action === "logout") return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
          if (!(await verifySession(request))) return fail("Please log in", 401);

          const now = new Date().toISOString();
          switch (a.action) {
            case "approve": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              if (!b.booking.agreements_signed_at) return fail("The renter has not signed the agreements yet");
              if (!["requested", "approved"].includes(b.booking.status)) return fail("Only open reservations can be approved");
              const waiting = driversNotCleared(b);
              if (waiting.length > 0) {
                return fail(`Approve every other driver's ID first. Still waiting on: ${waiting.join(", ")}`);
              }
              await db()
                .prepare("UPDATE bookings SET status = 'approved', approved_at = COALESCE(approved_at, ?1), rep_name = ?2, rep_signed_at = COALESCE(rep_signed_at, ?1) WHERE id = ?3")
                .bind(now, a.repName, a.id)
                .run();
              const fresh = await refreshPdfs(a.id);
              if (fresh) await sendApproval(fresh, origin);
              return json({ ok: true, emailed: emailConfigured() });
            }
            case "setStatus": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              await db().prepare("UPDATE bookings SET status = ?1 WHERE id = ?2").bind(a.status, a.id).run();
              if (a.status === "declined" || a.status === "cancelled") {
                await sendEmail({
                  bookingId: a.id,
                  to: [b.customer.email],
                  subject: `Reservation ${a.id} ${a.status}`,
                  html: emailShell(
                    `Your reservation was ${a.status}`,
                    `<p>Reservation ${a.id} for the ${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model} was ${a.status}.</p>${a.reason ? `<p>${a.reason.replace(/</g, "&lt;")}</p>` : ""}<p>Questions? Reply to this email.</p>`,
                  ),
                });
              }
              return json({ ok: true });
            }
            case "markPaid": {
              await db().prepare("UPDATE bookings SET payment_status = 'paid', paid_at = COALESCE(paid_at, ?1) WHERE id = ?2").bind(now, a.id).run();
              await refreshPdfs(a.id);
              return json({ ok: true });
            }
            case "refund": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              if (b.booking.payment_status !== "paid") return fail("Only paid reservations can be refunded");
              if (!squareConfigured()) return fail("Square is not connected here, so refund it in your Square app instead");
              const amount = b.booking.total_cents + b.booking.deposit_cents;
              const refund = await refundPayment({
                paymentId: b.booking.square_payment_id,
                orderId: b.booking.square_order_id,
                amountCents: amount,
                reason: a.reason || `Refund for reservation ${a.id}`,
                idempotencyKey: `refund-${a.id}`,
              });
              await db()
                .prepare("UPDATE bookings SET payment_status = 'refunded', refunded_cents = ?1, refund_id = ?2, refunded_at = ?3 WHERE id = ?4")
                .bind(amount, refund.id, now, a.id)
                .run();
              return json({ ok: true, refundStatus: refund.status });
            }
            case "setPaymentLink": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              await db()
                .prepare("UPDATE bookings SET payment_link = ?1, payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'link_sent' END WHERE id = ?2")
                .bind(a.url, a.id)
                .run();
              await sendEmail({
                bookingId: a.id,
                to: [b.customer.email],
                subject: `Pay for reservation ${a.id} with Square`,
                html: emailShell("Your Square payment link", `<p><a href="${a.url}" style="display:inline-block;background:${BRAND.cobalt};color:white;padding:12px 18px;text-decoration:none;font-weight:600">Pay with Square</a></p>`),
              });
              return json({ ok: true, emailed: emailConfigured() });
            }
            case "resendAgreements": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              if (b.booking.agreements_signed_at) {
                const pdfs = await regenerateAndStorePdfs(b, await loadSignature(b));
                await sendSignedAgreements(b, pdfs, origin);
                return json({ ok: true, sent: "signed", emailed: emailConfigured() });
              }
              await sendAgreementReminder(b, origin);
              return json({ ok: true, sent: "reminder", emailed: emailConfigured() });
            }
            case "reviewVerification": {
              const b = await getBookingBundle(a.id);
              if (!b) return fail("Reservation not found", 404);
              if (!b.verification) return fail("No ID photos have been uploaded for this reservation");
              const approved = a.decision === "approve";
              await db().batch([
                db().prepare("UPDATE verifications SET status = ?1, reviewed_at = ?2, notes = ?3 WHERE id = ?4").bind(approved ? "approved" : "rejected", now, a.notes ?? null, b.verification.id),
                db().prepare("UPDATE bookings SET verification_status = ?1 WHERE id = ?2").bind(approved ? "approved" : "rejected", a.id),
                ...(approved ? [db().prepare("UPDATE customers SET verified_at = ?1 WHERE id = ?2").bind(now, b.customer.id)] : []),
              ]);
              if (!approved) {
                await sendEmail({
                  bookingId: a.id,
                  to: [b.customer.email],
                  subject: `Please re-upload your license photos for ${a.id}`,
                  html: emailShell(
                    "We need clearer ID photos",
                    `${a.notes ? `<p>${a.notes.replace(/</g, "&lt;")}</p>` : ""}<p><a href="${origin}/booking/${encodeURIComponent(a.id)}?token=${b.booking.token}">Open your reservation</a> to upload a new license photo and selfie.</p>`,
                  ),
                });
              }
              return json({ ok: true });
            }
            case "reviewDriver": {
              const driver = await db().prepare("SELECT * FROM additional_drivers WHERE id = ?1").bind(a.driverId).first<AdditionalDriver>();
              if (!driver) return fail("Driver not found", 404);
              if (!driver.license_key || !driver.selfie_key) return fail("This driver has not uploaded ID photos yet");
              const b = await getBookingBundle(driver.booking_id);
              if (!b) return fail("Reservation not found", 404);
              const approved = a.decision === "approve";
              await db()
                .prepare("UPDATE additional_drivers SET verification_status = ?1, reviewed_at = ?2, notes = ?3 WHERE id = ?4")
                .bind(approved ? "approved" : "rejected", now, a.notes ?? null, driver.id)
                .run();
              if (!approved) {
                const notes = a.notes ? `<p>${a.notes.replace(/</g, "&lt;")}</p>` : "";
                await sendEmail({
                  bookingId: b.booking.id,
                  to: [b.customer.email],
                  subject: `New ID photos needed for ${driver.full_name} (${b.booking.id})`,
                  html: emailShell(
                    `We need clearer ID photos of ${driver.full_name.replace(/</g, "&lt;")}`,
                    `${notes}<p><a href="${origin}/booking/${encodeURIComponent(b.booking.id)}?token=${b.booking.token}">Open your reservation</a> to upload new photos for them, or send them their link again: <a href="${origin}${driverPath(driver)}">${origin}${driverPath(driver)}</a></p>`,
                  ),
                });
              }
              return json({ ok: true, emailed: approved ? undefined : emailConfigured() });
            }
            case "updateRecord": {
              await db()
                .prepare(
                  "UPDATE bookings SET mileage_out = ?1, fuel_out = ?2, condition_notes = ?3, mileage_in = ?4, fuel_in = ?5, actual_return_at = ?6, damage_cents = ?7, fees_cents = ?8, deposit_refunded_cents = ?9, deposit_deducted_cents = ?10, final_paid_cents = ?11, notes = ?12 WHERE id = ?13",
                )
                .bind(
                  a.mileageOut ?? null, a.fuelOut ?? null, a.conditionNotes ?? null, a.mileageIn ?? null, a.fuelIn ?? null,
                  a.actualReturnAt ?? null, a.damageCents ?? null, a.feesCents ?? null, a.depositRefundedCents ?? null,
                  a.depositDeductedCents ?? null, a.finalPaidCents ?? null, a.notes ?? null, a.id,
                )
                .run();
              await refreshPdfs(a.id);
              return json({ ok: true });
            }
            case "saveVehicle": {
              const v = a.vehicle;
              const values = [
                v.year, v.make, v.model, v.color ?? null, v.vin?.toUpperCase() || null, v.plate?.toUpperCase() || null, v.ownerName ?? null,
                v.dailyRateCents, v.weeklyRateCents, v.depositCents, v.lateFeeCents, v.lateDailyCents, v.seats ?? 5,
                v.transmission ?? "Automatic", v.fuel ?? "Gasoline", v.description ?? null, v.photoUrl || null, v.active ? 1 : 0,
                v.rateTable ? JSON.stringify(v.rateTable) : null, v.driverFeeCents ?? 1000, v.driverFeeCapCents ?? 5000,
              ];
              if (v.id) {
                await db()
                  .prepare(
                    "UPDATE vehicles SET year = ?1, make = ?2, model = ?3, color = ?4, vin = ?5, plate = ?6, owner_name = ?7, daily_rate_cents = ?8, weekly_rate_cents = ?9, deposit_cents = ?10, late_fee_cents = ?11, late_daily_cents = ?12, seats = ?13, transmission = ?14, fuel = ?15, description = ?16, photo_url = ?17, active = ?18, rate_table = ?19, driver_fee_cents = ?20, driver_fee_cap_cents = ?21, rate_confirmed = 1 WHERE id = ?22",
                  )
                  .bind(...values, v.id)
                  .run();
                return json({ ok: true, id: v.id });
              }
              const id = newId("veh");
              const slug = await uniqueSlug(`${v.make}-${v.model}`);
              await db()
                .prepare(
                  "INSERT INTO vehicles (year, make, model, color, vin, plate, owner_name, daily_rate_cents, weekly_rate_cents, deposit_cents, late_fee_cents, late_daily_cents, seats, transmission, fuel, description, photo_url, active, rate_table, driver_fee_cents, driver_fee_cap_cents, id, slug, rate_confirmed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, 1)",
                )
                .bind(...values, id, slug)
                .run();
              return json({ ok: true, id });
            }
            case "addBlackout": {
              if (a.endDate < a.startDate) return fail("End date must be on or after the start date");
              await db()
                .prepare("INSERT INTO blackouts (id, vehicle_id, start_date, end_date, reason) VALUES (?1, ?2, ?3, ?4, ?5)")
                .bind(newId("blk"), a.vehicleId, a.startDate, a.endDate, a.reason ?? null)
                .run();
              return json({ ok: true });
            }
            case "removeBlackout": {
              await db().prepare("DELETE FROM blackouts WHERE id = ?1").bind(a.blackoutId).run();
              return json({ ok: true });
            }
          }
          return fail("Unknown action");
        } catch (err) {
          console.error(err);
          return fail(err instanceof Error ? err.message : "Something went wrong", 500);
        }
      },
    },
  },
});
