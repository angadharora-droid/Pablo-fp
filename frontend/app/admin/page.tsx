"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, downloadPdf, ApiError } from "@/lib/api";
import "./admin.css";

const TOKEN_KEY = "pablo_admin_token";

type Tab = "submissions" | "mail" | "staff";

interface Submission {
  _id: string;
  serialNo: number;
  fp_no: string;
  event_date: string;
  time_slot: string;
  party_name: string;
  company_name: string | null;
  mobile: string;
  venue: string;
  rate: string;
  submitted_by: string;
  mailStatus: "sent" | "failed" | "pending";
  mailError: string | null;
  createdAt: string;
  [key: string]: unknown;
}

interface StaffRow {
  _id: string;
  username: string;
  displayName: string;
  active: boolean;
}

interface MailSettings {
  recipients: string[];
  subject: string;
  bodyNote: string;
  enabled: boolean;
  smtpConfigured?: boolean;
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("submissions");

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  function onSignedIn(next: string) {
    localStorage.setItem(TOKEN_KEY, next);
    setToken(next);
  }

  if (!ready) return null;
  if (!token) return <LoginCard onSignedIn={onSignedIn} />;

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <h1>PABLO FP — ADMIN</h1>
          <span className="who">Function prospectus records</span>
        </div>
        <div className="row-actions">
          <a className="btn btn-sm" href="/">
            New prospectus
          </a>
          <button className="btn btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {(
          [
            ["submissions", "Submissions"],
            ["mail", "Mail settings"],
            ["staff", "Staff logins"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className="tab"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "submissions" && <Submissions token={token} onExpired={signOut} />}
      {tab === "mail" && <MailSettingsPanel token={token} onExpired={signOut} />}
      {tab === "staff" && <StaffPanel token={token} onExpired={signOut} />}
    </div>
  );
}

/* -------------------------------- Sign in -------------------------------- */

