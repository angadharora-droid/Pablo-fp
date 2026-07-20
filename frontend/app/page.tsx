"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, saveBase64Pdf, ApiError } from "@/lib/api";

const TIME_SLOTS = [
  "Lunch (12:00 - 15:00)",
  "Hi-Tea (16:00 - 18:00)",
  "Dinner (19:00 - 00:00)",
];
const FUNCTION_TYPES = ["Social", "Corporate"];
const PAYMENT_MODES = ["Cash", "Card", "UPI"];
const OTHER_CHARGES = ["Alcohol", "DJ", "AV", "Other Charges"];

const TOKEN_KEY = "pablo_staff_token";

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
type Staff = { username: string; displayName: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(d: Date) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

interface Session {
  token: string;
  displayName: string;
}

/** The form is gated: staff sign in first, then it opens. */
export default function ProspectusPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    // Confirm the stored token has not expired before opening the form.
    apiGet("/api/staff/me", token)
      .then((me) => setSession({ token, displayName: me.displayName }))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  }, []);

  function onSignedIn(next: Session) {
    localStorage.setItem(TOKEN_KEY, next.token);
    setSession(next);
  }

  if (!ready) return null;
  if (!session) return <StaffLogin onSignedIn={onSignedIn} />;

  return <ProspectusForm session={session} onSignOut={signOut} />;
}

function StaffLogin({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/staff")
      .then((d) => setStaff(d.staff ?? []))
      .catch(() => setStaff([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiSend("/api/staff/login", "POST", { username, password });
      onSignedIn({ token: res.token, displayName: res.displayName });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login" onSubmit={submit}>
      <div className="brand">PABLO</div>
      <h1>FUNCTION PROSPECTUS</h1>
      <p className="sub">Sign in to open the form.</p>

      {error && <div className="notice notice-error">{error}</div>}

      <label>
        <span>Submitted By</span>
        {staff.length ? (
          <select value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus>
            <option value="">Select</option>
            {staff.map((s) => (
              <option key={s.username} value={s.username}>
                {s.displayName}
              </option>
            ))}
          </select>
        ) : (
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        )}
      </label>

      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>

      <button type="submit" className="submit-btn" style={{ width: "100%" }} disabled={busy}>
        {busy ? "SIGNING IN…" : "SIGN IN"}
      </button>

      <p className="form-footer-link" style={{ marginTop: 18 }}>
        <a href="/admin">Admin panel</a>
      </p>
    </form>
  );
}

function ProspectusForm({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [payment, setPayment] = useState<string[]>([]);
  const [otherCharges, setOtherCharges] = useState<string[]>([]);
  const [fpDisplay, setFpDisplay] = useState("PABLO FP / AUTO");
  const [timestamp, setTimestamp] = useState(() => stamp(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ fp: string; mailed: boolean; mailError: string | null } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const refreshFp = useCallback(() => {
    apiGet("/api/next-fp")
      .then((d) => setFpDisplay(d.display))
      .catch(() => setFpDisplay("PABLO FP / AUTO"));
  }, []);

  useEffect(() => {
    refreshFp();
  }, [refreshFp]);

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
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const result = await apiSend(
        "/api/prospectus",
        "POST",
        {
          ...fields,
          payment,
          other_charges: otherCharges,
          generated_at: timestamp,
        },
        session.token
      );

      saveBase64Pdf(result.pdfBase64, result.filename);
      setSuccess({ fp: result.fp_no, mailed: result.mailed, mailError: result.mailError });

      setFields(EMPTY);
      setPayment([]);
      setOtherCharges([]);
      refreshFp();
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not reach the server. Please try again.";
      setError(message);
      // An expired session sends the user back to the sign-in screen.
      if (/sign in|expired/i.test(message)) onSignOut();
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div ref={topRef} />

      <div className="signed-in-as">
        <span>
          Signed in as <strong>{session.displayName}</strong>
        </span>
        <button type="button" className="link-btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {success && (
        <div className={`notice ${success.mailed ? "notice-success" : "notice-warn"}`}>
          <strong>{success.fp} saved.</strong> The PDF has downloaded.{" "}
          {success.mailed
            ? "It has also been emailed to the distribution list."
            : `The email could not be sent (${success.mailError ?? "unknown error"}). The record is saved — resend it from the admin panel.`}
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
                  <input type="date" required min={today} value={fields.date} onChange={set("date")} />
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
              {submitting ? "SUBMITTING…" : "SUBMIT & DOWNLOAD PDF (A4)"}
            </button>
          </div>
        </div>
      </form>

      <p className="form-footer-link">
        <a href="/admin">Admin panel</a>
      </p>
    </>
  );
}
