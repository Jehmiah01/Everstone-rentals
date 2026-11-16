// Square payment webhook (event: payment.updated). Marks the reservation paid
// and refreshes its stored PDFs so the payment record is current.
import { createFileRoute } from "@tanstack/react-router";

import { loadSignature, regenerateAndStorePdfs } from "@/lib/bookings.server";
import { db, getBookingBundle } from "@/lib/db.server";
import { applyPaidExtension, markOwnerExtensionPaid } from "@/lib/extensions.server";
import { verifyWebhookSignature } from "@/lib/square.server";

type SquareEvent = {
  type?: string;
  data?: { object?: { payment?: { id?: string; order_id?: string; status?: string } } };
};

export const Route = createFileRoute("/api/square/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const valid = await verifyWebhookSignature(raw, request.url, request.headers.get("x-square-hmacsha256-signature"));
        if (!valid) return new Response("Invalid signature", { status: 401 });
        let event: SquareEvent;
        try {
          event = JSON.parse(raw) as SquareEvent;
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const payment = event.data?.object?.payment;
        if (payment?.order_id && payment.status === "COMPLETED") {
          const row = await db()
            .prepare("SELECT id FROM bookings WHERE square_order_id = ?1 LIMIT 1")
            .bind(payment.order_id)
            .first<{ id: string }>();
          if (row) {
            await db()
              .prepare("UPDATE bookings SET payment_status = 'paid', paid_at = COALESCE(paid_at, ?1), square_payment_id = ?2 WHERE id = ?3")
              .bind(new Date().toISOString(), payment.id ?? null, row.id)
              .run();
            const bundle = await getBookingBundle(row.id);
            if (bundle?.booking.agreements_signed_at) {
              try {
                await regenerateAndStorePdfs(bundle, await loadSignature(bundle));
              } catch (err) {
                console.error(err);
              }
            }
          } else {
            // A rental extension: started online by the renter, or a link sent from the dashboard.
            const origin = new URL(request.url).origin;
            const ext = await db()
              .prepare("SELECT id FROM bookings WHERE ext_req_order_id = ?1 LIMIT 1")
              .bind(payment.order_id)
              .first<{ id: string }>();
            if (ext) await applyPaidExtension(ext.id, payment.order_id, origin);
            else await markOwnerExtensionPaid(payment.order_id, origin);
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
