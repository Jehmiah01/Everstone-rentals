// Public server functions used by the storefront and the customer pages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { agreementDocs, customerView, docHashes, sendBookingReceived, toPublicVehicle } from "../bookings.server";
import { addDays, ageOn, diffDays, isValidDay, parseRateTable, priceVehicle, todayDay } from "../dates";
import { db, findVerifiedCustomer, getBookingBundle, getVehicle, isVehicleFree, licenseAlreadyVerified, listVehicles, newId, newToken, nextAgreementNumber, sha256Hex, unavailableDates, type AdditionalDriver } from "../db.server";
import { createPaymentLink, orderIsPaid, squareConfigured } from "../square.server";
import type { AgreementDocs, CustomerBookingView, DriverPageView, HomeData, PublicVehicle } from "../types";

const RANGE_DAYS = 180;
const MAX_RENTAL_DAYS = 60;
const MAX_DRIVERS = 3;

export const getHomeData = createServerFn({ method: "GET" }).handler(async (): Promise<HomeData> => {
  const from = todayDay();
  const to = addDays(from, RANGE_DAYS);
  const vehicles = (await listVehicles()).map(toPublicVehicle);
  const unavailable = await unavailableDates(from, to);
  return { vehicles, unavailable, from, to };
});

export const getVehiclePage = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ data }): Promise<{ vehicle: PublicVehicle; unavailable: string[]; from: string; to: string } | null> => {
    const vehicle = await getVehicle(data.slug);
    if (!vehicle || vehicle.active !== 1) return null;
    const from = todayDay();
    const to = addDays(from, RANGE_DAYS);
    const map = await unavailableDates(from, to);
    return { vehicle: toPublicVehicle(vehicle), unavailable: map[vehicle.id] ?? [], from, to };
  });

const bookingInput = z.object({
  vehicleId: z.string().min(1).max(80),
  pickupDate: z.string().min(10).max(10),
  returnDate: z.string().min(10).max(10),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email"),
  phone: z.string().trim().min(7).max(30),
  address: z.string().trim().min(3).max(160),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(2).max(40),
  zip: z.string().trim().min(3).max(12),
  dob: z.string().min(10).max(10),
  dlNumber: z.string().trim().min(3).max(40),
  dlState: z.string().trim().min(2).max(40),
  dlExpiration: z.string().min(10).max(10),
  /** Legacy free-text names, still accepted from pages loaded before drivers had their own fields. */
  additionalDrivers: z.string().trim().max(300).optional(),
  drivers: z
    .array(
      z.object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(7).max(30),
        dob: z.string().min(10).max(10),
        dlNumber: z.string().trim().min(3).max(40),
        dlState: z.string().trim().min(2).max(40),
        dlExpiration: z.string().min(10).max(10),
      }),
    )
    .max(MAX_DRIVERS)
    .optional(),
  attestLicense: z.literal(true),
  origin: z.string().url(),
});

const sameLicense = (a: string, b: string) => a.trim().toLowerCase().replace(/[\s-]/g, "") === b.trim().toLowerCase().replace(/[\s-]/g, "");

