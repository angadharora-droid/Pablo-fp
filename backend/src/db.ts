import { MongoClient, Db, Collection } from "mongodb";
import bcrypt from "bcryptjs";
import type { Prospectus, StaffDoc, AdminDoc, CounterDoc, MailSettingsDoc } from "./types";

// Railway exposes MONGO_URL for its MongoDB service; MONGODB_URI is the common
// alias. Fall back to a local mongod for development.
const uri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  "mongodb://127.0.0.1:27017";

const dbName = process.env.MONGODB_DB || "pablo_fp";

const client = new MongoClient(uri);
let db: Db;

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connect() first.");
  return db;
}

export const staffCol = () => getDb().collection<StaffDoc>("staff");
export const adminCol = () => getDb().collection<AdminDoc>("admins");
export const prospectusCol = () => getDb().collection<Prospectus>("prospectus");
export const counterCol = () => getDb().collection<CounterDoc>("counters");
export const settingsCol = () => getDb().collection<MailSettingsDoc>("settings");

const DEFAULT_STAFF = "irfan:irfan@2026,vinod:vinod@2026,tushar:tushar@2026";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Seeds staff from STAFF_CREDENTIALS ("user:pass,user:pass"). Passwords are
 * hashed here so they never sit in the database as plaintext, unlike the
 * PABLO_ALLOWED_USERS constant this replaces. Existing users are updated, so
 * rotating a password is an env change plus a redeploy.
 */
async function seedStaff() {
  const raw = process.env.STAFF_CREDENTIALS || DEFAULT_STAFF;
  for (const entry of raw.split(",").map((e) => e.trim()).filter(Boolean)) {
    const idx = entry.indexOf(":");
    if (idx < 1) continue;
    const username = entry.slice(0, idx).trim().toLowerCase();
    const password = entry.slice(idx + 1).trim();
    if (!password) continue;

    await staffCol().updateOne(
      { username },
      {
        $set: { passwordHash: await bcrypt.hash(password, 10), active: true },
        $setOnInsert: { username, displayName: titleCase(username), createdAt: new Date() },
      },
      { upsert: true }
    );
  }
}

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn("[seed] ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }
  await adminCol().updateOne(
    { username },
    {
      $set: { passwordHash: await bcrypt.hash(password, 10) },
      $setOnInsert: { username, createdAt: new Date() },
    },
    { upsert: true }
  );
}

export async function connect() {
  await client.connect();
  db = client.db(dbName);

  await Promise.all([
    staffCol().createIndex({ username: 1 }, { unique: true }),
    adminCol().createIndex({ username: 1 }, { unique: true }),
    prospectusCol().createIndex({ serialNo: 1 }, { unique: true }),
    prospectusCol().createIndex({ createdAt: -1 }),
    prospectusCol().createIndex({ party_name: "text", fp_no: "text", mobile: "text" }),
  ]);

  await seedStaff();
  await seedAdmin();

  console.log(`[db] connected to ${dbName}, indexes ready, users seeded`);
}

export async function disconnect() {
  await client.close();
}

/**
 * Atomically reserves the next FP serial. $inc on a single counter document is
 * atomic in MongoDB, so concurrent submits can never receive the same number.
 */
export async function nextSerial(): Promise<number> {
  const result = await counterCol().findOneAndUpdate(
    { _id: "prospectus_serial" },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result!.value;
}

export function formatFpNo(serial: number) {
  return `PABLO FP / ${String(serial).padStart(4, "0")}`;
}

/** Preview of the number the next submit will get. Does not reserve it. */
export async function peekNextFpNo(): Promise<string> {
  const counter = await counterCol().findOne({ _id: "prospectus_serial" });
  return formatFpNo((counter?.value ?? 0) + 1);
}
