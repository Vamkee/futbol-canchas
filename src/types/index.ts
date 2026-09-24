export const BOOKING_STATUS = [
  "hold",
  "pending_review",
  "pending_approval",
  "confirmed",
  "awaiting_closure",
  "completed",
  "no_show",
  "expired",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

export type SlotStatus = "free" | "occupied" | "closed";

export interface Business {
  id: string;
  slug: string;
  commercial_name: string;
}

export interface Venue {
  id: string;
  business_id: string;
  name: string;
  address: string | null;
  amenities: string[];
  active: boolean;
}

export interface Unit {
  id: string;
  venue_id: string;
  zone_id: string | null;
  name: string;
  surface: "synthetic" | "natural_grass" | "sand" | "other";
  active: boolean;
}

export interface Space {
  id: string;
  business_id: string;
  venue_id: string;
  slug: string;
  name: string;
  description: string | null;
  photos: string[];
  capacity: number | null;
  min_minutes: number;
  step_minutes: number;
  max_minutes: number;
  visible: boolean;
  active: boolean;
}

export interface Modality {
  id: string;
  sport_id: string;
  code: string;
  name: string;
}

export interface AvailabilitySlot {
  starts_at: string;
  ends_at: string;
  status: SlotStatus;
}

export interface PriceLine {
  starts_at: string;
  ends_at: string;
  price_per_hour: number;
  amount: number;
}

export interface Quote {
  lines: PriceLine[];
  subtotal: number;
  discount_total: number;
  total: number;
  deposit_required: number;
  balance: number;
}

export interface PaymentAccountInfo {
  id: string;
  kind: "bank_transfer" | "nequi" | "daviplata" | "cash" | "other";
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  holder_name: string | null;
  instructions: string | null;
}

export interface Booking {
  id: string;
  code: string;
  business_id: string;
  venue_id: string;
  space_id: string;
  modality_id: string | null;
  customer_id: string;
  origin: "web" | "manual";
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  subtotal: number;
  discount_total: number;
  total: number;
  deposit_required: number;
  hold_expires_at: string | null;
  review_due_at: string | null;
  approval_expires_at: string | null;
  balance_due_at: string | null;
  checked_in_at: string | null;
  no_show_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  rejection_count: number;
  change_count: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  method: "bank_transfer" | "nequi" | "daviplata" | "cash" | "other";
  declared_amount: number;
  verified_amount: number | null;
  reference: string | null;
  status: "submitted" | "approved" | "rejected" | "voided";
  submitted_at: string;
  rejection_reason: string | null;
  rejection_note: string | null;
}

export interface PaymentProof {
  id: string;
  payment_id: string;
  storage_path: string;
  sha256: string;
}

/** Fila enriquecida de reserva para el panel del negocio. */
export interface BookingRow extends Booking {
  space: Pick<Space, "id" | "name" | "slug"> | null;
  customer: { name: string; phone_e164: string } | null;
  payments: (Payment & { payment_proofs: PaymentProof[] })[];
  comprobante_signed_url: string | null;
}

export interface Block {
  id: string;
  business_id: string;
  venue_id: string;
  reason_kind: "maintenance" | "emergency" | "other";
  public_label: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string;
  released_at: string | null;
}

export interface BlockRow extends Block {
  venue: Pick<Venue, "id" | "name"> | null;
}

export interface AffectedBooking {
  booking_id: string;
  code: string;
  status: BookingStatus;
}
