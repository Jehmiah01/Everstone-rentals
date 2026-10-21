// Dependency-free PDF writer for the signed agreements: Letter pages, Helvetica
// text with word wrapping, hairline rules and JPEG signature images. Produces a
// plain PDF 1.4 byte stream that opens in every viewer.
import type { AgreementDoc } from "./agreements";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const BOTTOM = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Helvetica glyph widths (1/1000 em) for codes 32..126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export type SignatureInfo = {
  renterName: string;
  initials: string;
  signedAt: string;
  ip: string;
  userAgent: string;
  docHash: string;
  signatureJpeg: Uint8Array | null;
  repName: string | null;
  repSignedAt: string | null;
};

function normalize(input: string): string {
  return input
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\u0000-ÿ]/g, "?");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function textWidth(s: string, size: number, bold: boolean): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    w += c >= 32 && c <= 126 ? (HELV[c - 32] ?? 556) : 556;
  }
  return (w / 1000) * size * (bold ? 1.05 : 1);
}

function wrap(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if ((b[0] ?? 0) !== 0xff || (b[1] ?? 0) !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if ((b[i] ?? 0) !== 0xff) { i += 1; continue; }
    const marker = b[i + 1] ?? 0;
    if (marker === 0xd8 || marker === 0x01 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: ((b[i + 5] ?? 0) << 8) | (b[i + 6] ?? 0), width: ((b[i + 7] ?? 0) << 8) | (b[i + 8] ?? 0) };
    }
    i += 2 + len;
  }
  return null;
}

type Page = { ops: string[] };

class Pdf {
  pages: Page[] = [];
  images: { data: Uint8Array; width: number; height: number }[] = [];
  y = PAGE_H - MARGIN;
  footerText = "";

  constructor() {
    this.newPage();
  }

  get page(): Page {
    return this.pages[this.pages.length - 1] as Page;
  }

