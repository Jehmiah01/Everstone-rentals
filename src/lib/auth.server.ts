import { secret } from "./config.server";

const COOKIE = "es_admin";
const MAX_AGE = 60 * 60 * 12;

async function hmacKey(): Promise<CryptoKey | null> {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw) return null;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pw}|everstone-admin-session-v1`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function adminConfigured(): boolean {
  return Boolean(secret("ADMIN_PASSWORD"));
}

export async function checkPassword(input: string): Promise<boolean> {
  const pw = secret("ADMIN_PASSWORD");
  if (!pw) return false;
  const a = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const b = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 && a.length === b.length;
}

export async function issueSession(): Promise<string> {
  const key = await hmacKey();
  if (!key) throw new Error("Admin password is not configured");
  const exp = String(Date.now() + MAX_AGE * 1000);
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp)));
  return `${exp}.${sig}`;
}

export async function verifySession(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const token = match.slice(COOKIE.length + 1);
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const key = await hmacKey();
  if (!key) return false;
  const sigBytes = new Uint8Array(sig.length / 2);
  for (let i = 0; i < sigBytes.length; i++) sigBytes[i] = Number.parseInt(sig.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(exp));
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
