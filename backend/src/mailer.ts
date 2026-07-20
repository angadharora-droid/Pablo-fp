import nodemailer, { Transporter } from "nodemailer";
import { settingsCol } from "./db";
import type { Prospectus } from "./types";

const DEFAULT_RECIPIENTS = [
  "rm.pablo@cpgh.in",
  "chef.ufo@cpgh.in",
  "accounts.ufo@cpgh.in",
  "fo.units1@cpgh.in",
  "angadh.arora@cpgh.in",
  "arjun.arora@cpgh.in",
  "fnbcontroller.nagpur@cpgh.in",
  "digital@cpgh.in",
];

const DEFAULT_SUBJECT = "{fp_no} — {party_name} — {event_date} ({time_slot})";

export function envRecipients(): string[] {
  const raw = process.env.NOTIFY_EMAILS;
  if (!raw) return DEFAULT_RECIPIENTS;
  return raw.split(",").map((e) => e.trim()).filter(Boolean);
}

export interface MailSettings {
  recipients: string[];
  subject: string;
  bodyNote: string;
  enabled: boolean;
}

/** Reads the admin-editable settings, seeding them from env on first use. */
export async function getMailSettings(): Promise<MailSettings> {
  const existing = await settingsCol().findOne({ _id: "mail" });
  if (existing) {
    return {
      recipients: existing.recipients ?? [],
      subject: existing.subject || DEFAULT_SUBJECT,
      bodyNote: existing.bodyNote || "",
      enabled: existing.enabled !== false,
    };
  }

  const seeded: MailSettings = {
    recipients: envRecipients(),
    subject: DEFAULT_SUBJECT,
    bodyNote: "",
    enabled: true,
  };
  await settingsCol().updateOne(
    { _id: "mail" },
    { $setOnInsert: { _id: "mail", ...seeded, updatedAt: new Date() } },
    { upsert: true }
  );
  return seeded;
}

export async function saveMailSettings(patch: Partial<MailSettings>): Promise<MailSettings> {
  const current = await getMailSettings();
  const next: MailSettings = {
    recipients: patch.recipients ?? current.recipients,
    subject: (patch.subject ?? current.subject).trim() || DEFAULT_SUBJECT,
    bodyNote: patch.bodyNote ?? current.bodyNote,
    enabled: patch.enabled ?? current.enabled,
  };
  await settingsCol().updateOne(
    { _id: "mail" },
    { $set: { ...next, updatedAt: new Date() } },
    { upsert: true }
  );
  return next;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Fills {placeholders} in the admin-editable subject line. */
function applyTemplate(template: string, record: Prospectus) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (record as unknown as Record<string, unknown>)[key];
    if (value === undefined || value === null) return match;
    return Array.isArray(value) ? value.join(", ") : String(value);
  });
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[mail] SMTP not configured — submissions will save but not email.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? "true") === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

function row(label: string, value: string | null | undefined) {
  const v = (value || "").trim() || "—";
  return `<tr><td style="padding:4px 10px;border:1px solid #ddd;font-weight:bold;width:200px">${label}</td><td style="padding:4px 10px;border:1px solid #ddd">${escapeHtml(v)}</td></tr>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function summaryHtml(record: Prospectus, bodyNote: string) {
  const note = bodyNote.trim()
    ? `<p style="margin:0 0 12px;white-space:pre-wrap">${escapeHtml(bodyNote)}</p>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#000">
    <h2 style="margin:0 0 4px">PABLO FUNCTION PROSPECTUS</h2>
    <p style="margin:0 0 12px;font-weight:bold">${escapeHtml(record.fp_no)}</p>
    ${note}
    <table style="border-collapse:collapse;width:100%;max-width:640px">
      ${row("Date", record.event_date)}
      ${row("Time Slot", record.time_slot)}
      ${row("Type of Function", record.function_type)}
      ${row("Venue", record.venue)}
      ${row("MG", record.mg)}
      ${row("Expected Pax", record.expected_pax)}
      ${row("Name of Party", record.party_name)}
      ${row("Company Name", record.company_name)}
      ${row("Contact Person", record.contact_person)}
      ${row("Telephone / Mobile", record.mobile)}
      ${row("Rate", record.rate)}
      ${row("Hall Rent", record.hall_rent)}
      ${row("Advance Amt", record.advance)}
      ${row("Mode of Payment", record.payment.join(", "))}
      ${row("Other Charges", record.other_charges.join(", "))}
      ${row("Submitted By", record.submitted_by)}
      ${row("Timestamp", record.generated_at)}
    </table>
    <p style="margin-top:14px;color:#555">The full A4 prospectus is attached as a PDF.</p>
  </div>`;
}

export async function sendProspectusMail(
  record: Prospectus,
  pdf: Buffer,
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  const settings = await getMailSettings();
  if (!settings.enabled) return { ok: false, error: "Auto-email is turned off in admin settings" };

  const tx = getTransporter();
  if (!tx) return { ok: false, error: "SMTP not configured" };

  const to = settings.recipients.filter(isValidEmail);
  if (!to.length) return { ok: false, error: "No recipients configured" };

  try {
    await tx.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: applyTemplate(settings.subject, record),
      html: summaryHtml(record, settings.bodyNote),
      attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mail] send failed:", message);
    return { ok: false, error: message };
  }
}
