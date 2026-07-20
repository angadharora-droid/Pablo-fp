"use client";

import { useSession } from "../providers";

export function NavBar() {
  const { session, venue, signOut } = useSession();
  const pathname = window.location.pathname;

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <a href="/" className="app-brand">
          Pablo
        </a>

        <nav className="app-tabs">
          <a href="/" className={`app-tab ${pathname === "/" ? "app-tab-active" : ""}`}>
            New Booking
          </a>
          <a href="/bookings" className={`app-tab ${pathname === "/bookings" ? "app-tab-active" : ""}`}>
            Bookings
          </a>
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
