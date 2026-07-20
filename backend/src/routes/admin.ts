import { Router } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { requireAdmin, signAdmin, verifyAdmin, AuthedRequest } from "../auth";
import { prospectusCol, staffCol } from "../db";
import { renderProspectusPdf, pdfFilename } from "../pdf";
import { sendProspectusMail, getMailSettings, saveMailSettings, isValidEmail } from "../mailer";

export const adminRouter = Router();

adminRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const admin = await verifyAdmin(String(username || ""), String(password || ""));
    if (!admin) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    res.json({ token: signAdmin(admin), username: admin });
  } catch (err) {
    next(err);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get("/me", (req: AuthedRequest, res) => {
  res.json({ username: req.admin!.sub });
});

/* ------------------------------ Mail settings ----------------------------- */

adminRouter.get("/settings/mail", async (_req, res, next) => {
  try {
    const settings = await getMailSettings();
    res.json({ ...settings, smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS) });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/settings/mail", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.recipients !== undefined) {
      if (!Array.isArray(body.recipients)) {
        return res.status(400).json({ error: "Recipients must be a list of email addresses." });
      }
      const cleaned = body.recipients.map((e: unknown) => String(e).trim()).filter(Boolean);
      const invalid = cleaned.filter((e: string) => !isValidEmail(e));
      if (invalid.length) {
        return res.status(400).json({ error: `Not a valid email address: ${invalid.join(", ")}` });
      }
      patch.recipients = Array.from(new Set(cleaned));
    }
    if (typeof body.subject === "string") patch.subject = body.subject;
    if (typeof body.bodyNote === "string") patch.bodyNote = body.bodyNote;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    res.json(await saveMailSettings(patch));
  } catch (err) {
    next(err);
  }
});

function toObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Paginated submissions list with optional free-text and date filtering. */
adminRouter.get("/prospectus", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const search = String(req.query.search || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const filter: Record<string, unknown> = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { fp_no: rx },
        { party_name: rx },
        { company_name: rx },
        { mobile: rx },
        { reservation_no: rx },
        { submitted_by: rx },
      ];
    }
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      filter.event_date = range;
    }

    const [items, total] = await Promise.all([
      prospectusCol()
        .find(filter, { projection: { menu: 0 } })
        .sort({ serialNo: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      prospectusCol().countDocuments(filter),
    ]);

    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [total, failed, upcoming] = await Promise.all([
      prospectusCol().countDocuments({}),
      prospectusCol().countDocuments({ mailStatus: "failed" }),
      prospectusCol().countDocuments({ event_date: { $gte: new Date().toISOString().slice(0, 10) } }),
    ]);
    res.json({ total, failed, upcoming });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/prospectus/:id", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });
    const doc = await prospectusCol().findOne({ _id });
    if (!doc) return res.status(404).json({ error: "Not found." });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/prospectus/:id/pdf", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });
    const doc = await prospectusCol().findOne({ _id });
    if (!doc) return res.status(404).json({ error: "Not found." });

    const pdf = await renderProspectusPdf(doc);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename(doc)}"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/prospectus/:id/resend", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });
    const doc = await prospectusCol().findOne({ _id });
    if (!doc) return res.status(404).json({ error: "Not found." });

    const pdf = await renderProspectusPdf(doc);
    const mail = await sendProspectusMail(doc, pdf, pdfFilename(doc));
    await prospectusCol().updateOne(
      { _id },
      { $set: { mailStatus: mail.ok ? "sent" : "failed", mailError: mail.error ?? null } }
    );
    res.json({ mailed: mail.ok, error: mail.error ?? null });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/prospectus/:id", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });
    const result = await prospectusCol().deleteOne({ _id });
    if (!result.deletedCount) return res.status(404).json({ error: "Not found." });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- Staff management ---------------------------- */

adminRouter.get("/staff", async (_req, res, next) => {
  try {
    const staff = await staffCol()
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ displayName: 1 })
      .toArray();
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/staff", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "").trim() || username;

    if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 2–32 characters (letters, numbers, . _ -)." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const existing = await staffCol().findOne({ username });
    if (existing) return res.status(409).json({ error: "That username already exists." });

    await staffCol().insertOne({
      username,
      displayName,
      passwordHash: await bcrypt.hash(password, 10),
      active: true,
      createdAt: new Date(),
    });
    res.status(201).json({ created: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/staff/:id", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });

    const update: Record<string, unknown> = {};
    if (typeof req.body?.active === "boolean") update.active = req.body.active;
    if (typeof req.body?.displayName === "string" && req.body.displayName.trim()) {
      update.displayName = req.body.displayName.trim();
    }
    if (typeof req.body?.password === "string" && req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      update.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    const result = await staffCol().updateOne({ _id }, { $set: update });
    if (!result.matchedCount) return res.status(404).json({ error: "Not found." });
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/staff/:id", async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id." });
    const result = await staffCol().deleteOne({ _id });
    if (!result.deletedCount) return res.status(404).json({ error: "Not found." });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
