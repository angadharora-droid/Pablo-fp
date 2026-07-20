"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";

const TOKEN_KEY = "pablo_staff_token";

export interface Venue {
  code: string;
  name: string;
}

export interface Session {
  token: string;
  username: string;
  displayName: string;
}

interface SessionContextValue {
  ready: boolean;
  session: Session | null;
  /** Standalone app, one fixed venue — no switcher, just the outlet's name. */
  venue: Venue | null;
  signIn: (session: Session, remember?: boolean) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);

  // Revalidate a stored token on load; a stale one sends the user to sign-in.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    apiGet("/api/staff/me", token)
      .then((me) => setSession({ token, username: me.username, displayName: me.displayName }))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!session) {
      setVenue(null);
      return;
    }
    apiGet("/api/venues", session.token)
      .then((d) => setVenue(d.venues?.[0] ?? null))
      .catch(() => setVenue(null));
  }, [session]);

  const signIn = useCallback((next: Session, remember = false) => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, next.token);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setVenue(null);
  }, []);

  const value = useMemo(() => ({ ready, session, venue, signIn, signOut }), [ready, session, venue, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
