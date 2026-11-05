// Shapes the browser receives. Never include secrets or other customers' data.
import type { AgreementDoc } from "./agreements";
import type { TeamTerms } from "./team-agreement";

export type PublicVehicle = {
  id: string; slug: string; year: number; make: string; model: string; color: string | null;
  dailyRateCents: number; weeklyRateCents: number; depositCents: number; seats: number | null;
  transmission: string | null; fuel: string | null; description: string | null; photoUrl: string | null;
  rateConfirmed: boolean;
  rateTable: number[] | null;
  /** Extra driver fee per driver, per rental day. */
  driverFeeCents: number;
  /** Most one extra driver can cost per rental (0 = no cap). */
  driverFeeCapCents: number;
};

export type HomeData = {
  vehicles: PublicVehicle[];
  unavailable: Record<string, string[]>;
  from: string;
  to: string;
};

export type CustomerBookingView = {
  id: string;
  token: string;
  status: string;
  paymentStatus: string;
  paymentLink: string | null;
  paidAt: string | null;
  agreementsSignedAt: string | null;
  verificationStatus: string;
  pickupDate: string; returnDate: string; pickupTime: string; returnTime: string;
  days: number; breakdown: string; totalCents: number; depositCents: number;
  additionalDrivers: string | null;
  vehicle: PublicVehicle;
  customer: {
    fullName: string; email: string; phone: string; address: string; city: string; state: string; zip: string;
    dob: string; dlNumber: string; dlState: string; dlExpiration: string;
  };
  pickupAddress: string | null;
  agreements: { kind: string; status: string; signedAt: string | null; pdfUrl: string | null }[];
  verification: { status: string; licenseUrl: string | null; selfieUrl: string | null } | null;
  /** Additional drivers and their ID check. `link` is a site-relative URL the renter can send to that driver. */
  drivers: CustomerDriver[];
  squareReady: boolean;
  emailReady: boolean;
  createdAt: string;
};

export type CustomerDriver = { id: string; fullName: string; verificationStatus: string; link: string };

/** What a listed driver sees on their own ID check page (opened with the driver's private link). */
export type DriverPageView = {
  driverId: string;
  token: string;
  fullName: string;
  verificationStatus: string;
  renterName: string;
  vehicleName: string;
  pickupDate: string;
  returnDate: string;
  open: boolean;
};

export type AgreementDocs = { rental: AgreementDoc; easy: AgreementDoc };

export type AdminDriver = {
  id: string; fullName: string; phone: string; dob: string; dlNumber: string; dlState: string; dlExpiration: string;
  verificationStatus: string; licenseUrl: string | null; selfieUrl: string | null; submittedAt: string | null;
  notes: string | null; link: string;
};

export type AdminAgreement = {
  kind: string; status: string; signedAt: string | null; signerName: string | null; ip: string | null;
  pdfUrl: string | null; sentAt: string | null; sendCount: number;
};

export type AdminBooking = {
  id: string; token: string; status: string; paymentStatus: string; paymentLink: string | null; paidAt: string | null;
  agreementsSignedAt: string | null; verificationStatus: string; addressSentAt: string | null; approvedAt: string | null;
  repName: string | null; pickupDate: string; returnDate: string; pickupTime: string; returnTime: string; days: number;
  breakdown: string; totalCents: number; depositCents: number; additionalDrivers: string | null; createdAt: string;
  mileageOut: string | null; fuelOut: string | null; conditionNotes: string | null; mileageIn: string | null;
  fuelIn: string | null; actualReturnAt: string | null; damageCents: number | null; feesCents: number | null;
  depositRefundedCents: number | null; depositDeductedCents: number | null; finalPaidCents: number | null; notes: string | null;
  refundedCents: number | null; refundedAt: string | null;
  vehicleId: string; vehicleName: string;
  customer: {
    name: string; email: string; phone: string; address: string; dob: string; dlNumber: string; dlState: string;
    dlExpiration: string; verifiedAt: string | null;
  };
  agreements: AdminAgreement[];
  verification: { status: string; licenseUrl: string | null; selfieUrl: string | null; createdAt: string; notes: string | null } | null;
  drivers: AdminDriver[];
  customerLink: string;
};

export type AdminVehicle = {
  id: string; slug: string; year: number; make: string; model: string; color: string | null; vin: string | null;
  plate: string | null; ownerName: string | null; dailyRateCents: number; weeklyRateCents: number; depositCents: number;
  lateFeeCents: number; lateDailyCents: number; seats: number | null; transmission: string | null; fuel: string | null;
  description: string | null; photoUrl: string | null; active: boolean; rateConfirmed: boolean; rateTable: number[] | null;
  driverFeeCents: number; driverFeeCapCents: number;
};

export type AdminMe = { role: "owner" | "staff"; name: string };

/** The latest agreement the owner sent a team member (none once cancelled). */
export type TeamAgreementSummary = {
  id: string; number: string; status: "sent" | "signed"; terms: TeamTerms; contractorSignedAt: string | null;
  ownerSignedAt: string | null; ownerName: string | null; pdfUrl: string | null; createdAt: string;
};

/** A team member's own agreement, with the full text to read and sign. */
export type MyAgreement = {
  id: string; number: string; status: "sent" | "signed"; doc: AgreementDoc; contractorName: string;
  contractorSignedAt: string | null; ownerSignedAt: string | null; pdfUrl: string | null;
};

export type AdminStaff = {
  id: string; name: string; email: string; active: boolean; locked: boolean; lastLoginAt: string | null; createdAt: string;
  agreement: TeamAgreementSummary | null;
};

export type AdminActivity = { id: string; actor: string; action: string; target: string | null; createdAt: string };

export type AdminData = {
  /** Who is signed in. Team members get a limited dashboard. */
  me: AdminMe;
  /** Owner only; empty for team members. */
  staff: AdminStaff[];
  /** Owner only; empty for team members. */
  activity: AdminActivity[];
  /** Team members only: their agreement. While it's unsigned, nothing else is sent. */
  myAgreement: MyAgreement | null;
  bookings: AdminBooking[];
  vehicles: AdminVehicle[];
  blackouts: { id: string; vehicleId: string; startDate: string; endDate: string; reason: string | null }[];
  emails: { id: string; bookingId: string | null; to: string; subject: string; status: string; error: string | null; createdAt: string }[];
  config: { square: boolean; email: boolean };
};
