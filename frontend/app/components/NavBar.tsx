"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "../providers";

export function NavBar() {
  const { session, venue, signOut } = useSession();
  const pathname = usePathname();

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link href="/" className="app-brand">
          Pablo
        </Link>

        <nav className="app-tabs">
          <Link href="/" className={`app-tab ${pathname === "/" ? "app-tab-active" : ""}`}>
            New Booking
          </Link>
          <Link href="/bookings" className={`app-tab ${pathname === "/bookings" ? "app-tab-active" : ""}`}>
            Bookings
          </Link>
        </nav>

        <div className="app-nav-right">
          {venue && <span className="app-venue">{venue.name}</span>}
          {session && <span className="app-user">{session.displayName}</span>}
          <button type="button" className="app-logout" onClick={signOut}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
