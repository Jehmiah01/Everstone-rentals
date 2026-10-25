// One-time identity check: photo of the driver's license and a selfie holding it.
import { createFileRoute } from "@tanstack/react-router";

import { bookingKey } from "@/lib/bookings.server";
import { businessEmail } from "@/lib/config.server";
import { db, getBookingBundle, newId } from "@/lib/db.server";
import { emailShell, sendEmail } from "@/lib/email.server";
import { storeIdPhotos } from "@/lib/id-photos.server";

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export const Route = createFileRoute("/api/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const id = String(form.get("id") ?? "");
          const token = String(form.get("token") ?? "");

          const bundle = await getBookingBundle(id);
          if (!bundle || token.length < 16 || bundle.booking.token !== token) return bad("Reservation not found", 404);
          const current = bundle.booking.verification_status;
          if (current === "approved" || current === "not_required") return Response.json({ ok: true, alreadyVerified: true });
          if (!["requested", "approved"].includes(bundle.booking.status)) return bad("This reservation is closed");

          const stored = await storeIdPhotos(form, (label, ext) => bookingKey(id, `${label}-${Date.now()}.${ext}`), "renter");
          if (!stored.ok) return bad(stored.error);

          await db().batch([
            db()
              .prepare("INSERT INTO verifications (id, booking_id, customer_id, license_key, selfie_key, status) VALUES (?1, ?2, ?3, ?4, ?5, 'submitted')")
              .bind(newId("ver"), id, bundle.customer.id, stored.license, stored.selfie),
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
