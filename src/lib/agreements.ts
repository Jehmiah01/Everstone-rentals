// The two rental agreements as dynamic documents. The clauses are the owner's
// own terms; every customer, vehicle, date and price value is filled in from
// the reservation so nobody types anything twice.
import { fmtMoney, fmtTime12, prettyDay } from "./dates";

export type AgreementField = { label: string; value: string };
export type AgreementBlock =
  | { kind: "fields"; fields: AgreementField[] }
  | { kind: "paragraphs"; text: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "initials"; id: string; label: string };
export type AgreementSection = { number: string; heading: string; blocks: AgreementBlock[] };
export type AgreementDoc = {
  kind: "rental" | "easy_sign";
  title: string;
  subtitle: string;
  number: string;
  sections: AgreementSection[];
  signingNote: string;
};

export type AgreementDriver = { fullName: string; phone: string; dob: string; dlNumber: string; dlState: string; dlExpiration: string };

/** "Jane Doe (License D123, MD; born May 1, 2000; expires June 2, 2030); ..." or the legacy free-text names. */
function driversLine(b: AgreementContext["booking"]): string {
  if (b.drivers.length === 0) return b.additionalDrivers && b.additionalDrivers.trim() !== "" ? b.additionalDrivers : "None";
  return b.drivers
    .map((d) => `${d.fullName} (License ${d.dlNumber}, ${d.dlState}; born ${prettyDay(d.dob)}; expires ${prettyDay(d.dlExpiration)}; phone ${d.phone})`)
    .join("; ");
}

export type AgreementContext = {
  number: string;
  company: { name: string; address: string };
  vehicle: {
    year: number; make: string; model: string; vin: string; plate: string; ownerName: string;
    dailyCents: number; weeklyCents: number; depositCents: number; lateFeeCents: number; lateDailyCents: number;
    rateTable: number[] | null;
  };
  customer: {
    fullName: string; address: string; phone: string; email: string; dlNumber: string; dlState: string;
    dob: string; dlExpiration: string;
  };
  booking: {
    pickupDate: string; pickupTime: string; returnDate: string; returnTime: string; days: number;
    breakdown: string; totalCents: number; additionalDrivers: string;
    /** Listed additional drivers with license details (empty on reservations made before drivers had their own records). */
    drivers: AgreementDriver[];
    paymentStatus: string; paidAt: string | null; paymentMethod: string;
    mileageOut: string; fuelOut: string; conditionNotes: string; preRentalPhotos: boolean;
    actualReturn: string; mileageIn: string; fuelIn: string; damage: string; fees: string;
    depositRefunded: string; depositDeducted: string; finalPaid: string;
  };
};

export const ESIGN_CONSENT =
  "I agree to conduct this transaction electronically and to sign these agreements with an electronic signature under the U.S. ESIGN Act and the Maryland Uniform Electronic Transactions Act. I understand my electronic signature is legally binding and that I can request a paper copy of the signed agreements at any time.";

export const LICENSE_ATTESTATION =
  "I am at least 18 years old and I will present my valid physical driver's license at pickup. I understand that a learner's permit, a digital copy of a license, or an international driving permit on its own is not accepted.";

const or = (value: string | null | undefined, fallback = "To be completed") =>
  value && value.trim() !== "" ? value : fallback;

function rateScheduleLine(table: number[]): string {
  const tiers = table.map((c, i) => `${i + 1} day${i ? "s" : ""} ${fmtMoney(c)}`).join("; ");
  return `${tiers}. Rentals longer than 7 days: ${fmtMoney(table[6] ?? 0)} per full week plus the schedule price for the remaining days.`;
}

function vehicleLine(v: AgreementContext["vehicle"]) {
  return `${v.year} ${v.make} ${v.model}`;
}

function rentalPeriodLine(b: AgreementContext["booking"]) {
  return `${prettyDay(b.pickupDate)} at ${fmtTime12(b.pickupTime)} through ${prettyDay(b.returnDate)} at ${fmtTime12(b.returnTime)} (${b.days} day${b.days === 1 ? "" : "s"})`;
}

