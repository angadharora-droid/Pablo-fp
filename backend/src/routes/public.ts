import { Router } from "express";
import { verifyStaff, signStaff, requireStaff, AuthedRequest } from "../auth";
import { prospectusCol, nextSerial, formatFpNo, peekNextFpNo } from "../db";
import { renderProspectusPdf, pdfFilename } from "../pdf";
import { sendProspectusMail } from "../mailer";
import type { Prospectus } from "../types";

export const publicRouter = Router();

const TIME_SLOTS = [
  "Lunch (12:00 - 15:00)",
  "Hi-Tea (16:00 - 18:00)",
  "Dinner (19:00 - 00:00)",
];
const FUNCTION_TYPES = ["Social", "Corporate"];
const PAYMENT_MODES = ["Cash", "Card", "UPI"];
const OTHER_CHARGES = ["Alcohol", "DJ", "AV", "Other Charges"];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  const v = str(value);
  return v.length ? v : null;
}

/** Keeps only values from the allowed set, so a tampered payload can't inject junk. */
function pickMany(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return allowed.filter((a) => value.includes(a));
}

/** The FP number the next submission will receive — drives the header display. */
publicRouter.get("/next-fp", async (_req, res, next) => {
  try {
    res.json({ display: await peekNextFpNo() });
  } catch (err) {
    next(err);
  }
});

publicRouter.get("/staff", async (_req, res, next) => {
  try {
    const { staffCol } = await import("../db");
    const staff = await staffCol()
      .find({ active: true }, { projection: { username: 1, displayName: 1, _id: 0 } })
      .sort({ displayName: 1 })
      .toArray();
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

/** Signs a staff member in so the form can open. */
publicRouter.post("/staff/login", async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const staff = await verifyStaff(String(username || ""), String(password || ""));
    if (!staff) {
      return res.status(401).json({ error: "Invalid user or password." });
    }
    res.json({
      token: signStaff(staff.username, staff.displayName),
      username: staff.username,
      displayName: staff.displayName,
    });
  } catch (err) {
    next(err);
  }
});

/** Confirms a stored token is still valid when the page reloads. */
publicRouter.get("/staff/me", requireStaff, (req: AuthedRequest, res) => {
  res.json({ username: req.staff!.sub, displayName: req.staff!.name });
});

publicRouter.post("/prospectus", requireStaff, async (req: AuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};

    // The submitter comes from the signed-in session, not the payload, so it
    // cannot be spoofed by editing the request.
    const staff = { username: req.staff!.sub, displayName: req.staff!.name };

    const required: Record<string, string> = {
      date: str(body.date),
      time: str(body.time),
      venue: str(body.venue),
      menu: str(body.menu),
      party_name: str(body.party_name),
      mobile: str(body.mobile),
      rate: str(body.rate),
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    if (!TIME_SLOTS.includes(required.time)) {
      return res.status(400).json({ error: "Invalid time slot." });
    }

    const functionType = str(body.function_type);
    if (functionType && !FUNCTION_TYPES.includes(functionType)) {
      return res.status(400).json({ error: "Invalid type of function." });
    }

    const serialNo = await nextSerial();

    const record: Prospectus = {
      serialNo,
      fp_no: formatFpNo(serialNo),
      reservation_no: optional(body.reservation_no),
      submitted_by: staff.displayName,
      event_date: required.date,
      time_slot: required.time,
      function_type: functionType || null,
      venue: required.venue,
      mg: optional(body.mg),
      expected_pax: optional(body.expected_pax),
      menu: required.menu,
      party_name: required.party_name,
      company_name: optional(body.company_name),
      gst_no: optional(body.gst_no),
      pan_no: optional(body.pan_no),
      address: optional(body.address),
      contact_person: optional(body.contact_person),
      mobile: required.mobile,
      email: optional(body.email),
      seating: optional(body.seating),
      add_rooms: optional(body.add_rooms),
      rate: required.rate,
      hall_rent: optional(body.hall_rent),
      payment: pickMany(body.payment, PAYMENT_MODES),
      advance: optional(body.advance),
      transaction_details: optional(body.transaction_details),
      board_text: optional(body.board_text),
      other_charges: pickMany(body.other_charges, OTHER_CHARGES),
      other_charges_notes: optional(body.other_charges_notes),
      billing: optional(body.billing),
      housekeeping: optional(body.housekeeping),
      fnb: optional(body.fnb),
      kitchen: optional(body.kitchen),
      generated_at: optional(body.generated_at) || new Date().toISOString().slice(0, 19).replace("T", " "),
      mailStatus: "pending",
      mailError: null,
      createdAt: new Date(),
    };

    const inserted = await prospectusCol().insertOne(record);

    const pdf = await renderProspectusPdf(record);
    const filename = pdfFilename(record);

    // The record is already saved; a mail failure must not fail the submission.
    const mail = await sendProspectusMail(record, pdf, filename);
    await prospectusCol().updateOne(
      { _id: inserted.insertedId },
      { $set: { mailStatus: mail.ok ? "sent" : "failed", mailError: mail.error ?? null } }
    );

    res.json({
      id: inserted.insertedId.toString(),
      fp_no: record.fp_no,
      filename,
      pdfBase64: pdf.toString("base64"),
      mailed: mail.ok,
      mailError: mail.error ?? null,
    });
  } catch (err) {
    next(err);
  }
});
