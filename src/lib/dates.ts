// Shared (client + server) calendar math on YYYY-MM-DD strings, UTC-anchored.
export function parseDay(day: string): number {
  const [y, m, d] = day.split("-").map((n) => Number.parseInt(n, 10));
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  return formatDay(parseDay(day) + n * 86400000);
}

export function diffDays(start: string, end: string): number {
  return Math.round((parseDay(end) - parseDay(start)) / 86400000);
}

export function todayDay(): string {
  // Calendar day in Baltimore (Eastern Time), YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return formatDay(parseDay(day)) === day;
}

/** Every day from start through end, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = parseDay(start);
  const last = parseDay(end);
  while (cur <= last) {
    out.push(formatDay(cur));
    cur += 86400000;
  }
  return out;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function prettyDay(day: string): string {
  const d = new Date(parseDay(day));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** First day from `from` through `to` that is not booked or blocked, or null if there is none. */
export function firstFreeDay(blocked: Iterable<string>, from: string, to: string): string | null {
  const set = blocked instanceof Set ? (blocked as Set<string>) : new Set(blocked);
  for (let d = from; d <= to; d = addDays(d, 1)) if (!set.has(d)) return d;
  return null;
}

export function shortDay(day: string): string {
  const d = new Date(parseDay(day));
  return `${MONTHS[d.getUTCMonth()]?.slice(0, 3)} ${d.getUTCDate()}`;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}

export function fmtMoney(cents: number): string {
  const dollars = Math.round(cents) / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const hour = h ?? 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** Rental pricing: whole weeks at the weekly rate, remaining days at the daily rate, capped at another week. */
export function priceRental(days: number, dailyCents: number, weeklyCents: number) {
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  const remCost = Math.min(rem * dailyCents, weeklyCents);
  const total = weeks * weeklyCents + remCost;
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks > 1 ? "s" : ""} at ${fmtMoney(weeklyCents)}`);
  if (rem > 0) parts.push(`${rem} day${rem > 1 ? "s" : ""} at ${fmtMoney(dailyCents)} per day${remCost < rem * dailyCents ? " (capped at the weekly rate)" : ""}`);
  return { days, weeks, rem, total_cents: total, breakdown: parts.join(" + ") || `${fmtMoney(0)}` };
}

export function ageOn(dob: string, day: string): number {
  const b = new Date(parseDay(dob));
  const d = new Date(parseDay(day));
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    d.getUTCMonth() < b.getUTCMonth() ||
    (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Timestamp in Eastern Time for agreements and PDFs, e.g. "October 21, 2026 at 3:35 PM EDT". */
export function formatEt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  })
    .format(d)
    .replace(/[  ]/g, " ");
}

/** Owner's price table: total cents for 1..7 days. Returns null when missing or malformed. */
export function parseRateTable(raw: unknown): number[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr) && arr.length === 7 && arr.every((n) => Number.isInteger(n) && (n as number) >= 0)) return arr as number[];
  } catch {
    return null;
  }
  return null;
}

/** Full weeks at the 7-day price, plus the table price for the remaining days. */
export function priceFromTable(days: number, table: number[]) {
  const weekly = table[6] ?? 0;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  const remCost = rem > 0 ? (table[rem - 1] ?? 0) : 0;
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks > 1 ? "s" : ""} at ${fmtMoney(weekly)}`);
  if (rem > 0) parts.push(`${rem} day${rem > 1 ? "s" : ""} for ${fmtMoney(remCost)}`);
  return { days, weeks, rem, total_cents: weeks * weekly + remCost, breakdown: parts.join(" + ") };
}

/**
 * Extra driver charge: every listed driver, every rental day, with each driver
 * capped at `capPerDriverCents` per rental (0 = no cap). Plain wording, safe for the PDF font.
 */
export function extraDriverCharge(
  drivers: number,
  days: number,
  feePerDayCents: number,
  capPerDriverCents = 0,
): { cents: number; perDriverCents: number; capped: boolean; line: string } {
  const uncapped = days > 0 && feePerDayCents > 0 ? days * feePerDayCents : 0;
  const capped = capPerDriverCents > 0 && uncapped > capPerDriverCents;
  const perDriverCents = capped ? capPerDriverCents : uncapped;
  const cents = drivers > 0 ? drivers * perDriverCents : 0;
  if (cents === 0) return { cents: 0, perDriverCents, capped, line: "" };
  const who = drivers === 1 ? "1 extra driver" : `${drivers} extra drivers`;
  const rate = capped
    ? `at ${fmtMoney(feePerDayCents)} a day, capped at ${fmtMoney(capPerDriverCents)} per driver`
    : `at ${fmtMoney(feePerDayCents)} a day`;
  return { cents, perDriverCents, capped, line: `${who} for ${days} day${days === 1 ? "" : "s"} ${rate} (${fmtMoney(cents)})` };
}

export function priceVehicle(days: number, v: { rateTable: number[] | null; dailyRateCents: number; weeklyRateCents: number }) {
  return v.rateTable ? priceFromTable(days, v.rateTable) : priceRental(days, v.dailyRateCents, v.weeklyRateCents);
}
