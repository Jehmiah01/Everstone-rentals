import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import { bindings } from "./bindings.server";
import { eachDay } from "./dates";

export type Vehicle = {
  id: string; slug: string; year: number; make: string; model: string; color: string | null;
  vin: string | null; plate: string | null; owner_name: string | null;
  daily_rate_cents: number; weekly_rate_cents: number; deposit_cents: number;
  late_fee_cents: number; late_daily_cents: number; seats: number | null;
  transmission: string | null; fuel: string | null; description: string | null;
  photo_url: string | null; rate_table: string | null; active: number; rate_confirmed: number; created_at: string;
  /** Extra driver fee per driver, per rental day. */
  driver_fee_cents: number;
  /** Most one extra driver can cost per rental (0 = no cap). */
  driver_fee_cap_cents: number;
};

export type Customer = {
  id: string; full_name: string; email: string; phone: string; address: string; city: string;
  state: string; zip: string; dob: string; dl_number: string; dl_state: string; dl_expiration: string;
  verified_at: string | null; created_at: string;
};

export type Booking = {
  id: string; token: string; vehicle_id: string; customer_id: string; pickup_date: string; return_date: string;
  pickup_time: string; return_time: string; days: number; rate_breakdown: string; total_cents: number;
  deposit_cents: number; additional_drivers: string | null; status: string; payment_status: string;
  payment_link: string | null; square_order_id: string | null; square_payment_id: string | null; paid_at: string | null;
  agreements_signed_at: string | null; verification_status: string; address_sent_at: string | null;
  approved_at: string | null; rep_name: string | null; rep_signed_at: string | null;
  mileage_out: string | null; fuel_out: string | null; condition_notes: string | null;
  mileage_in: string | null; fuel_in: string | null; damage_cents: number | null; fees_cents: number | null;
  deposit_refunded_cents: number | null; deposit_deducted_cents: number | null; final_paid_cents: number | null;
  actual_return_at: string | null; notes: string | null; created_at: string;
  refunded_cents: number | null; refund_id: string | null; refunded_at: string | null;
  /** Extra driver charge for this reservation, already included in total_cents. */
  driver_fee_cents: number;
};

export type Agreement = {
  id: string; booking_id: string; kind: string; status: string; signed_at: string | null; signer_name: string | null;
  initials: string | null; consent_text: string | null; ip: string | null; user_agent: string | null;
  signature_key: string | null; pdf_key: string | null; doc_hash: string | null; sent_at: string | null;
  send_count: number; created_at: string;
};

export type Verification = {
  id: string; booking_id: string; customer_id: string; license_key: string | null; selfie_key: string | null;
  status: string; reviewed_at: string | null; notes: string | null; created_at: string;
};

/** Someone other than the renter who may drive the car on this reservation. */
export type AdditionalDriver = {
  id: string; booking_id: string; position: number; full_name: string; phone: string; dob: string;
  dl_number: string; dl_state: string; dl_expiration: string; token: string;
  /** pending | submitted | approved | rejected | not_required (approved on an earlier reservation) */
  verification_status: string;
  license_key: string | null; selfie_key: string | null; submitted_at: string | null; reviewed_at: string | null;
  notes: string | null; created_at: string;
};

export const DRIVER_CLEARED = new Set(["approved", "not_required"]);

export type BookingBundle = {
  booking: Booking;
  vehicle: Vehicle;
  customer: Customer;
  agreements: Agreement[];
  verification: Verification | null;
  drivers: AdditionalDriver[];
};

export function db(): D1Database {
  const { DB } = bindings();
  if (!DB) throw new Error("The database is not available yet. Deploy with db enabled.");
  return DB;
}

type StoredFile = { arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } };
type FileStore = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<StoredFile | null>;
};

/** File storage: R2 when bound as STORAGE, otherwise Cloudflare KV bound as FILES. */
export function storage(): FileStore {
  const { STORAGE, FILES } = bindings();
  if (STORAGE) return STORAGE as unknown as FileStore;
  if (FILES) {
    return {
      put: (key, value, opts) =>
        FILES.put(key, value, { metadata: { contentType: opts?.httpMetadata?.contentType ?? "application/octet-stream" } }),
      get: async (key) => {
        const res = await FILES.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
        if (!res.value) return null;
        const buf = res.value;
        return { arrayBuffer: async () => buf, httpMetadata: { contentType: res.metadata?.contentType } };
      },
    };
  }
  throw new Error("File storage is not configured. Bind a KV namespace as FILES.");
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function listVehicles(includeInactive = false): Promise<Vehicle[]> {
  const sql = includeInactive
    ? "SELECT * FROM vehicles ORDER BY created_at ASC"
    : "SELECT * FROM vehicles WHERE active = 1 ORDER BY created_at ASC";
  const { results } = await db().prepare(sql).all<Vehicle>();
  return results;
}

export async function getVehicle(idOrSlug: string): Promise<Vehicle | null> {
  return (
    (await db()
      .prepare("SELECT * FROM vehicles WHERE id = ?1 OR slug = ?1 LIMIT 1")
      .bind(idOrSlug)
      .first<Vehicle>()) ?? null
  );
}

/** Dates each vehicle cannot be picked up on, from reservations and blackouts, inclusive of return day. */
export async function unavailableDates(from: string, to: string): Promise<Record<string, string[]>> {
  const out: Record<string, Set<string>> = {};
  const bookings = await db()
    .prepare(
      "SELECT vehicle_id, pickup_date, return_date FROM bookings WHERE status IN ('requested','approved') AND return_date >= ?1 AND pickup_date <= ?2",
    )
    .bind(from, to)
    .all<{ vehicle_id: string; pickup_date: string; return_date: string }>();
  const blackouts = await db()
    .prepare("SELECT vehicle_id, start_date, end_date FROM blackouts WHERE end_date >= ?1 AND start_date <= ?2")
    .bind(from, to)
    .all<{ vehicle_id: string; start_date: string; end_date: string }>();
  const add = (vehicleId: string, start: string, end: string) => {
    const set = (out[vehicleId] ??= new Set<string>());
    for (const d of eachDay(start, end)) set.add(d);
  };
  for (const b of bookings.results) add(b.vehicle_id, b.pickup_date, b.return_date);
  for (const b of blackouts.results) add(b.vehicle_id, b.start_date, b.end_date);
  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(out)) result[k] = Array.from(v).sort();
  return result;
}

