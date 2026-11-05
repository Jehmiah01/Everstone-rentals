// The VA (team member) agreement as a document built from the terms the owner
// fills in. Shared by the dashboard (preview, signing page) and the server
// (hash, PDF). Wording matches the agreement drafted with the owner.
import type { AgreementDoc } from "./agreements";
import { prettyDay } from "./dates";

export type TeamTerms = {
  contractorName: string;
  startDate: string;
  weeklyFee: string;
  payDay: string;
  payMethod: string;
  hoursPerWeek: string;
  workingHours: string;
  replyHours: string;
  timeOffDays: string;
  noticeDays: string;
  ownerName: string;
};

export const TERM_FIELDS: { key: keyof TeamTerms; label: string; hint?: string; type?: "date" | "text"; inputMode?: "decimal" | "numeric" | "text" }[] = [
  { key: "contractorName", label: "Her full legal name" },
  { key: "startDate", label: "Start date", type: "date" },
  { key: "weeklyFee", label: "Weekly pay (US $)", inputMode: "decimal", hint: "For example 150" },
  { key: "payDay", label: "Paid every", hint: "For example Monday" },
  { key: "payMethod", label: "Paid by", hint: "For example PayPal, Wise or bank transfer" },
  { key: "hoursPerWeek", label: "Hours per week", inputMode: "numeric", hint: "About how many" },
  { key: "workingHours", label: "Working times (Eastern Time)", hint: "For example 9 AM to 5 PM, Monday to Friday" },
  { key: "replyHours", label: "Replies to messages within (hours)", inputMode: "numeric" },
  { key: "timeOffDays", label: "Notice before time off (days)", inputMode: "numeric" },
  { key: "noticeDays", label: "Notice to end the agreement (days)", inputMode: "numeric" },
  { key: "ownerName", label: "Your name (signs for the company)" },
];

export function emptyTerms(contractorName = "", ownerName = "Jehmiah Johnson"): TeamTerms {
  return {
    contractorName, startDate: "", weeklyFee: "", payDay: "", payMethod: "", hoursPerWeek: "", workingHours: "",
    replyHours: "", timeOffDays: "", noticeDays: "7", ownerName,
  };
}

/** Every blank must be filled before the agreement can be sent. Returns the first missing label, or null. */
export function missingTerm(t: TeamTerms): string | null {
  for (const f of TERM_FIELDS) if (!String(t[f.key] ?? "").trim()) return f.label;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate)) return "Start date";
  if (!(Number.parseFloat(t.weeklyFee.replace(/[$,\s]/g, "")) > 0)) return "Weekly pay (US $)";
  return null;
}

