// Receives the customer's electronic signature for both agreements, stores the
// signature and audit trail, generates the signed PDFs and emails them.
import { createFileRoute } from "@tanstack/react-router";

import { ESIGN_CONSENT, LICENSE_ATTESTATION } from "@/lib/agreements";
import { bookingKey, docHashes, regenerateAndStorePdfs, sendSignedAgreements } from "@/lib/bookings.server";
import { db, getBookingBundle, sha256Hex, storage } from "@/lib/db.server";

const MAX_SIGNATURE_BYTES = 600_000;

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const Route = createFileRoute("/api/sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const id = String(form.get("id") ?? "");
          const token = String(form.get("token") ?? "");
          const typedName = String(form.get("typedName") ?? "").trim().replace(/\s+/g, " ");
          const initials = String(form.get("initials") ?? "").toUpperCase().replace(/[^A-Z]/g, "");
          const signature = form.get("signature");

          const bundle = await getBookingBundle(id);
          if (!bundle || token.length < 16 || bundle.booking.token !== token) return bad("Reservation not found", 404);
          if (bundle.booking.agreements_signed_at) return Response.json({ ok: true, alreadySigned: true });
          if (!["requested", "approved"].includes(bundle.booking.status)) return bad("This reservation can no longer be signed");
          if (form.get("consentEsign") !== "true") return bad("Please agree to sign electronically");
          if (form.get("consentTerms") !== "true") return bad("Please confirm you have read and agree to both agreements");
          if (form.get("attestLicense") !== "true") return bad("Please confirm the driver's license requirements");
          if (norm(typedName) !== norm(bundle.customer.full_name)) {
            return bad(`Type your full name exactly as on your reservation: ${bundle.customer.full_name}`);
          }
          if (initials.length < 1 || initials.length > 4) return bad("Enter your initials for the card authorization");
          if (!(signature instanceof File) || signature.size < 200) return bad("Draw your signature in the box");
          if (signature.size > MAX_SIGNATURE_BYTES) return bad("The signature image is too large");
          const sigBytes = new Uint8Array(await signature.arrayBuffer());
          if (sigBytes[0] !== 0xff || sigBytes[1] !== 0xd8) return bad("The signature must be a JPEG image");

          const now = new Date().toISOString();
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
          const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 300);
          const sigKey = bookingKey(id, "signature.jpg");
          await storage().put(sigKey, sigBytes, { httpMetadata: { contentType: "image/jpeg" } });

          const texts = docHashes(bundle);
          const rentalHash = await sha256Hex(texts.rental);
          const easyHash = await sha256Hex(texts.easy);
          const consent = [
            ESIGN_CONSENT,
            LICENSE_ATTESTATION,
            "I have read and agree to the Motor Vehicle Rental Agreement and the Vehicle Rental Agreement shown on screen.",
          ].join("\n");
          const update =
            "UPDATE agreements SET status = 'signed', signed_at = ?1, signer_name = ?2, initials = ?3, consent_text = ?4, ip = ?5, user_agent = ?6, signature_key = ?7, doc_hash = ?8 WHERE booking_id = ?9 AND kind = ?10";
          await db().batch([
            db().prepare(update).bind(now, typedName, initials, consent, ip, userAgent, sigKey, rentalHash, id, "rental"),
            db().prepare(update).bind(now, typedName, initials, consent, ip, userAgent, sigKey, easyHash, id, "easy_sign"),
            db().prepare("UPDATE bookings SET agreements_signed_at = ?1 WHERE id = ?2 AND agreements_signed_at IS NULL").bind(now, id),
          ]);

          const fresh = await getBookingBundle(id);
          if (!fresh) return bad("Reservation not found", 404);
          const pdfs = await regenerateAndStorePdfs(fresh, sigBytes);
          await sendSignedAgreements(fresh, pdfs, new URL(request.url).origin);
          return Response.json({ ok: true });
        } catch (err) {
          console.error(err);
          return bad(err instanceof Error ? err.message : "Signing failed, please try again", 500);
        }
      },
    },
  },
});
