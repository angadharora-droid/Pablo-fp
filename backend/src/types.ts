import type { ObjectId } from "mongodb";

export interface StaffDoc {
  _id?: ObjectId;
  username: string;
  displayName: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
}

export interface AdminDoc {
  _id?: ObjectId;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CounterDoc {
  _id: string;
  value: number;
}

/** An outlet bookings are raised against, e.g. Pablo - The Art Cafe. */
export interface VenueDoc {
  _id?: ObjectId;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

/** Editable mail configuration, so recipients can change without a redeploy. */
export interface MailSettingsDoc {
  _id: string;
  recipients: string[];
  subject: string;
  bodyNote: string;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Field names mirror the original form's input names so the PDF renderer and
 * the frontend can share one vocabulary.
 */
export interface Prospectus {
  _id?: ObjectId;
  serialNo: number;
  fp_no: string;
  reservation_no: string | null;
  submitted_by: string;
  venue_code: string;
  venue_name: string;
  event_date: string;
  time_slot: string;
  function_type: string | null;
  venue: string;
  mg: string | null;
  expected_pax: string | null;
  menu: string;
  party_name: string;
  company_name: string | null;
  gst_no: string | null;
  pan_no: string | null;
  address: string | null;
  contact_person: string | null;
  mobile: string;
  email: string | null;
  seating: string | null;
  add_rooms: string | null;
  rate: string;
  hall_rent: string | null;
  payment: string[];
  advance: string | null;
  transaction_details: string | null;
  board_text: string | null;
  other_charges: string[];
  other_charges_notes: string | null;
  billing: string | null;
  housekeeping: string | null;
  fnb: string | null;
  kitchen: string | null;
  generated_at: string | null;
  mailStatus: "pending" | "sent" | "failed";
  mailError: string | null;
  createdAt: Date;
  updatedAt?: Date;
}
