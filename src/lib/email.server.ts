import { businessEmail, secret, mailFrom } from "./config.server";
import { logEmail } from "./db.server";

export type Attachment = { filename: string; content: Uint8Array };

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function emailConfigured(): boolean {
  return Boolean(secret("RESEND_API_KEY"));
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  bookingId?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = secret("RESEND_API_KEY");
  const recipients = opts.to.map((t) => t.trim()).filter(Boolean);
  if (!key) {
    for (const to of recipients) await logEmail(opts.bookingId ?? null, to, opts.subject, "skipped", undefined, "RESEND_API_KEY not configured");
    return { ok: false, error: "Email is not configured yet" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailFrom(),
        reply_to: businessEmail(),
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        attachments: (opts.attachments ?? []).map((a) => ({ filename: a.filename, content: toBase64(a.content) })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const error = body.message ?? `Resend responded ${res.status}`;
      for (const to of recipients) await logEmail(opts.bookingId ?? null, to, opts.subject, "failed", undefined, error);
      return { ok: false, error };
    }
    for (const to of recipients) await logEmail(opts.bookingId ?? null, to, opts.subject, "sent", body.id);
    return { ok: true, id: body.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown email error";
    for (const to of recipients) await logEmail(opts.bookingId ?? null, to, opts.subject, "failed", undefined, error);
    return { ok: false, error };
  }
}

export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F3F4F1;font-family:Helvetica,Arial,sans-serif;color:#15181D">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5B6270;margin-bottom:12px">Everstone Rentals</div>
    <h1 style="font-size:22px;margin:0 0 16px;letter-spacing:-.01em">${title}</h1>
    <div style="background:#FFFFFF;border:1px solid #D8DBD5;padding:20px;font-size:15px;line-height:1.55">${bodyHtml}</div>
    <p style="font-size:12px;color:#5B6270;margin-top:20px">Everstone Consulting Group LLC, 100 West Road, Suite 300, Towson, Maryland 21204</p>
  </div></body></html>`;
}