export function buildRentalAgreement(ctx: AgreementContext): AgreementDoc {
  const { company, vehicle: v, customer: c, booking: b } = ctx;
  const deposit = v.depositCents > 0
    ? `A security deposit of ${fmtMoney(v.depositCents)} is required under this Agreement and is held until the Vehicle is returned and inspected.`
    : "No security deposit is required under this Agreement.";
  return {
    kind: "rental",
    title: "Motor Vehicle Rental Agreement",
    subtitle: company.name.toUpperCase(),
    number: ctx.number,
    signingNote:
      "By signing below, the Renter agrees to every term of this Motor Vehicle Rental Agreement for the vehicle and rental period stated above.",
    sections: [
      { number: "1", heading: "Owner", blocks: [{ kind: "paragraphs", text: [`${company.name}, ${company.address}`] }] },
      {
        number: "2", heading: "Vehicle Ownership",
        blocks: [{ kind: "paragraphs", text: [`The ${vehicleLine(v)} is owned by ${or(v.ownerName, company.name)} and is being rented and managed through ${company.name}.`] }],
      },
      {
        number: "3", heading: "Vehicle",
        blocks: [{ kind: "fields", fields: [
          { label: "Vehicle", value: vehicleLine(v) },
          { label: "VIN", value: or(v.vin, "On file with Owner") },
          { label: "Tag No", value: or(v.plate, "On file with Owner") },
        ] }],
      },
      {
        number: "4", heading: "Rental Fees",
        blocks: [{ kind: "fields", fields: [
          { label: "Weekly Rent", value: fmtMoney(v.weeklyCents) },
          { label: v.rateTable ? "Rate Schedule" : "Daily Rate", value: v.rateTable ? rateScheduleLine(v.rateTable) : fmtMoney(v.dailyCents) },
          { label: "This Rental", value: `${b.breakdown}; total ${fmtMoney(b.totalCents)}` },
          { label: "Security Deposit", value: fmtMoney(v.depositCents) },
          { label: "Insurance", value: fmtMoney(0) },
          { label: "Late Fee", value: `${fmtMoney(v.lateFeeCents)} immediately after the due date, plus an additional ${fmtMoney(v.lateDailyCents)} for each day the payment remains unpaid.` },
        ] }],
      },
      {
        number: "5", heading: "Payment Schedule",
        blocks: [{ kind: "paragraphs", text: [
          "Weekly rental payments are due by 6:00 PM Eastern Time and shall be paid through Square, Zelle, or another electronic method approved by Owner.",
          `The rental charge for this Agreement is ${fmtMoney(b.totalCents)} for the period ${rentalPeriodLine(b)}, paid through Square at booking.`,
        ] }],
      },
      {
        number: "6", heading: "Payment Method",
        blocks: [{ kind: "paragraphs", text: ["All payments under this Agreement are made through Square, Zelle, or another electronic method approved by Owner. Owner does not keep the Renter's card on file."] }],
      },
      {
        number: "7", heading: "Additional Charges",
        blocks: [
          { kind: "paragraphs", text: ["Renter agrees to pay any unpaid rent, late fees, damages, towing, tickets, tolls, cleaning charges, smoking charges, excess mileage charges, and any other amounts due under this Agreement through Square, Zelle, or another electronic method approved by Owner."] },
          { kind: "initials", id: "additional_charges", label: "Additional Charges Initials" },
        ],
      },
      {
        number: "8", heading: "Charge Dispute Process",
        blocks: [{ kind: "paragraphs", text: ["Upon the Renter's request, Owner will provide an itemized explanation and reasonable supporting documentation for any additional charges."] }],
      },
      {
        number: "9", heading: "Default",
        blocks: [{ kind: "paragraphs", text: ["If payment remains unpaid for twenty-four (24) hours after the due date, Renter is in default. Owner may demand immediate return of the Vehicle."] }],
      },
      {
        number: "10", heading: "Failure to Return Vehicle",
        blocks: [{ kind: "paragraphs", text: ["If the Renter fails to return the Vehicle after the rental period ends or after Owner lawfully terminates this Agreement, Owner may pursue all legal remedies available, including contacting law enforcement and reporting the Vehicle as stolen or unlawfully retained, where permitted by applicable law."] }],
      },
      {
        number: "11", heading: "Written Notice Before Repossession",
        blocks: [{ kind: "paragraphs", text: ["Owner will generally provide written notice before any non-emergency repossession or recovery of the Vehicle, unless immediate action is legally justified or necessary to protect the Vehicle, persons, or property, or unless otherwise required or permitted by applicable law."] }],
      },
      { number: "12", heading: "Security Deposit", blocks: [{ kind: "paragraphs", text: [deposit] }] },
      {
        number: "13", heading: "Driver Requirements",
        blocks: [{ kind: "paragraphs", text: [
          "Renter must be at least 18 years old, possess a valid driver's license (a learner's permit, a digital copy of a license, or an international driving permit on its own is not accepted), have no suspended or revoked driving privileges, complete a one-time identity and license verification with Owner at the first booking, and comply with all insurance/protection requirements applicable to the rental.",
          // Added only when drivers are listed, so agreements signed before this clause existed render unchanged.
          ...(b.drivers.length > 0
            ? ["Each additional authorized driver listed in Section 24 must meet the same requirements and complete the same identity and license verification with Owner before operating the Vehicle. No one else may operate the Vehicle. Renter remains responsible for the Vehicle and for each additional driver's use of it under this Agreement."]
            : []),
        ] }],
      },
      {
        number: "14", heading: "Insurance",
        blocks: [{ kind: "paragraphs", text: [
          `No separate insurance fee is charged by ${company.name} under this Agreement.`,
          `Any insurance or protection applicable to the rental is subject to the terms, limits, exclusions, eligibility requirements, and claim procedures of the applicable third-party provider. ${company.name} does not expand or guarantee coverage beyond the third-party provider's terms.`,
        ] }],
      },
      {
        number: "15", heading: "Normal Wear-and-Tear",
        blocks: [{ kind: "paragraphs", text: ["Normal wear-and-tear includes reasonable deterioration resulting from ordinary use, including minor cosmetic aging, light scuffs, and routine part wear. It does not include damage caused by negligence, misuse, abuse, improper operation, or violation of this Agreement."] }],
      },
      {
        number: "16", heading: "Geographic Restriction",
        blocks: [{ kind: "paragraphs", text: ["The Vehicle may only be operated within the State of Maryland and may not be driven more than one hundred (100) miles from Baltimore County, Maryland, without prior written consent of Owner."] }],
      },
      {
        number: "17", heading: "Maintenance and Tires",
        blocks: [{ kind: "paragraphs", text: ["Owner is responsible for ordinary maintenance, routine servicing, normal wear and tear, and mechanical failures that are not caused by the Renter's negligence, misuse, or violation of this Agreement."] }],
      },
      { number: "18", heading: "Fuel", blocks: [{ kind: "paragraphs", text: ["Vehicle must be returned with the same fuel level as when rented."] }] },
      {
        number: "19", heading: "Smoking",
        blocks: [{ kind: "paragraphs", text: ["Smoking or vaping in the Vehicle is strictly prohibited and results in forfeiture of the entire Security Deposit."] }],
      },
      {
        number: "20", heading: "Cleaning and Lost Keys",
        blocks: [{ kind: "paragraphs", text: ["Excessive dirt, stains, odors, pet hair, trash, or lost keys may result in forfeiture of the Security Deposit and additional charges."] }],
      },
      {
        number: "21", heading: "Tickets, Tolls, and Towing",
        blocks: [{ kind: "paragraphs", text: ["Renter is solely responsible for all tickets, tolls, citations, towing charges, impound fees, and storage fees incurred during the rental period."] }],
      },
      {
        number: "22", heading: "Owner Liability (Graves Amendment)",
        blocks: [{ kind: "paragraphs", text: ["To the fullest extent permitted by applicable law, including the federal Graves Amendment (49 U.S.C. Section 30106), Renter acknowledges that Owner shall not be liable solely by reason of ownership of the Vehicle for any accident, injury, death, property damage, or other loss arising out of the Renter's possession, operation, or use of the Vehicle. Nothing in this Agreement limits any liability imposed on the Owner by law for the Owner's own negligence or other conduct for which liability cannot legally be waived."] }],
      },
      {
        number: "23", heading: "Indemnification",
        blocks: [{ kind: "paragraphs", text: [`To the fullest extent permitted by law, Renter agrees to defend, indemnify, and hold harmless Owner, ${company.name}, and its owners, members, officers, employees, and agents from claims, liabilities, damages, judgments, fines, penalties, losses, costs, and expenses arising out of or related to the Renter's possession, operation, use, misuse, parking, storage, or return of the Vehicle during the rental period. This does not apply to the extent a claim results from the Owner's own negligence, willful misconduct, or liability that cannot legally be waived.`] }],
      },
      {
        number: "24", heading: "Renter",
        blocks: [{ kind: "fields", fields: [
          { label: "Full Legal Name", value: c.fullName },
          { label: "Address", value: c.address },
          { label: "Phone", value: c.phone },
          { label: "Email", value: c.email },
          { label: "Driver License #", value: c.dlNumber },
          { label: "Issuing State", value: c.dlState },
          { label: "Rental Period", value: rentalPeriodLine(b) },
          ...(b.drivers.length > 0 ? [{ label: "Additional Authorized Driver(s)", value: driversLine(b) }] : []),
        ] }],
      },
    ],
  };
}

