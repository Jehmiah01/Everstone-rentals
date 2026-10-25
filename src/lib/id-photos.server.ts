// Shared handling for ID photo uploads (front of license + selfie holding it),
// used by the renter's check and by each additional driver's check.
import { storage } from "./db.server";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
const EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

function extFor(file: File): string | null {
  const fromType = TYPES[file.type];
  if (fromType) return fromType;
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTS.has(fromName) ? (fromName === "jpeg" ? "jpg" : fromName) : null;
}

export type StoredIdPhotos = { ok: true; license: string; selfie: string } | { ok: false; error: string };

/**
 * Reads the `license` and `selfie` files from the form, checks size and type,
 * and stores them under the keys `keyFor` returns.
 */
export async function storeIdPhotos(
  form: FormData,
  keyFor: (label: "license" | "selfie", ext: string) => string,
  who: "renter" | "driver",
): Promise<StoredIdPhotos> {
  const missing = {
    license: who === "renter" ? "Add a photo of the front of your driver's license" : "Add a photo of the front of the driver's license",
    selfie: who === "renter" ? "Add a selfie of you holding your license" : "Add a selfie of the driver holding their license",
  };
  const files: ["license" | "selfie", FormDataEntryValue | null][] = [["license", form.get("license")], ["selfie", form.get("selfie")]];
  // Check both files before storing either, so a bad second photo leaves nothing behind.
  for (const [label, file] of files) {
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: missing[label] };
    if (file.size > MAX_BYTES) return { ok: false, error: "Each photo must be under 10 MB" };
    if (!extFor(file)) return { ok: false, error: "Photos must be JPG, PNG, WEBP or HEIC" };
  }
  const stored: Partial<Record<"license" | "selfie", string>> = {};
  for (const [label, entry] of files) {
    const file = entry as File;
    const ext = extFor(file) as string;
    const key = keyFor(label, ext);
    await storage().put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}` },
    });
    stored[label] = key;
  }
  return { ok: true, license: stored.license as string, selfie: stored.selfie as string };
}