  newPage() {
    this.pages.push({ ops: [] });
    this.y = PAGE_H - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  color(r: number, g: number, b: number) {
    this.page.ops.push(`${r} ${g} ${b} rg`);
  }

  line(text: string, size: number, bold: boolean, x = MARGIN) {
    const font = bold ? "F2" : "F1";
    this.page.ops.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${esc(normalize(text))}) Tj ET`);
  }

  para(text: string, size: number, bold: boolean, x = MARGIN, width = CONTENT_W, leading = 1.4) {
    const lines = wrap(normalize(text), size, bold, width);
    for (const l of lines) {
      this.ensure(size * leading);
      this.y -= size * leading;
      this.line(l, size, bold, x);
    }
  }

  gap(h: number) {
    this.y -= h;
  }

  rule(gray = 0.84) {
    this.ensure(8);
    this.y -= 4;
    this.page.ops.push(`${gray} G 0.6 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S 0 G`);
    this.y -= 4;
  }

  image(data: Uint8Array, drawW: number, drawH: number, x = MARGIN) {
    const size = jpegSize(data);
    if (!size) return false;
    this.ensure(drawH + 6);
    this.y -= drawH;
    this.images.push({ data, width: size.width, height: size.height });
    const name = `Im${this.images.length}`;
    this.page.ops.push(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${this.y.toFixed(2)} cm /${name} Do Q`);
    return true;
  }

  build(): Uint8Array {
    const total = this.pages.length;
    this.pages.forEach((p, i) => {
      const footer = normalize(`${this.footerText}   Page ${i + 1} of ${total}`);
      p.ops.push(`0.45 0.47 0.52 rg BT /F1 8 Tf ${MARGIN} 36 Td (${esc(footer)}) Tj ET 0 g`);
    });

    const objects: Uint8Array[] = [];
    const add = (parts: (string | Uint8Array)[]): number => {
      const chunks = parts.map((p) => (typeof p === "string" ? latin1(p) : p));
      const len = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(len);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      objects.push(out);
      return objects.length;
    };

    const catalogNum = add(["<< /Type /Catalog /Pages 2 0 R >>"]);
    const pagesPlaceholder = add(["<< >>"]);
    const f1 = add(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]);
    const f2 = add(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]);
    const imageNums = this.images.map((im) =>
      add([
        `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`,
        im.data,
        "\nendstream",
      ]),
    );
    const xobjects = imageNums.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(" ");
    const pageNums: number[] = [];
    for (const p of this.pages) {
      const content = latin1(p.ops.join("\n"));
      const contentNum = add([`<< /Length ${content.length} >>\nstream\n`, content, "\nendstream"]);
      const pageNum = add([
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobjects ? `/XObject << ${xobjects} >>` : ""} >> /Contents ${contentNum} 0 R >>`,
      ]);
      pageNums.push(pageNum);
    }
    objects[pagesPlaceholder - 1] = latin1(`<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`);

    const header = latin1("%PDF-1.4\n%âãÏÓ\n");
    const parts: Uint8Array[] = [header];
    const offsets: number[] = [];
    let pos = header.length;
    objects.forEach((obj, i) => {
      offsets.push(pos);
      const head = latin1(`${i + 1} 0 obj\n`);
      const tail = latin1("\nendobj\n");
      parts.push(head, obj, tail);
      pos += head.length + obj.length + tail.length;
    });
    const xrefPos = pos;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    parts.push(latin1(xref));
    const totalLen = parts.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(totalLen);
    let o = 0;
    for (const c of parts) { out.set(c, o); o += c.length; }
    return out;
  }
}

export function renderAgreementPdf(doc: AgreementDoc, sig: SignatureInfo, companyName: string): Uint8Array {
  const pdf = new Pdf();
  pdf.footerText = `Agreement # ${doc.number}   ${companyName}   Signed electronically`;

  pdf.color(0.36, 0.38, 0.44);
  pdf.y -= 10;
  pdf.line(doc.subtitle.toUpperCase(), 9, true);
  pdf.color(0.08, 0.09, 0.11);
  pdf.y -= 22;
  pdf.line(doc.title, 18, true);
  pdf.y -= 16;
  pdf.line(`Agreement # ${doc.number}`, 10, false);
  pdf.rule(0.7);
  pdf.gap(4);

  for (const section of doc.sections) {
    pdf.ensure(40);
    pdf.gap(8);
    pdf.y -= 12;
    pdf.line(`${section.number}. ${section.heading}`, 10.5, true);
    pdf.gap(2);
    for (const blk of section.blocks) {
      if (blk.kind === "paragraphs") {
        for (const t of blk.text) { pdf.para(t, 9.5, false); pdf.gap(3); }
      } else if (blk.kind === "bullets") {
        for (const item of blk.items) {
          const lines = wrap(normalize(item), 9.5, false, CONTENT_W - 14);
          lines.forEach((l, i) => {
            pdf.ensure(13.3);
            pdf.y -= 13.3;
            if (i === 0) pdf.line("\u0095", 9.5, false, MARGIN + 2);
            pdf.line(l, 9.5, false, MARGIN + 14);
          });
        }
        pdf.gap(3);
      } else if (blk.kind === "fields") {
        for (const f of blk.fields) {
          const valueLines = wrap(normalize(f.value), 9.5, false, CONTENT_W - 170);
          const labelLines = wrap(normalize(f.label), 8.5, false, 160);
          const rows = Math.max(valueLines.length, labelLines.length);
          pdf.ensure(rows * 13 + 4);
          for (let i = 0; i < rows; i++) {
            pdf.y -= 13;
            pdf.color(0.36, 0.38, 0.44);
            if (labelLines[i]) pdf.line(labelLines[i] as string, 8.5, false, MARGIN);
            pdf.color(0.08, 0.09, 0.11);
            if (valueLines[i]) pdf.line(valueLines[i] as string, 9.5, false, MARGIN + 170);
          }
          pdf.gap(2);
        }
      } else {
        pdf.ensure(20);
        pdf.y -= 16;
        pdf.line(`${blk.label}: ${sig.initials || "________"}`, 10, true);
        pdf.gap(2);
      }
    }
  }

  pdf.ensure(220);
  pdf.gap(10);
  pdf.rule(0.7);
  pdf.gap(6);
  pdf.para(doc.signingNote, 9.5, false);
  pdf.gap(10);

  pdf.y -= 12;
  pdf.line("RENTER", 9, true);
  pdf.y -= 14;
  pdf.line(`Printed Name: ${sig.renterName}`, 9.5, false);
  pdf.y -= 14;
  pdf.line(`Date / Time: ${sig.signedAt}`, 9.5, false);
  pdf.y -= 14;
  pdf.line("Signature:", 9.5, false);
  if (sig.signatureJpeg && pdf.image(sig.signatureJpeg, 180, 60)) {
    pdf.gap(4);
  } else {
    pdf.y -= 18;
    pdf.line("Signed electronically (typed signature)", 9.5, false, MARGIN + 60);
  }
  pdf.color(0.36, 0.38, 0.44);
  pdf.y -= 12;
  pdf.line(`E-signature record: IP ${sig.ip}, document hash ${sig.docHash.slice(0, 16)}, ${sig.userAgent.slice(0, 80)}`, 7.5, false);
  pdf.color(0.08, 0.09, 0.11);

  pdf.gap(12);
  pdf.ensure(70);
  pdf.y -= 12;
  pdf.line(`${companyName.toUpperCase()} REPRESENTATIVE`, 9, true);
  pdf.y -= 14;
  pdf.line(`Printed Name: ${sig.repName ?? "To be countersigned by " + companyName}`, 9.5, false);
  pdf.y -= 14;
  pdf.line(`Date / Time: ${sig.repSignedAt ?? "Pending"}`, 9.5, false);
  pdf.y -= 14;
  pdf.line(sig.repSignedAt ? `Signature: Signed electronically by ${sig.repName ?? companyName}` : "Signature: ______________________________", 9.5, false);

  return pdf.build();
}
