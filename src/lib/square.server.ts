import { secret } from "./config.server";

const SQUARE_VERSION = "2025-01-23";

function base(): string {
  return secret("SQUARE_ENV") === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

export function squareConfigured(): boolean {
  return Boolean(secret("SQUARE_ACCESS_TOKEN"));
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${secret("SQUARE_ACCESS_TOKEN") ?? ""}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * The Square location payments are filed under: SQUARE_LOCATION_ID if set,
 * otherwise the active location named SQUARE_LOCATION_NAME (default "Gwynn oak"),
 * otherwise the active location at 2121 Gwynn Oak Ave.
 */
async function resolveLocationId(): Promise<string | null> {
  const explicit = secret("SQUARE_LOCATION_ID");
  if (explicit) return explicit;
  const res = await fetch(`${base()}/v2/locations`, { headers: headers() });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as {
    locations?: { id: string; name?: string; status?: string; address?: { address_line_1?: string } }[];
  };
  const active = (body.locations ?? []).filter((l) => l.status !== "INACTIVE");
  const wanted = (secret("SQUARE_LOCATION_NAME") ?? "Gwynn oak").trim().toLowerCase();
  const match =
    active.find((l) => (l.name ?? "").trim().toLowerCase() === wanted) ??
    active.find((l) => (l.address?.address_line_1 ?? "").toLowerCase().includes("2121 gwynn oak"));
  return match?.id ?? null;
}

export async function createPaymentLink(args: {
  bookingId: string;
  amountCents: number;
  name: string;
  buyerEmail: string;
  redirectUrl: string;
}): Promise<{ url: string; orderId: string; id: string }> {
  const locationId = await resolveLocationId();
  if (!locationId) throw new Error("Could not find the Square location for the website. Make sure the Gwynn oak location is active in Square.");
  const res = await fetch(`${base()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      idempotency_key: `${args.bookingId}-${crypto.randomUUID()}`,
      quick_pay: {
        name: args.name.slice(0, 250),
        price_money: { amount: args.amountCents, currency: "USD" },
        location_id: locationId,
      },
      checkout_options: { redirect_url: args.redirectUrl, ask_for_shipping_address: false },
      pre_populated_data: { buyer_email: args.buyerEmail },
      payment_note: `Rental agreement ${args.bookingId}`,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    payment_link?: { url: string; order_id: string; id: string };
    errors?: { detail?: string; code?: string }[];
  };
  if (!res.ok || !body.payment_link) {
    throw new Error(body.errors?.[0]?.detail ?? `Square responded ${res.status}`);
  }
  return { url: body.payment_link.url, orderId: body.payment_link.order_id, id: body.payment_link.id };
}

export async function orderIsPaid(orderId: string): Promise<{ paid: boolean; paymentId: string | null }> {
  const res = await fetch(`${base()}/v2/orders/${encodeURIComponent(orderId)}`, { headers: headers() });
  if (!res.ok) return { paid: false, paymentId: null };
  const body = (await res.json().catch(() => ({}))) as {
    order?: { state?: string; tenders?: { payment_id?: string }[] };
  };
  const tenders = body.order?.tenders ?? [];
  const paid = body.order?.state === "COMPLETED" || tenders.length > 0;
  return { paid, paymentId: tenders[0]?.payment_id ?? null };
}

export async function verifyWebhookSignature(rawBody: string, url: string, signature: string | null): Promise<boolean> {
  const key = secret("SQUARE_WEBHOOK_SIGNATURE_KEY");
  if (!key || !signature) return false;
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(url + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}
