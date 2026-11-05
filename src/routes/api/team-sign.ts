// A team member (the VA) signs the agreement the owner sent her: typed name,
// mailing address, drawn signature and e-sign consent. Stores the signature,
// the document hash and a signed PDF, and emails both parties a copy.
import { createFileRoute } from "@tanstack/react-router";

import { getSession } from "@/lib/auth.server";
import { db, storage } from "@/lib/db.server";
import {
  emailTeamAgreementPdf, logTeamActivity, renderTeamPdf, teamAgreementDoc, teamDocHash, teamKey, termsOf, type TeamAgreementRow,
} from "@/lib/team-agreements.server";

const MAX_SIGNATURE_BYTES = 600_000;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export const Route = createFileRoute("/api/team-sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await getSession(request);
          if (!session || session.role !== "staff") return bad("Please sign in", 401);
          const form = await request.formData();
          const agreementId = String(form.get("agreementId") ?? "");
          const typedName = String(form.get("typedName") ?? "").trim().replace(/\s+/g, " ");
          const address = String(form.get("address") ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
          const signature = form.get("signature");

          const row = await db()
            .prepare("SELECT * FROM team_agreements WHERE id = ?1 AND staff_id = ?2")
            .bind(agreementId, session.staffId)
            .first<TeamAgreementRow>();
          if (!row) return bad("Agreement not found", 404);
          if (row.status === "signed") return Response.json({ ok: true, alreadySigned: true });
          if (row.status !== "sent") return bad("This agreement was cancelled. Ask the owner for the current one.");

          const terms = termsOf(row);
          if (norm(typedName) !== norm(terms.contractorName)) return bad(`Type your full name exactly as in the agreement: ${terms.contractorName}`);
          if (address.length < 5) return bad("Enter your mailing address");
          if (form.get("consentEsign") !== "true") return bad("Please agree to sign electronically");
          if (form.get("consentTerms") !== "true") return bad("Please confirm you have read and agree to the agreement");
          if (!(signature instanceof File) || signature.size < 200) return bad("Draw your signature in the box");
          if (signature.size > MAX_SIGNATURE_BYTES) return bad("The signature image is too large");
          const sigBytes = new Uint8Array(await signature.arrayBuffer());
          if (sigBytes[0] !== 0xff || sigBytes[1] !== 0xd8) return bad("The signature must be a JPEG image");

          const sigKey = teamKey(session.staffId, `agreement-${row.id}-signature.jpg`);
          await storage().put(sigKey, sigBytes, { httpMetadata: { contentType: "image/jpeg" } });
          const doc = teamAgreementDoc(row, session.email, address);
          const docHash = await teamDocHash(doc);
          const now = new Date().toISOString();
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
          const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 300);
          await db()
            .prepare(
              "UPDATE team_agreements SET status = 'signed', contractor_name = ?1, contractor_address = ?2, contractor_signed_at = ?3, contractor_ip = ?4, contractor_user_agent = ?5, signature_key = ?6, doc_hash = ?7 WHERE id = ?8 AND status = 'sent'",
            )
            .bind(typedName, address, now, ip, userAgent, sigKey, docHash, row.id)
            .run();

          const fresh = await db().prepare("SELECT * FROM team_agreements WHERE id = ?1").bind(row.id).first<TeamAgreementRow>();
          if (fresh) {
            const pdf = await renderTeamPdf(fresh, session.email);
            await emailTeamAgreementPdf(fresh, session.email, pdf, false);
          }
          await logTeamActivity(session.name, "signed the Virtual Assistant Agreement", row.number).catch(() => undefined);
          return Response.json({ ok: true });
        } catch (err) {
          console.error(err);
          return bad(err instanceof Error ? err.message : "Signing failed, please try again", 500);
        }
      },
    },
  },
});
