// Server-only config. Secrets are configured in the website settings and
// arrive as Worker environment bindings; read them per request, never at
// module scope, and never ship them to the browser.
import { env } from "cloudflare:workers";

export function secret(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export const COMPANY = {
  name: "Everstone Consulting Group LLC",
  brand: "Providence Rentals",
  address: "100 West Road, Suite 300, Towson, Maryland 21204",
  city: "Baltimore, Maryland",
};

/** Sent to the customer only once the owner approves the reservation. */
export const PICKUP_ADDRESS = "2121 Gwynn Oak Ave, Gwynn Oak, MD 21207";

export function businessEmail(): string {
  return secret("BUSINESS_EMAIL") ?? "jehmiahjohnson01@gmail.com";
}

export function mailFrom(): string {
  return secret("MAIL_FROM") ?? "Providence Rentals <onboarding@resend.dev>";
}
