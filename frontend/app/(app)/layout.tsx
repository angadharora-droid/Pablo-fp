"use client";

import { useSession } from "../providers";
import { StaffLogin } from "../components/StaffLogin";
import { NavBar } from "../components/NavBar";

/** Gate for the staff-facing app: sign in first, then New Booking / Bookings open. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, session } = useSession();

  if (!ready) return null;
  if (!session) return <StaffLogin />;

  return (
    <>
      <NavBar />
      <main className="app-content">{children}</main>
      <p className="form-footer-link">
        <a href="/admin">Admin panel</a>
      </p>
    </>
  );
}