export async function isVehicleFree(vehicleId: string, start: string, end: string, excludeBookingId?: string): Promise<boolean> {
  const conflict = await db()
    .prepare(
      "SELECT id FROM bookings WHERE vehicle_id = ?1 AND status IN ('requested','approved') AND return_date >= ?2 AND pickup_date <= ?3 AND id != ?4 LIMIT 1",
    )
    .bind(vehicleId, start, end, excludeBookingId ?? "")
    .first<{ id: string }>();
  if (conflict) return false;
  const blackout = await db()
    .prepare("SELECT id FROM blackouts WHERE vehicle_id = ?1 AND end_date >= ?2 AND start_date <= ?3 LIMIT 1")
    .bind(vehicleId, start, end)
    .first<{ id: string }>();
  return !blackout;
}

export async function nextAgreementNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const name = `agreement_${year}`;
  await db().prepare("INSERT OR IGNORE INTO counters (name, value) VALUES (?1, 0)").bind(name).run();
  const row = await db()
    .prepare("UPDATE counters SET value = value + 1 WHERE name = ?1 RETURNING value")
    .bind(name)
    .first<{ value: number }>();
  const n = row?.value ?? 1;
  return `ECG-${year}-${String(n).padStart(4, "0")}`;
}

export async function findVerifiedCustomer(email: string, dlNumber: string): Promise<Customer | null> {
  return (
    (await db()
      .prepare(
        "SELECT * FROM customers WHERE lower(email) = lower(?1) AND lower(dl_number) = lower(?2) AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1",
      )
      .bind(email, dlNumber)
      .first<Customer>()) ?? null
  );
}

export async function getBookingBundle(id: string): Promise<BookingBundle | null> {
  const booking = await db().prepare("SELECT * FROM bookings WHERE id = ?1").bind(id).first<Booking>();
  if (!booking) return null;
  const vehicle = await db().prepare("SELECT * FROM vehicles WHERE id = ?1").bind(booking.vehicle_id).first<Vehicle>();
  const customer = await db().prepare("SELECT * FROM customers WHERE id = ?1").bind(booking.customer_id).first<Customer>();
  if (!vehicle || !customer) return null;
  const agreements = (
    await db().prepare("SELECT * FROM agreements WHERE booking_id = ?1 ORDER BY kind ASC").bind(id).all<Agreement>()
  ).results;
  const verification =
    (await db()
      .prepare("SELECT * FROM verifications WHERE booking_id = ?1 ORDER BY created_at DESC LIMIT 1")
      .bind(id)
      .first<Verification>()) ?? null;
  const drivers = await listDrivers(id);
  return { booking, vehicle, customer, agreements, verification, drivers };
}

export async function listDrivers(bookingId: string): Promise<AdditionalDriver[]> {
  return (
    await db()
      .prepare("SELECT * FROM additional_drivers WHERE booking_id = ?1 ORDER BY position ASC, created_at ASC")
      .bind(bookingId)
      .all<AdditionalDriver>()
  ).results;
}

/**
 * True when this license (number + date of birth) already passed an ID check:
 * as an approved additional driver or as a verified renter.
 */
export async function licenseAlreadyVerified(dlNumber: string, dob: string): Promise<boolean> {
  const asDriver = await db()
    .prepare(
      "SELECT id FROM additional_drivers WHERE lower(trim(dl_number)) = lower(trim(?1)) AND dob = ?2 AND verification_status = 'approved' LIMIT 1",
    )
    .bind(dlNumber, dob)
    .first<{ id: string }>();
  if (asDriver) return true;
  const asRenter = await db()
    .prepare("SELECT id FROM customers WHERE lower(trim(dl_number)) = lower(trim(?1)) AND dob = ?2 AND verified_at IS NOT NULL LIMIT 1")
    .bind(dlNumber, dob)
    .first<{ id: string }>();
  return Boolean(asRenter);
}

export async function logEmail(
  bookingId: string | null,
  to: string,
  subject: string,
  status: string,
  providerId?: string,
  error?: string,
) {
  await db()
    .prepare(
      "INSERT INTO email_log (id, booking_id, to_email, subject, status, provider_id, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(newId("eml"), bookingId, to, subject, status, providerId ?? null, error ?? null)
    .run();
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