export const createBooking = createServerFn({ method: "POST" })
  .validator(bookingInput)
  .handler(async ({ data }): Promise<{ id: string; token: string }> => {
    for (const [label, day] of [["pickup date", data.pickupDate], ["return date", data.returnDate], ["date of birth", data.dob], ["license expiration", data.dlExpiration]] as const) {
      if (!isValidDay(day)) throw new Error(`Enter a valid ${label}`);
    }
    const today = todayDay();
    if (data.pickupDate < today) throw new Error("Pickup date must be today or later");
    if (data.returnDate < data.pickupDate) throw new Error("Return date must be on or after the pickup date");
    const days = Math.max(1, diffDays(data.pickupDate, data.returnDate));
    if (days > MAX_RENTAL_DAYS) throw new Error(`Rentals are limited to ${MAX_RENTAL_DAYS} days per booking`);
    if (ageOn(data.dob, data.pickupDate) < 18) throw new Error("Renters must be at least 18 years old on the pickup date");
    if (data.dlExpiration <= data.returnDate) throw new Error("Your driver's license must be valid through the return date");

    const drivers = data.drivers ?? [];
    for (const [i, d] of drivers.entries()) {
      const who = d.fullName || `Driver ${i + 1}`;
      if (!isValidDay(d.dob)) throw new Error(`Enter a valid date of birth for ${who}`);
      if (!isValidDay(d.dlExpiration)) throw new Error(`Enter a valid license expiration date for ${who}`);
      if (ageOn(d.dob, data.pickupDate) < 18) throw new Error(`${who} must be at least 18 years old on the pickup date`);
      if (d.dlExpiration <= data.returnDate) throw new Error(`${who}'s driver's license must be valid through the return date`);
      if (sameLicense(d.dlNumber, data.dlNumber)) throw new Error(`${who} has the same license number as you. List only other people who will drive.`);
      if (drivers.some((o, j) => j < i && sameLicense(o.dlNumber, d.dlNumber))) throw new Error(`${who} is listed twice`);
    }

    const vehicle = await getVehicle(data.vehicleId);
    if (!vehicle || vehicle.active !== 1) throw new Error("That vehicle is not available for booking");
    if (!(await isVehicleFree(vehicle.id, data.pickupDate, data.returnDate))) {
      throw new Error("Those dates were just taken for this vehicle. Please pick different dates.");
    }

    const price = priceVehicle(days, { rateTable: parseRateTable(vehicle.rate_table), dailyRateCents: vehicle.daily_rate_cents, weeklyRateCents: vehicle.weekly_rate_cents });
    const verified = await findVerifiedCustomer(data.email, data.dlNumber);
    let customerId: string;
    if (verified) {
      customerId = verified.id;
      await db()
        .prepare("UPDATE customers SET full_name = ?1, phone = ?2, address = ?3, city = ?4, state = ?5, zip = ?6, dob = ?7, dl_state = ?8, dl_expiration = ?9 WHERE id = ?10")
        .bind(data.fullName, data.phone, data.address, data.city, data.state, data.zip, data.dob, data.dlState, data.dlExpiration, customerId)
        .run();
    } else {
      customerId = newId("cus");
      await db()
        .prepare("INSERT INTO customers (id, full_name, email, phone, address, city, state, zip, dob, dl_number, dl_state, dl_expiration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
        .bind(customerId, data.fullName, data.email, data.phone, data.address, data.city, data.state, data.zip, data.dob, data.dlNumber, data.dlState, data.dlExpiration)
        .run();
    }

    const id = await nextAgreementNumber();
    const token = newToken();
    await db()
      .prepare(
        "INSERT INTO bookings (id, token, vehicle_id, customer_id, pickup_date, return_date, pickup_time, return_time, days, rate_breakdown, total_cents, deposit_cents, additional_drivers, verification_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
      )
      .bind(
        id, token, vehicle.id, customerId, data.pickupDate, data.returnDate, data.pickupTime, data.returnTime, days, price.breakdown,
        price.total_cents, vehicle.deposit_cents,
        drivers.length > 0 ? drivers.map((d) => d.fullName).join(", ") : data.additionalDrivers?.trim() || null,
        verified ? "not_required" : "pending",
      )
      .run();

    // Drivers go in before the agreement text is hashed, so both agreements list them.
    for (const [i, d] of drivers.entries()) {
      const cleared = await licenseAlreadyVerified(d.dlNumber, d.dob);
      await db()
        .prepare(
          "INSERT INTO additional_drivers (id, booking_id, position, full_name, phone, dob, dl_number, dl_state, dl_expiration, token, verification_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(newId("drv"), id, i, d.fullName, d.phone, d.dob, d.dlNumber, d.dlState, d.dlExpiration, newToken(), cleared ? "not_required" : "pending")
        .run();
    }

    const bundle = await getBookingBundle(id);
    if (!bundle) throw new Error("The reservation could not be saved");
    const hashes = docHashes(bundle);
    const rentalHash = await sha256Hex(hashes.rental);
    const easyHash = await sha256Hex(hashes.easy);
    await db().batch([
      db().prepare("INSERT INTO agreements (id, booking_id, kind, status, doc_hash) VALUES (?1, ?2, 'rental', 'pending', ?3)").bind(newId("agr"), id, rentalHash),
      db().prepare("INSERT INTO agreements (id, booking_id, kind, status, doc_hash) VALUES (?1, ?2, 'easy_sign', 'pending', ?3)").bind(newId("agr"), id, easyHash),
    ]);
    const fresh = await getBookingBundle(id);
    if (fresh) await sendBookingReceived(fresh, data.origin);
    return { id, token };
  });

const access = z.object({ id: z.string().min(1).max(40), token: z.string().min(16).max(80) });

async function loadForCustomer(id: string, token: string) {
  const bundle = await getBookingBundle(id);
  if (!bundle || bundle.booking.token !== token) throw new Error("Reservation not found");
  return bundle;
}

export const getCustomerBooking = createServerFn({ method: "POST" })
  .validator(access)
  .handler(async ({ data }): Promise<CustomerBookingView> => customerView(await loadForCustomer(data.id, data.token)));

/** An additional driver's own ID check page, opened with the private link the renter sends them. */
export const getDriverPage = createServerFn({ method: "POST" })
  .validator(access)
  .handler(async ({ data }): Promise<DriverPageView> => {
    const driver = await db().prepare("SELECT * FROM additional_drivers WHERE id = ?1").bind(data.id).first<AdditionalDriver>();
    if (!driver || driver.token !== data.token) throw new Error("Driver not found");
    const bundle = await getBookingBundle(driver.booking_id);
    if (!bundle) throw new Error("Driver not found");
    const { booking, vehicle, customer } = bundle;
    return {
      driverId: driver.id,
      token: driver.token,
      fullName: driver.full_name,
      verificationStatus: driver.verification_status,
      renterName: customer.full_name,
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      pickupDate: booking.pickup_date,
      returnDate: booking.return_date,
      open: booking.status === "requested" || booking.status === "approved",
    };
  });

export const getAgreementDocs = createServerFn({ method: "POST" })
  .validator(access)
  .handler(async ({ data }): Promise<AgreementDocs> => agreementDocs(await loadForCustomer(data.id, data.token)));

export const startCheckout = createServerFn({ method: "POST" })
  .validator(access.extend({ origin: z.string().url() }))
  .handler(async ({ data }): Promise<{ url: string | null; message: string }> => {
    const bundle = await loadForCustomer(data.id, data.token);
    const { booking, vehicle, customer } = bundle;
    if (booking.payment_status === "paid") return { url: null, message: "This reservation is already paid." };
    if (!booking.agreements_signed_at) return { url: null, message: "Sign both agreements before paying." };
    if (booking.payment_link && booking.square_order_id) return { url: booking.payment_link, message: "Continue to Square." };
    if (booking.payment_link) return { url: booking.payment_link, message: "Continue to Square." };
    if (!squareConfigured()) {
      return { url: null, message: "Square checkout is being set up. The owner will send your Square payment link by email before pickup." };
    }
    const link = await createPaymentLink({
      bookingId: booking.id,
      amountCents: booking.total_cents + booking.deposit_cents,
      name: `${vehicle.year} ${vehicle.make} ${vehicle.model} rental ${booking.pickup_date} to ${booking.return_date} (${booking.id})`,
      buyerEmail: customer.email,
      redirectUrl: `${data.origin}/booking/${encodeURIComponent(booking.id)}?token=${booking.token}&paid=1`,
    });
    await db()
      .prepare("UPDATE bookings SET payment_link = ?1, square_order_id = ?2, payment_status = 'link_sent' WHERE id = ?3")
      .bind(link.url, link.orderId, booking.id)
      .run();
    return { url: link.url, message: "Continue to Square." };
  });

export const confirmPayment = createServerFn({ method: "POST" })
  .validator(access)
  .handler(async ({ data }): Promise<{ paymentStatus: string }> => {
    const bundle = await loadForCustomer(data.id, data.token);
    const { booking } = bundle;
    if (booking.payment_status === "paid") return { paymentStatus: "paid" };
    if (booking.square_order_id && squareConfigured()) {
      const result = await orderIsPaid(booking.square_order_id);
      if (result.paid) {
        await db()
          .prepare("UPDATE bookings SET payment_status = 'paid', paid_at = ?1, square_payment_id = ?2 WHERE id = ?3")
          .bind(new Date().toISOString(), result.paymentId, booking.id)
          .run();
        return { paymentStatus: "paid" };
      }
    }
    return { paymentStatus: booking.payment_status };
  });