function LoginCard({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiSend("/api/admin/login", "POST", { username, password });
      onSignedIn(res.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <form className="login-wrap" onSubmit={submit}>
        <h1>PABLO FP — ADMIN</h1>
        <p className="sub">Sign in to view function prospectus records.</p>

        {error && <div className="notice notice-error">{error}</div>}

        <label className="field">
          <span>Username</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------ Submissions ------------------------------ */

function useExpiry(onExpired: () => void) {
  return useCallback(
    (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      if (/sign in|expired/i.test(message)) onExpired();
      return message;
    },
    [onExpired]
  );
}

function Submissions({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [stats, setStats] = useState<{ total: number; failed: number; upcoming: number } | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const handle = useExpiry(onExpired);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const [list, s] = await Promise.all([
        apiGet(`/api/admin/prospectus?${params}`, token),
        apiGet("/api/admin/stats", token),
      ]);
      setItems(list.items);
      setPages(list.pages);
      setStats(s);
    } catch (err) {
      setError(handle(err));
    } finally {
      setBusy(false);
    }
  }, [token, page, search, from, to, handle]);

  useEffect(() => {
    load();
  }, [load]);

  async function resend(id: string) {
    try {
      const res = await apiSend(`/api/admin/prospectus/${id}/resend`, "POST", {}, token);
      setError(res.mailed ? null : `Resend failed: ${res.error}`);
      load();
    } catch (err) {
      setError(handle(err));
    }
  }

  async function remove(id: string, fp: string) {
    if (!confirm(`Delete ${fp}? This cannot be undone.`)) return;
    try {
      await apiSend(`/api/admin/prospectus/${id}`, "DELETE", undefined, token);
      load();
    } catch (err) {
      setError(handle(err));
    }
  }

  return (
    <>
      {stats && (
        <div className="stats">
          <div className="stat">
            <div className="n">{stats.total}</div>
            <div className="l">Total prospectuses</div>
          </div>
          <div className="stat">
            <div className="n">{stats.upcoming}</div>
            <div className="l">Upcoming functions</div>
          </div>
          <div className="stat">
            <div className="n">{stats.failed}</div>
            <div className="l">Failed emails</div>
          </div>
        </div>
      )}

      {error && <div className="notice notice-error">{error}</div>}

      <div className="card">
        <div className="filters">
          <input
            type="text"
            placeholder="Search FP no, party, company, mobile…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ flex: 1, minWidth: 220 }}
          />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Function date from" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Function date to" />
          <button className="btn" onClick={load} disabled={busy}>
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>FP No</th>
                <th>Function date</th>
                <th>Slot</th>
                <th>Party</th>
                <th>Mobile</th>
                <th>Venue</th>
                <th>Rate</th>
                <th>By</th>
                <th>Mail</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !busy && (
                <tr>
                  <td colSpan={10} className="muted">
                    No prospectuses match these filters.
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row._id}>
                  <td>
                    <strong>{row.fp_no}</strong>
                  </td>
                  <td>{row.event_date}</td>
                  <td>{row.time_slot}</td>
                  <td>
                    {row.party_name}
                    {row.company_name ? ` — ${row.company_name}` : ""}
                  </td>
                  <td>{row.mobile}</td>
                  <td>{row.venue}</td>
                  <td>{row.rate}</td>
                  <td>{row.submitted_by}</td>
                  <td>
                    <span className={`pill pill-${row.mailStatus}`} title={row.mailError ?? ""}>
                      {row.mailStatus}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          try {
                            setDetail(await apiGet(`/api/admin/prospectus/${row._id}`, token));
                          } catch (err) {
                            setError(handle(err));
                          }
                        }}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          downloadPdf(`/api/admin/prospectus/${row._id}/pdf`, token, `${row.fp_no}.pdf`).catch((err) =>
                            setError(handle(err))
                          )
                        }
                      >
                        PDF
                      </button>
                      <button className="btn btn-sm" onClick={() => resend(row._id)}>
                        Resend
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(row._id, row.fp_no)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>

      {detail && <DetailCard record={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

const DETAIL_FIELDS: [string, string][] = [
  ["fp_no", "FP No"],
  ["reservation_no", "Reservation No"],
  ["submitted_by", "Submitted By"],
  ["event_date", "Date"],
  ["time_slot", "Time"],
  ["function_type", "Type of Function"],
  ["venue", "Venue"],
  ["mg", "MG"],
  ["expected_pax", "Expected Pax"],
  ["party_name", "Name of Party"],
  ["company_name", "Company Name"],
  ["gst_no", "GST No"],
  ["pan_no", "PAN No"],
  ["address", "Address"],
  ["contact_person", "Contact Person"],
  ["mobile", "Telephone / Mobile"],
  ["email", "Email"],
  ["seating", "Seating Arrangement"],
  ["add_rooms", "Add on Rooms"],
  ["rate", "Rate"],
  ["hall_rent", "Hall Rent"],
  ["payment", "Mode of Payment"],
  ["advance", "Advance Amt"],
  ["transaction_details", "Transaction Details"],
  ["board_text", "Board to Read"],
  ["other_charges", "Other Charges"],
  ["other_charges_notes", "Details / Amount"],
  ["billing", "Billing Instruction"],
  ["housekeeping", "Housekeeping"],
  ["fnb", "F&B"],
  ["kitchen", "Kitchen"],
  ["generated_at", "Timestamp"],
];

function DetailCard({ record, onClose }: { record: Record<string, unknown>; onClose: () => void }) {
  const show = (value: unknown) => {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    const v = String(value ?? "").trim();
    return v || "—";
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{String(record.fp_no)}</h2>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="detail-grid">
        {DETAIL_FIELDS.map(([key, label]) => (
          <div key={key}>
            <div className="k">{label}</div>
            <div className="v">{show(record[key])}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="k">Menu</div>
        <div className="v" style={{ border: "1px solid #ddd", padding: 10, maxHeight: 320, overflow: "auto" }}>
          {show(record.menu)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Mail settings ----------------------------- */

function MailSettingsPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = useExpiry(onExpired);

  useEffect(() => {
    apiGet("/api/admin/settings/mail", token)
      .then(setSettings)
      .catch((err) => setError(handle(err)));
  }, [token, handle]);

  if (error && !settings) return <div className="notice notice-error">{error}</div>;
  if (!settings) return <p className="muted">Loading…</p>;

  const update = (patch: Partial<MailSettings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const next = await apiSend(
        "/api/admin/settings/mail",
        "PUT",
        {
          recipients: settings.recipients.map((r) => r.trim()).filter(Boolean),
          subject: settings.subject,
          bodyNote: settings.bodyNote,
          enabled: settings.enabled,
        },
        token
      );
      setSettings({ ...next, smtpConfigured: settings.smtpConfigured });
      setSaved(true);
    } catch (err) {
      setError(handle(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Automatic email on submit</h2>

      {settings.smtpConfigured === false && (
        <div className="notice notice-warn">
          SMTP is not configured on the server, so no mail can be sent. Set SMTP_HOST, SMTP_USER and SMTP_PASS in
          Railway.
        </div>
      )}
      {error && <div className="notice notice-error">{error}</div>}
      {saved && <div className="notice notice-success">Mail settings saved.</div>}

      <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          style={{ width: "auto" }}
        />
        <span style={{ margin: 0 }}>Email the PDF automatically when a prospectus is submitted</span>
      </label>

      <label className="field">
        <span>Subject line</span>
        <input type="text" value={settings.subject} onChange={(e) => update({ subject: e.target.value })} />
      </label>
      <p className="muted" style={{ marginTop: -6 }}>
        Placeholders: {"{fp_no}"}, {"{party_name}"}, {"{event_date}"}, {"{time_slot}"}, {"{venue}"},{" "}
        {"{submitted_by}"}
      </p>

      <label className="field">
        <span>Note at the top of the email (optional)</span>
        <textarea rows={3} value={settings.bodyNote} onChange={(e) => update({ bodyNote: e.target.value })} />
      </label>

      <div className="field">
        <span style={{ display: "block", fontWeight: "bold", fontSize: 12, marginBottom: 6 }}>Recipients</span>
        {settings.recipients.map((address, i) => (
          <div className="recipient-row" key={i}>
            <input
              type="email"
              value={address}
              placeholder="name@example.com"
              onChange={(e) => {
                const next = [...settings.recipients];
                next[i] = e.target.value;
                update({ recipients: next });
              }}
            />
            <button
              className="btn btn-sm btn-danger"
              onClick={() => update({ recipients: settings.recipients.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => update({ recipients: [...settings.recipients, ""] })}>
          Add recipient
        </button>
      </div>

      <button className="btn" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save mail settings"}
      </button>
    </div>
  );
}

/* -------------------------------- Staff ---------------------------------- */

function StaffPanel({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const handle = useExpiry(onExpired);

  const load = useCallback(() => {
    apiGet("/api/admin/staff", token)
      .then((d) => setStaff(d.staff))
      .catch((err) => setError(handle(err)));
  }, [token, handle]);

  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiSend("/api/admin/staff", "POST", { username, displayName, password }, token);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setNotice("Staff login created.");
      load();
    } catch (err) {
      setError(handle(err));
    }
  }

  async function patch(id: string, body: Record<string, unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await apiSend(`/api/admin/staff/${id}`, "PATCH", body, token);
      setNotice(message);
      load();
    } catch (err) {
      setError(handle(err));
    }
  }

  async function remove(row: StaffRow) {
    if (!confirm(`Delete the login for ${row.displayName}?`)) return;
    setError(null);
    try {
      await apiSend(`/api/admin/staff/${row._id}`, "DELETE", undefined, token);
      setNotice("Staff login deleted.");
      load();
    } catch (err) {
      setError(handle(err));
    }
  }

  return (
    <>
      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-success">{notice}</div>}

      <div className="card">
        <h2>Staff who can submit the form</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={row._id}>
                  <td>{row.displayName}</td>
                  <td>{row.username}</td>
                  <td>
                    <span className={`pill ${row.active ? "pill-sent" : "pill-failed"}`}>
                      {row.active ? "active" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          patch(row._id, { active: !row.active }, `${row.displayName} ${row.active ? "disabled" : "enabled"}.`)
                        }
                      >
                        {row.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          const next = prompt(`New password for ${row.displayName} (min 6 characters):`);
                          if (next) patch(row._id, { password: next }, "Password updated.");
                        }}
                      >
                        Reset password
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(row)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form className="card" onSubmit={add}>
        <h2>Add a staff login</h2>
        <label className="field">
          <span>Username (used on the form)</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span>Display name</span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="field">
          <span>Password (min 6 characters)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn" type="submit">
          Create login
        </button>
      </form>
    </>
  );
}