export function buildEasySignAgreement(ctx: AgreementContext): AgreementDoc {
  const { company, vehicle: v, customer: c, booking: b } = ctx;
  return {
    kind: "easy_sign",
    title: "Vehicle Rental Agreement",
    subtitle: company.name,
    number: ctx.number,
    signingNote:
      "By signing, the renter confirms that the information in this agreement is accurate, that the renter received or had the opportunity to review the rental terms, and that only listed authorized drivers may operate the vehicle.",
    sections: [
      {
        number: "1", heading: "Rental Company & Agreement",
        blocks: [{ kind: "fields", fields: [
          { label: "Agreement #", value: ctx.number },
          { label: "Company", value: company.name },
          { label: "Company Location", value: company.address },
        ] }],
      },
      {
        number: "2", heading: "Renter / Authorized Driver",
        blocks: [{ kind: "fields", fields: [
          { label: "Full Legal Name", value: c.fullName },
          { label: "Address", value: c.address },
          { label: "Phone", value: c.phone },
          { label: "Email", value: c.email },
          { label: "Driver License #", value: c.dlNumber },
          { label: "Issuing State/Country", value: c.dlState },
          { label: "Date of Birth", value: prettyDay(c.dob) },
          { label: "License Expiration", value: prettyDay(c.dlExpiration) },
          { label: "Additional Authorized Driver(s)", value: driversLine(b) },
        ] }],
      },
      {
        number: "3", heading: "Rental Vehicle",
        blocks: [{ kind: "fields", fields: [
          { label: "Year / Make / Model", value: vehicleLine(v) },
          { label: "VIN", value: or(v.vin, "On file with Owner") },
          { label: "License Plate", value: or(v.plate, "On file with Owner") },
          { label: "Mileage Out", value: or(b.mileageOut, "Recorded at pickup") },
          { label: "Fuel Level Out", value: or(b.fuelOut, "Recorded at pickup") },
        ] }],
      },
      {
        number: "4", heading: "Rental Period & Charges",
        blocks: [{ kind: "fields", fields: [
          { label: "Pickup Date/Time", value: `${prettyDay(b.pickupDate)} at ${fmtTime12(b.pickupTime)}` },
          { label: "Return Date/Time", value: `${prettyDay(b.returnDate)} at ${fmtTime12(b.returnTime)}` },
          { label: "Rental Rate", value: `${b.breakdown}; total ${fmtMoney(b.totalCents)}` },
          { label: "Security Deposit", value: fmtMoney(v.depositCents) },
          { label: "Excess / Damage Liability (if applicable)", value: "Not applicable" },
        ] }],
      },
      {
        number: "5", heading: "Payment Record",
        blocks: [{ kind: "fields", fields: [
          { label: "Rental Charge Paid", value: b.paymentStatus === "paid" ? `${fmtMoney(b.totalCents)} on ${b.paidAt ?? ""}`.trim() : `${fmtMoney(b.totalCents)} due through Square` },
          { label: "Method", value: b.paymentMethod },
          { label: "Deposit Paid", value: v.depositCents > 0 ? fmtMoney(v.depositCents) : "None required" },
          { label: "Deposit Method", value: v.depositCents > 0 ? b.paymentMethod : "Not applicable" },
        ] }],
      },
      {
        number: "6", heading: "Vehicle Condition at Pickup",
        blocks: [{ kind: "fields", fields: [
          { label: "Existing damage / condition notes", value: or(b.conditionNotes, "Recorded at pickup") },
          { label: "Pre-rental photos/video taken", value: b.preRentalPhotos ? "Yes" : "To be confirmed at pickup" },
        ] }],
      },
      {
        number: "7", heading: "Rental Terms",
        blocks: [
          { kind: "bullets", items: [
            "Only listed authorized drivers may operate the vehicle.",
            "Renter must maintain required insurance/protection and comply with its terms.",
            "Accident, theft, vandalism, loss, or damage must be promptly reported.",
            "Renter must cooperate with documentation reasonably required for an incident or claim.",
            "Extensions must be approved before the scheduled return time.",
            "Renter is responsible for renter-attributable tolls, tickets, towing and impound charges to the extent permitted by law.",
            "No smoking in the vehicle.",
          ] },
          { kind: "fields", fields: [{ label: "Additional agreed restrictions/terms", value: "The Motor Vehicle Rental Agreement with the same agreement number applies in full." }] },
        ],
      },
      {
        number: "8", heading: "Accident / Damage Documentation",
        blocks: [{ kind: "paragraphs", text: ["Preserve photos, correspondence, incident/police reports when applicable, damage reports, repair invoices, final damage invoices, payment records, and deposit refund/deduction records."] }],
      },
      {
        number: "9", heading: "Return & Final Charges",
        blocks: [{ kind: "fields", fields: [
          { label: "Actual Return Date/Time", value: or(b.actualReturn, "Recorded at return") },
          { label: "Mileage In", value: or(b.mileageIn, "Recorded at return") },
          { label: "Fuel Level In", value: or(b.fuelIn, "Recorded at return") },
          { label: "Damage Charges", value: or(b.damage, "Recorded at return") },
          { label: "Fees/Taxes/Other", value: or(b.fees, "Recorded at return") },
          { label: "Deposit Refunded", value: or(b.depositRefunded, "Recorded at return") },
          { label: "Deposit Deducted", value: or(b.depositDeducted, "Recorded at return") },
          { label: "Final Amount Paid", value: or(b.finalPaid, "Recorded at return") },
        ] }],
      },
      {
        number: "10", heading: "Claim File Checklist",
        blocks: [{ kind: "bullets", items: [
          "Driver's license photos",
          "Payment records",
          "Rental correspondence",
          "Pre/post-rental photos",
          "Incident documents, if applicable",
        ] }],
      },
    ],
  };
}

export function agreementPlainText(doc: AgreementDoc): string {
  const lines: string[] = [doc.subtitle, doc.title, `Agreement # ${doc.number}`];
  for (const s of doc.sections) {
    lines.push(`${s.number}. ${s.heading}`);
    for (const blk of s.blocks) {
      if (blk.kind === "fields") for (const f of blk.fields) lines.push(`${f.label}: ${f.value}`);
      else if (blk.kind === "paragraphs") lines.push(...blk.text);
      else if (blk.kind === "bullets") lines.push(...blk.items.map((i) => `- ${i}`));
      else lines.push(`[${blk.label}]`);
    }
  }
  lines.push(doc.signingNote);
  return lines.join("\n");
}
