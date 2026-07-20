"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { useSession } from "../providers";

type Staff = { username: string; displayName: string };

/** Full-screen sign-in gate — nothing past this renders until staff sign in. */
export function StaffLogin() {
  const { signIn } = useSession();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
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
      signIn({ token: res.token, username: res.username, displayName: res.displayName }, remember);
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
      <p className="sub">Sign in to continue.</p>

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
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>

      <div className="auth-options">
        <label className="auth-option">
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          <span>Show password</span>
        </label>
        <label className="auth-option">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember me</span>
        </label>
      </div>

      <button type="submit" className="submit-btn" style={{ width: "100%" }} disabled={busy}>
        {busy ? "SIGNING IN…" : "SIGN IN"}
      </button>

    </form>
  );
}
