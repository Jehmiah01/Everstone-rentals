import { useEffect, useMemo, useState } from "react";

import { ContinueButton } from "./form";

const fileInputClass =
  "block w-full text-sm text-subtle file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-ink file:px-4 file:font-medium file:text-surface hover:file:bg-cobalt-deep";

function usePreview(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/**
 * License photo + selfie upload. `fields` are sent alongside the two photos
 * (the reservation or driver id and its private token).
 * `subject` is "you" for the person filling it in, or the driver's name when
 * the renter uploads on someone else's behalf.
 */
export function IdPhotoForm({ endpoint, fields, subject, idPrefix, onDone }: {
  endpoint: string;
  fields: Record<string, string>;
  subject: "you" | { name: string };
  idPrefix: string;
  onDone: () => void;
}) {
  const [license, setLicense] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const licensePreview = usePreview(license);
  const selfiePreview = usePreview(selfie);
  const self = subject === "you";
  const name = self ? "" : subject.name;

  async function submit() {
    if (!license || !selfie) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append("license", license);
      form.append("selfie", selfie);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="leading-relaxed text-subtle">
        {self ? "Required once, before you get the keys." : `Required before ${name} drives.`} Take clear, well-lit photos. Use the physical license; a photo of a screen, a permit or an international driving permit alone is not accepted.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-license`} className="block text-sm font-medium">
            {self ? "Front of your driver's license" : `Front of ${name}'s driver's license`}
          </label>
          <input id={`${idPrefix}-license`} type="file" accept="image/*,.heic,.heif" onChange={(e) => setLicense(e.target.files?.[0] ?? null)} className={`mt-2 ${fileInputClass}`} />
          {licensePreview ? <img src={licensePreview} alt="License photo preview" className="mt-3 aspect-[3/2] w-full border border-line object-cover" /> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-selfie`} className="block text-sm font-medium">
            {self ? "Selfie holding your license next to your face" : `Photo of ${name} holding their license next to their face`}
          </label>
          <input id={`${idPrefix}-selfie`} type="file" accept="image/*,.heic,.heif" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} className={`mt-2 ${fileInputClass}`} />
          {selfiePreview ? <img src={selfiePreview} alt="Selfie preview" className="mt-3 aspect-[3/2] w-full border border-line object-cover" /> : null}
        </div>
      </div>
      {error ? <p role="alert" className="border border-danger bg-danger-tint p-4 text-sm text-danger">{error}</p> : null}
      <ContinueButton type="button" onClick={submit} disabled={!license || !selfie} busy={busy}>Upload photos</ContinueButton>
    </div>
  );
}
