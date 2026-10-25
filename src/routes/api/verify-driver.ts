// ID check for an additional driver: photo of their license and a selfie holding it.
// Accepts either the driver's own private token (from the link the renter sends them)
// or the reservation's token (when the renter uploads for them).
import { createFileRoute } from "@tanstack/react-router";

import { bookingKey } from "@/lib/bookings.server";
import { businessEmail } from "@/lib/config.server";
import { DRIVER_CLEARED, db, getBookingBundle, type AdditionalDriver } from "@/lib/db.server";
import { emailShell, sendEmail } from "@/lib/email.server";
import { storeIdPhotos } from "@/lib/id-photos.server";

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const Route = createFileRoute("/api/verify-driver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const driverId = String(form.get("driverId") ?? "");
          const token = String(form.get("token") ?? "");

          const driver = await db().prepare("SELECT * FROM additional_drivers WHERE id = ?1").bind(driverId).first<AdditionalDriver>();
          if (!driver || token.length < 16) return bad("Driver not found", 404);
          const bundle = await getBookingBundle(driver.booking_id);
          if (!bundle || (token !== driver.token && token !== bundle.booking.token)) return bad("Driver not found", 404);
          if (DRIVER_CLEARED.has(driver.verification_status)) return Response.json({ ok: true, alreadyVerified: true });
          if (!["requested", "approved"].includes(bundle.booking.status)) return bad("This reservation is closed");

          const stored = await storeIdPhotos(
            form,
            (label, ext) => bookingKey(bundle.booking.id, `driver-${driver.id}-${label}-${Date.now()}.${ext}`),
            "driver",
          );
          if (!stored.ok) return bad(stored.error);

          await db()
            .prepare(
              "UPDATE additional_drivers SET license_key = ?1, selfie_key = ?2, verification_status = 'submitted', submitted_at = ?3, reviewed_at = NULL, notes = NULL WHERE id = ?4",
            )
            .bind(stored.license, stored.selfie, new Date().toISOString(), driver.id)
            .run();

          const origin = new URL(request.url).origin;
          await sendEmail({
            bookingId: bundle.booking.id,
            to: [businessEmail()],
            subject: `Driver ID photos uploaded ${bundle.booking.id}: ${driver.full_name}`,
            html: emailShell(
              "Additional driver's license and selfie uploaded",
              `<p>${esc(driver.full_name)}, an additional driver on ${esc(bundle.customer.full_name)}'s reservation ${bundle.booking.id}, uploaded a license photo and a selfie.</p><p>Review them in the dashboard: <a href="${origin}/admin">${origin}/admin</a></p>`,
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
