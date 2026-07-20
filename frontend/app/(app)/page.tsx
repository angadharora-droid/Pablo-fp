"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, saveBase64Pdf, ApiError } from "@/lib/api";
import { useSession } from "../providers";

const TIME_SLOTS = [
  "Lunch (12:00 - 15:00)",
  "Hi-Tea (16:00 - 18:00)",
  "Dinner (19:00 - 00:00)",
];
const FUNCTION_TYPES = ["Social", "Corporate"];
const PAYMENT_MODES = ["Cash", "Card", "UPI"];
const OTHER_CHARGES = ["Alcohol", "DJ", "AV", "Other Charges"];

const EMPTY = {
  reservation_no: "",
  date: "",
  time: "",
  function_type: "",
  venue: "",
  mg: "",
  expected_pax: "",
  menu: "",
  party_name: "",
  company_name: "",
  gst_no: "",
  pan_no: "",
  address: "",
  contact_person: "",
  mobile: "",
  email: "",
  seating: "",
  add_rooms: "",
  rate: "",
  hall_rent: "",
  advance: "",
  transaction_details: "",
  board_text: "",
  other_charges_notes: "",
  billing: "",
  housekeeping: "",
  fnb: "",
  kitchen: "",
};

type Fields = typeof EMPTY;

function fieldsFromBooking(doc: Record<string, unknown>): Fields {
  const fields = { ...EMPTY };
  for (const key of Object.keys(fields) as (keyof Fields)[]) {
    const value = doc[key];
    fields[key] = typeof value === "string" ? value : "";
  }
  fields.date = typeof doc.event_date === "string" ? doc.event_date : "";
  fields.time = typeof doc.time_slot === "string" ? doc.time_slot : "";
  return fields;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(d: Date) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** New Booking — the function prospectus form. */
export default function NewBookingPage() {
  const { session, venue, signOut } = useSession();
  const editingId = new URLSearchParams(window.location.search).get("edit");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [payment, setPayment] = useState<string[]>([]);
  const [otherCharges, setOtherCharges] = useState<string[]>([]);
  const [fpDisplay, setFpDisplay] = useState("PABLO FP / AUTO");
  const [timestamp, setTimestamp] = useState(() => stamp(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(Boolean(editingId));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    fp: string;
    mailed: boolean;
    mailError: string | null;
    edited: boolean;
  } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const refreshFp = useCallback(() => {
    if (editingId) return;
    apiGet("/api/next-fp")
      .then((d) => setFpDisplay(d.display))
      .catch(() => setFpDisplay("PABLO FP / AUTO"));
  }, [editingId]);

  useEffect(() => {
    refreshFp();
  }, [refreshFp]);

  useEffect(() => {
    if (!editingId || !session) return;
    setLoadingBooking(true);
    apiGet(`/api/bookings/${editingId}`, session.token)
      .then((doc) => {
        setFields(fieldsFromBooking(doc));
        setPayment(Array.isArray(doc.payment) ? doc.payment : []);
        setOtherCharges(Array.isArray(doc.other_charges) ? doc.other_charges : []);
        setFpDisplay(typeof doc.fp_no === "string" ? doc.fp_no : "PABLO FP");
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Could not load this booking.";
        setError(message);
        if (/sign in|expired/i.test(message)) signOut();
      })
      .finally(() => setLoadingBooking(false));
  }, [editingId, session, signOut]);

  // Live clock, mirroring the original page's ticking timestamp.
  useEffect(() => {
    const id = setInterval(() => setTimestamp(stamp(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const result = await apiSend(
        editingId ? `/api/prospectus/${editingId}` : "/api/prospectus",
        editingId ? "PUT" : "POST",
        {
          ...fields,
          payment,
          other_charges: otherCharges,
          generated_at: timestamp,
          venue_code: venue?.code,
        },
        session.token
      );

      saveBase64Pdf(result.pdfBase64, result.filename);
      setSuccess({ fp: result.fp_no, mailed: result.mailed, mailError: result.mailError, edited: Boolean(editingId) });

      if (!editingId) {
        setFields(EMPTY);
        setPayment([]);
        setOtherCharges([]);
        refreshFp();
      }
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not reach the server. Please try again.";
      setError(message);
      // An expired session sends the user back to the sign-in screen.
      if (/sign in|expired/i.test(message)) signOut();
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) return null;
  if (loadingBooking) return <div className="notice">Loading booking…</div>;

  return (
    <>
      <div ref={topRef} />

      {error && <div className="notice notice-error">{error}</div>}

      {success && (
        <div className={`notice ${success.mailed ? "notice-success" : "notice-warn"}`}>
          <strong>{success.fp} {success.edited ? "updated" : "saved"}.</strong> The PDF has downloaded.{" "}
          {success.mailed
            ? "It has also been emailed to the distribution list."
            : `The email could not be sent (${success.mailError ?? "unknown error"}). The record is saved — resend it from the admin panel.`}
        </div>
      )}

      {editingId && (
        <div className="notice notice-warn">
          Editing <strong>{fpDisplay}</strong>. Saving will update this booking without changing its FP number.{" "}
          <a href="/bookings">Cancel editing</a>
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-wrap">
          <table className="no-border">
            <tbody>
              <tr>
                <td style={{ width: "33%" }}>
                  <strong>Reservation No :</strong>{" "}
                  <input type="text" value={fields.reservation_no} onChange={set("reservation_no")} />

                  <div style={{ marginTop: 8 }}>
                    <strong>Submitted By :</strong> {session.displayName}
                  </div>
                </td>
                <td style={{ width: "34%" }} className="center">
                  <strong>PABLO</strong>
                </td>
                <td style={{ width: "33%", textAlign: "right" }}>
                  <strong>PABLO FP / SR :</strong>
                  <br />
                  <span style={{ fontWeight: "bold" }}>{fpDisplay}</span>
                </td>
              </tr>
            </tbody>
          </table>

          <h2>PABLO FUNCTION PROSPECTUS</h2>

          <table>
            <tbody>
              <tr>
                <th>
                  Date <span className="req">*</span>
                </th>
                <th>
                  Time <span className="req">*</span>
                </th>
                <th>Type of Function</th>
                <th>
                  Venue <span className="req">*</span>
                </th>
                <th>MG</th>
                <th>Expected Pax</th>
              </tr>
              <tr>
                <td>
                  <input type="date" required min={editingId ? undefined : today} value={fields.date} onChange={set("date")} />
                </td>
                <td>
                  <select required value={fields.time} onChange={set("time")}>
                    <option value="">Select Time Slot</option>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={fields.function_type} onChange={set("function_type")}>
                    <option value="">Select</option>
                    {FUNCTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="text" required value={fields.venue} onChange={set("venue")} />
                </td>
                <td>
                  <input type="text" value={fields.mg} onChange={set("mg")} />
                </td>
                <td>
                  <input type="text" value={fields.expected_pax} onChange={set("expected_pax")} />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <th style={{ width: "45%" }}>
                  Menu <span className="req">*</span>
                </th>
                <th style={{ width: "55%" }}>Party Details</th>
              </tr>
              <tr>
                <td className="menu-area">
                  <textarea required value={fields.menu} onChange={set("menu")} />
                </td>
                <td>
                  <strong>
                    Name of Party <span className="req">*</span>
                  </strong>
                  <br />
                  <input type="text" required value={fields.party_name} onChange={set("party_name")} />
                  <br />
                  <br />
                  <strong>Company Name</strong>
                  <br />
                  <input type="text" value={fields.company_name} onChange={set("company_name")} />
                  <br />
                  <br />
                  <strong>GST No</strong>
                  <br />
                  <input type="text" value={fields.gst_no} onChange={set("gst_no")} />
                  <br />
                  <br />
                  <strong>PAN No</strong>
                  <br />
                  <input type="text" value={fields.pan_no} onChange={set("pan_no")} />
                  <br />
                  <br />
                  <strong>Address</strong>
                  <br />
                  <textarea value={fields.address} onChange={set("address")} />
                  <br />
                  <strong>Contact Person</strong>
                  <br />
                  <input type="text" value={fields.contact_person} onChange={set("contact_person")} />
                  <br />
                  <br />
                  <strong>
                    Telephone / Mobile <span className="req">*</span>
                  </strong>
                  <br />
                  <input type="text" required value={fields.mobile} onChange={set("mobile")} />
                  <br />
                  <br />
                  <strong>Email</strong>
                  <br />
                  <input type="email" value={fields.email} onChange={set("email")} />
                  <br />
                  <br />
                  <strong>Seating Arrangement</strong>
                  <br />
                  <input type="text" value={fields.seating} onChange={set("seating")} />
                  <br />
                  <br />
                  <strong>Add on Rooms</strong>
                  <br />
                  <input type="text" value={fields.add_rooms} onChange={set("add_rooms")} />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <td>
                  <strong>
                    Rate <span className="req">*</span>
                  </strong>
                  <br />
                  <input type="text" required value={fields.rate} onChange={set("rate")} />
                </td>
                <td>
                  <strong>Hall Rent</strong>
                  <br />
                  <input type="text" value={fields.hall_rent} onChange={set("hall_rent")} />
                </td>
                <td>
                  <strong>Mode of Payment</strong>
                  <br />
                  {PAYMENT_MODES.map((mode) => (
                    <label key={mode} className="oc-item" style={{ display: "inline-flex", marginRight: 12 }}>
                      <input
                        type="checkbox"
                        checked={payment.includes(mode)}
                        onChange={() => toggle(payment, mode, setPayment)}
                      />{" "}
                      {mode}
                    </label>
                  ))}
                </td>
                <td>
                  <strong>Advance Amt</strong>
                  <br />
                  <input type="text" value={fields.advance} onChange={set("advance")} />
                  <br />
                  <br />
                  <strong>Transaction Details</strong>
                  <br />
                  <textarea
                    style={{ height: 60 }}
                    value={fields.transaction_details}
                    onChange={set("transaction_details")}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <th>Board to Read</th>
              </tr>
              <tr>
                <td>
                  <textarea value={fields.board_text} onChange={set("board_text")} />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <th>Other Charges (Alcohol / DJ / AV / Other)</th>
              </tr>
              <tr>
                <td>
                  <div className="oc-row">
                    {OTHER_CHARGES.map((charge) => (
                      <label key={charge} className="oc-item">
                        <input
                          type="checkbox"
                          checked={otherCharges.includes(charge)}
                          onChange={() => toggle(otherCharges, charge, setOtherCharges)}
                        />
                        <span>{charge}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <strong>Details / Amount</strong>
                  </div>
                  <textarea
                    className="boxed"
                    style={{ height: 120 }}
                    value={fields.other_charges_notes}
                    onChange={set("other_charges_notes")}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <th>Billing Instruction</th>
              </tr>
              <tr>
                <td>
                  <textarea value={fields.billing} onChange={set("billing")} />
                </td>
              </tr>
            </tbody>
          </table>

          <br />

          <table>
            <tbody>
              <tr>
                <th colSpan={3}>Department Instruction</th>
              </tr>
              <tr>
                <td>
                  <strong>Housekeeping</strong>
                  <br />
                  <textarea value={fields.housekeeping} onChange={set("housekeeping")} />
                </td>
                <td>
                  <strong>F&amp;B</strong>
                  <br />
                  <textarea value={fields.fnb} onChange={set("fnb")} />
                </td>
                <td>
                  <strong>Kitchen</strong>
                  <br />
                  <textarea value={fields.kitchen} onChange={set("kitchen")} />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="timestamp-row">
            <div className="timestamp-box">
              <strong>Timestamp:</strong> <span>{timestamp}</span>
            </div>
          </div>

          <div className="submit-wrap">
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting
                ? editingId
                  ? "UPDATING…"
                  : "SUBMITTING…"
                : editingId
                  ? "UPDATE & DOWNLOAD PDF (A4)"
                  : "SUBMIT & DOWNLOAD PDF (A4)"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
