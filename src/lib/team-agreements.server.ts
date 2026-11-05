// Server side of the team (VA) agreement: numbering, the signed PDF, emails,
// and whether a team member still has to sign before using the dashboard.
import { agreementPlainText, type AgreementDoc } from "./agreements";
import { COMPANY, businessEmail } from "./config.server";
import { formatEt } from "./dates";
import { db, newId, sha256Hex, storage } from "./db.server";
import { emailShell, sendEmail } from "./email.server";
import { renderAgreementPdf } from "./pdf.server";
import { buildTeamAgreement, type TeamTerms } from "./team-agreement";
import type { MyAgreement, TeamAgreementSummary } from "./types";

export type TeamAgreementRow = {
  id: string; staff_id: string; number: string; terms: string; status: string;
  contractor_name: string | null; contractor_address: string | null; contractor_signed_at: string | null;
  contractor_ip: string | null; contractor_user_agent: string | null; signature_key: string | null; doc_hash: string | null;
  owner_name: string | null; owner_signed_at: string | null; pdf_key: string | null; created_at: string;
};

export function teamKey(staffId: string, file: string): string {
  return `staff/${staffId}/${file}`;
}

export function termsOf(row: TeamAgreementRow): TeamTerms {
  return JSON.parse(row.terms) as TeamTerms;
}

export async function latestTeamAgreement(staffId: string): Promise<TeamAgreementRow | null> {
  return (
    (await db()
      .prepare("SELECT * FROM team_agreements WHERE staff_id = ?1 AND status != 'void' ORDER BY created_at DESC LIMIT 1")
      .bind(staffId)
      .first<TeamAgreementRow>()) ?? null
  );
}

/** True while the owner has sent this team member an agreement she hasn't signed yet. */
export async function staffMustSign(staffId: string): Promise<boolean> {
  return (await latestTeamAgreement(staffId))?.status === "sent";
}

export async function nextTeamAgreementNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const name = `va_agreement_${year}`;
  await db().prepare("INSERT OR IGNORE INTO counters (name, value) VALUES (?1, 0)").bind(name).run();
  const row = await db().prepare("UPDATE counters SET value = value + 1 WHERE name = ?1 RETURNING value").bind(name).first<{ value: number }>();
  return `ECG-VA-${year}-${String(row?.value ?? 1).padStart(3, "0")}`;
}

export function teamAgreementDoc(row: TeamAgreementRow, contractorEmail: string, address?: string | null): AgreementDoc {
  return buildTeamAgreement({ number: row.number, terms: termsOf(row), contractorEmail, contractorAddress: address ?? row.contractor_address });
}

export function teamDocHash(doc: AgreementDoc): Promise<string> {
  return sha256Hex(agreementPlainText(doc));
}

const pdfUrl = (row: TeamAgreementRow) => (row.pdf_key ? `/api/files/${row.pdf_key}` : null);

export function toSummary(row: TeamAgreementRow): TeamAgreementSummary {
  return {
    id: row.id, number: row.number, status: row.status === "signed" ? "signed" : "sent", terms: termsOf(row),
    contractorSignedAt: row.contractor_signed_at, ownerSignedAt: row.owner_signed_at, ownerName: row.owner_name,
    pdfUrl: pdfUrl(row), createdAt: row.created_at,
  };
}

export function toMyAgreement(row: TeamAgreementRow, contractorEmail: string): MyAgreement {
  const terms = termsOf(row);
  return {
    id: row.id, number: row.number, status: row.status === "signed" ? "signed" : "sent",
    doc: teamAgreementDoc(row, contractorEmail), contractorName: terms.contractorName,
    contractorSignedAt: row.contractor_signed_at, ownerSignedAt: row.owner_signed_at, pdfUrl: pdfUrl(row),
  };
}

/** Renders the agreement PDF as it stands (signatures so far) and stores it. */
export async function renderTeamPdf(row: TeamAgreementRow, contractorEmail: string): Promise<Uint8Array> {
  const doc = teamAgreementDoc(row, contractorEmail);
  let signatureJpeg: Uint8Array | null = null;
  if (row.signature_key) {
    const obj = await storage().get(row.signature_key);
    if (obj) signatureJpeg = new Uint8Array(await obj.arrayBuffer());
  }
  const pdf = renderAgreementPdf(
    doc,
    {
      renterName: row.contractor_name ?? termsOf(row).contractorName,
      initials: "",
      signedAt: row.contractor_signed_at ? formatEt(row.contractor_signed_at) : "Not yet signed",
      ip: row.contractor_ip ?? "",
      userAgent: row.contractor_user_agent ?? "",
      docHash: row.doc_hash ?? "",
      signatureJpeg,
      repName: row.owner_name,
      repSignedAt: row.owner_signed_at ? formatEt(row.owner_signed_at) : null,
      signerLabel: "CONTRACTOR",
    },
    COMPANY.name,
  );
  const key = teamKey(row.staff_id, `agreement-${row.id}.pdf`);
  await storage().put(key, pdf, { httpMetadata: { contentType: "application/pdf" } });
  await db().prepare("UPDATE team_agreements SET pdf_key = ?1 WHERE id = ?2").bind(key, row.id).run();
  return pdf;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function emailTeamAgreementSent(staffName: string, staffEmail: string, origin: string) {
  await sendEmail({
    to: [staffEmail],
    subject: "Please sign your Virtual Assistant Agreement",
    html: emailShell(
      `Hi ${esc(staffName.split(" ")[0] ?? staffName)}, your agreement is ready`,
      `<p>Sign in to the Providence Rentals dashboard to read and sign your Virtual Assistant Agreement. You can use the dashboard once it's signed.</p><p><a href="${origin}/admin?as=team">${origin}/admin?as=team</a></p>`,
    ),
  });
}

export async function emailTeamAgreementPdf(row: TeamAgreementRow, staffEmail: string, pdf: Uint8Array, bothSigned: boolean) {
  const name = row.contractor_name ?? termsOf(row).contractorName;
  const attachments = [{ filename: `${row.number}-virtual-assistant-agreement.pdf`, content: pdf }];
  const title = bothSigned ? "Virtual Assistant Agreement signed by both parties" : `${name} signed the Virtual Assistant Agreement`;
  const body = bothSigned
    ? `<p>Agreement ${row.number} is now signed by ${esc(name)} and by ${esc(row.owner_name ?? COMPANY.name)} for ${COMPANY.name}. The signed copy is attached.</p>`
    : `<p>${esc(name)} signed agreement ${row.number}. It still needs the owner's countersignature in the dashboard's Team tab. A copy is attached.</p>`;
  await sendEmail({ to: [businessEmail(), staffEmail], subject: title, html: emailShell(title, body), attachments });
}

export async function logTeamActivity(actor: string, action: string, target: string | null) {
  await db()
    .prepare("INSERT INTO activity_log (id, actor, action, target, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(newId("act"), actor, action, target, new Date().toISOString())
    .run();
}
