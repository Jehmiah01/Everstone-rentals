// One-time identity check: photo of the driver's license and a selfie holding it.
import { createFileRoute } from "@tanstack/react-router";

import { bookingKey } from "@/lib/bookings.server";
import { businessEmail } from "@/lib/config.server";
import { db, getBookingBundle, newId, storage } from "@/lib/db.server";
import { emailShell, sendEmail } from "@/lib/email.server";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
const EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

function extFor(file: File): string | null {
  const fromType = TYPES[file.type];
  if (fromType) return fromType;
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTS.has(fromName) ? (fromName === "jpeg" ? "jpg" : fromName) : null;
}

export const Route = createFileRoute("/api/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const id = String(form.get("id") ?? "");
          const token = String(form.get("token") ?? "");
          const license = form.get("license");
          const selfie = form.get("selfie");

          const bundle = await getBookingBundle(id);
          if (!bundle || token.length < 16 || bundle.booking.token !== token) return bad("Reservation not found", 404);
          const current = bundle.booking.verification_status;
          if (current === "approved" || current === "not_required") return Response.json({ ok: true, alreadyVerified: true });
          if (!["requested", "approved"].includes(bundle.booking.status)) return bad("This reservation is closed");

          const files: [string, FormDataEntryValue | null][] = [["license", license], ["selfie", selfie]];
          const stored: Record<string, string> = {};
          for (const [label, file] of files) {
            if (!(file instanceof File) || file.size === 0) {
              return bad(label === "license" ? "Add a photo of the front of your driver's license" : "Add a selfie of you holding your license");
            }
            if (file.size > MAX_BYTES) return bad("Each photo must be under 10 MB");
            const ext = extFor(file);
            if (!ext) return bad("Photos must be JPG, PNG, WEBP or HEIC");
            const key = bookingKey(id, `${label}-${Date.now()}.${ext}`);
            await storage().put(key, await file.arrayBuffer(), {
              httpMetadata: { contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}` },
            });
            stored[label] = key;
          }

          await db().batch([
            db()
              .prepare("INSERT INTO verifications (id, booking_id, customer_id, license_key, selfie_key, status) VALUES (?1, ?2, ?3, ?4, ?5, 'submitted')")
              .bind(newId("ver"), id, bundle.customer.id, stored.license ?? null, stored.selfie ?? null),
            db().prepare("UPDATE bookings SET verification_status = 'submitted' WHERE id = ?1").bind(id),
          ]);

          const origin = new URL(request.url).origin;
          await sendEmail({
            bookingId: id,
            to: [businessEmail()],
            subject: `ID photos uploaded ${id}: ${bundle.customer.full_name}`,
            html: emailShell(
              "License and selfie uploaded",
              `<p>${bundle.customer.full_name} uploaded a license photo and a selfie for reservation ${id}.</p><p>Review them in the dashboard: <a href="${origin}/admin">${origin}/admin</a></p>`,
            ),
          });
          return Response.json({ ok: true });
        } catch (err) {
          console.error(err);
          return bad(err instanceof Error ? err.message : "Upload failed, please try again", 500);
        }
      },
    },
  },
});
