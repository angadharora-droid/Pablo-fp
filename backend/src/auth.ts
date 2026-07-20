import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { staffCol, adminCol } from "./db";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set.");
}
const SECRET: string = JWT_SECRET;

export interface AdminToken {
  sub: string;
  role: "admin";
}

export function signAdmin(username: string) {
  return jwt.sign({ sub: username, role: "admin" } as AdminToken, SECRET, {
    expiresIn: "12h",
  });
}

export interface AuthedRequest extends Request {
  admin?: AdminToken;
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Not signed in." });
  }
  try {
    const payload = jwt.verify(token, SECRET) as AdminToken;
    if (payload.role !== "admin") throw new Error("wrong role");
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

export async function verifyAdmin(username: string, password: string) {
  const admin = await adminCol().findOne({ username: String(username || "").trim().toLowerCase() });
  if (!admin) return null;
  const ok = await bcrypt.compare(String(password || ""), admin.passwordHash);
  return ok ? admin.username : null;
}

/**
 * Validates the "Submitted By" + "Password" pair carried on the form itself,
 * matching how the original page authenticated each submission.
 */
export async function verifyStaff(username: string, password: string) {
  const staff = await staffCol().findOne({
    username: String(username || "").trim().toLowerCase(),
    active: true,
  });
  if (!staff) return null;
  const ok = await bcrypt.compare(String(password || ""), staff.passwordHash);
  return ok ? { username: staff.username, displayName: staff.displayName } : null;
}