function money(v: string): string {
  const n = Number.parseFloat(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : v;
}

export function buildTeamAgreement(args: {
  number: string;
  terms: TeamTerms;
  contractorEmail: string;
  contractorAddress: string | null;
}): AgreementDoc {
  const t = args.terms;
  const address = args.contractorAddress?.trim() || "to be filled in by the Contractor when signing";
  return {
    kind: "team",
    title: "Virtual Assistant Agreement",
    subtitle: "Everstone Consulting Group LLC",
    number: args.number,
    signingNote:
      "By signing, each party agrees to every term of this Agreement. The parties sign electronically, and an electronic signature counts as an original.",
    sections: [
      {
        number: "1", heading: "Parties and start date",
        blocks: [
          { kind: "paragraphs", text: ["This Virtual Assistant Agreement (the \"Agreement\") is between:"] },
          { kind: "bullets", items: [
            "Everstone Consulting Group LLC, doing business as Providence Rentals, 100 West Road, Suite 300, Towson, Maryland 21204 (the \"Company\"); and",
            `${t.contractorName}, email ${args.contractorEmail}, address ${address} (the "Contractor").`,
          ] },
          { kind: "paragraphs", text: [`The Agreement starts on ${prettyDay(t.startDate)} (the "Start Date") and continues until either party ends it under Section 8.`] },
        ],
      },
      {
        number: "2", heading: "Services",
        blocks: [
          { kind: "paragraphs", text: ["The Contractor will provide virtual assistant services for the Company's car rental business, working in the Company's online dashboard and through the messaging channels the Company approves:"] },
          { kind: "bullets", items: [
            "Review new reservations and make sure renters have signed both rental agreements.",
            "Check the license photos and selfies of renters and additional drivers against the Company's requirements, and approve or reject them.",
            "Approve, decline or cancel reservations following the Company's written rules.",
            "Send payment links and signing reminders, and mark reservations as paid once payment is confirmed.",
            "Record mileage, fuel level and vehicle condition at pickup and return.",
            "Block dates when a vehicle is unavailable.",
            "Answer renter questions politely and professionally.",
            "Other related tasks the Company assigns in writing (a text or email counts).",
          ] },
          { kind: "paragraphs", text: ["When the Contractor approves a reservation, she may countersign the rental agreements in the dashboard as the Company's representative. Without the owner's written approval, the Contractor will not:"] },
          { kind: "bullets", items: [
            "Give refunds or discounts, or change prices, deposits or fees.",
            "Approve a reservation that does not meet the Company's renter requirements: age 18 or older, a valid physical driver's license, and an approved ID check for every driver.",
            "Make promises to renters about insurance, damage or extra charges.",
            "Sign anything else or make any other commitment on the Company's behalf.",
          ] },
        ],
      },
      {
        number: "3", heading: "Pay",
        blocks: [
          { kind: "paragraphs", text: [`The Company will pay the Contractor a flat fee of ${money(t.weeklyFee)} (US dollars) per week. The fee for each week is paid every ${t.payDay} for the week before, by ${t.payMethod}.`] },
          { kind: "bullets", items: [
            "The weekly fee covers all services in that week, however many hours they take.",
            "A partial first or last week is paid in proportion to the days this Agreement was in effect that week.",
            "The Company repays expenses only when it approved them in writing beforehand.",
            "Any change to the fee must be agreed in writing by both parties.",
          ] },
        ],
      },
      {
        number: "4", heading: "Schedule and communication",
        blocks: [{ kind: "paragraphs", text: [
          `The Contractor will be available about ${t.hoursPerWeek} hours per week, during ${t.workingHours} (Eastern Time), and will reply to messages from the Company and from renters within ${t.replyHours} hours during those times.`,
          `The Contractor will tell the Company at least ${t.timeOffDays} days ahead about planned time off. She provides her own computer, phone and internet connection.`,
        ] }],
      },
      {
        number: "5", heading: "Independent contractor status",
        blocks: [
          { kind: "paragraphs", text: ["The Contractor is an independent contractor, not an employee, partner or agent of the Company."] },
          { kind: "bullets", items: [
            "The Contractor decides how to do the work, within the Company's rules and the schedule in Section 4.",
            "The Company does not withhold taxes or provide employee benefits. The Contractor is responsible for her own taxes wherever she lives.",
            "Before the first payment, the Contractor gives the Company a completed tax form: IRS Form W-9 if she is a U.S. person, or Form W-8BEN if she is not.",
            "The Contractor may work for others, as long as that work does not conflict with her duties under this Agreement.",
          ] },
        ],
      },
      {
        number: "6", heading: "Confidentiality and customer information",
        blocks: [
          { kind: "paragraphs", text: ["The Contractor will see private information about renters and the Company: names, addresses, phone numbers, emails, dates of birth, driver's license numbers and photos, selfies, signatures, payment status, prices and other business records (\"Confidential Information\"). The Contractor will:"] },
          { kind: "bullets", items: [
            "Use Confidential Information only to do the work in this Agreement.",
            "Not share it with anyone outside the Company, post it online, or discuss it publicly.",
            "Not download, screenshot, copy or keep it on personal devices or accounts, except briefly when a task requires it, deleting it once the task is done.",
            "Keep her dashboard password private, never let anyone else use her login, and sign out on shared devices.",
            "Tell the Company within 24 hours if she thinks information was lost or seen by the wrong person, or that someone else used her account.",
          ] },
          { kind: "paragraphs", text: ["The Company may change or turn off the Contractor's dashboard access at any time. These duties continue after this Agreement ends."] },
        ],
      },
      {
        number: "7", heading: "Ownership of work",
        blocks: [{ kind: "paragraphs", text: ["Everything the Contractor creates or handles for the Company belongs to the Company, including messages, records, notes and files. When this Agreement ends, the Contractor returns or deletes all Company information she holds and confirms in writing that she has done so."] }],
      },
      {
        number: "8", heading: "Ending the agreement",
        blocks: [{ kind: "paragraphs", text: [
          `Either party may end this Agreement at any time by giving ${t.noticeDays} days' written notice (a text or email counts). The Company may end it immediately, without notice, if the Contractor breaks Section 6 or acts dishonestly.`,
          "On the last day, the Company turns off the Contractor's dashboard access and pays the fee owed through that day, in proportion to the days worked that week.",
        ] }],
      },
      {
        number: "9", heading: "General terms",
        blocks: [{ kind: "paragraphs", text: ["The laws of the State of Maryland govern this Agreement. This document is the whole agreement between the parties on this subject. Any change must be in writing and agreed by both. If any part is found unenforceable, the rest still applies. The parties may sign electronically, and an electronic signature counts as an original."] }],
      },
    ],
  };
}
