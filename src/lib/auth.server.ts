// Dashboard sign-in. The owner signs in with ADMIN_PASSWORD; team members
// (for example a VA) sign in with their own email and password, created by the
// owner in the dashboard. Sessions are HMAC-signed cookies that name who is
// signed in; a team member's session stops working as soon as their access is
// turned off or removed.
import { secret } from "./config.server";
import { db } from "./db.server";

const COOKIE = "es_admin";
const MAX_AGE = 60 * 60 * 12;
// Kept modest so a sign-in stays inside the Workers CPU budget. Team passwords
// must be at least 10 characters and repeated wrong guesses lock the account.
const PBKDF2_ITERATIONS = 20_000;

export type StaffRow = {
  id: string; name: string; email: string; password_hash: string; password_salt: string; password_iterations: number;
  active: number; failed_logins: number; locked_until: string | null; last_login_at: string | null; created_at: string;
};

export type Session =
  | { role: "owner"; name: string }
  | { role: "staff"; staffId: string; name: string; email: string };

async function hmacKey(): Promise<CryptoKey | null> {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pw}|everstone-admin-session-v1`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function adminConfigured(): boolean {
  return Boolean(secret("ADMIN_PASSWORD"));
}

/** The owner's password (the ADMIN_PASSWORD secret). */
export async function checkPassword(input: string): Promise<boolean> {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw) return false;
  const a = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const b = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)));
  return sameString(a, b);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return hex(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(password, salt, PBKDF2_ITERATIONS), salt: hex(salt), iterations: PBKDF2_ITERATIONS };
}

export async function verifyStaffPassword(row: StaffRow, password: string): Promise<boolean> {
  const got = await pbkdf2(password, fromHex(row.password_salt), row.password_iterations);
  return sameString(got, row.password_hash);
}

/** `sub` is "owner" or a team member's id. */
export async function issueSession(sub = "owner"): Promise<string> {
  const key = await hmacKey();
  if (!key) throw new Error("Admin password is not configured");
  const exp = String(Date.now() + MAX_AGE * 1000);
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${exp}|${sub}`)));
  return `${exp}.${sub}.${sig}`;
}

export async function getSession(request: Request): Promise<Session | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return null;
  const parts = match.slice(COOKIE.length + 1).split(".");
  let exp: string | undefined;
  let sub: string | undefined;
  let sig: string | undefined;
  let signed: string;
  if (parts.length === 2) {
    // Owner sessions issued before team sign-ins existed.
    [exp, sig] = parts;
    sub = "owner";
    signed = exp ?? "";
  } else if (parts.length === 3) {
    [exp, sub, sig] = parts;
    signed = `${exp}|${sub}`;
  } else {
    return null;
  }
  if (!exp || !sub || !sig || Number(exp) < Date.now() || !/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) return null;
  const key = await hmacKey();
  if (!key) return null;
  const ok = await crypto.subtle.verify("HMAC", key, fromHex(sig) as BufferSource, new TextEncoder().encode(signed));
  if (!ok) return null;
  if (sub === "owner") return { role: "owner", name: "Owner" };
  const row = await db()
    .prepare("SELECT id, name, email FROM staff WHERE id = ?1 AND active = 1")
    .bind(sub)
    .first<{ id: string; name: string; email: string }>();
  return row ? { role: "staff", staffId: row.id, name: row.name, email: row.email } : null;
}

export async function verifySession(request: Request): Promise<boolean> {
  return (await getSession(request)) !== null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
