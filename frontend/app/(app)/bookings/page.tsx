"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, downloadPdf, ApiError } from "@/lib/api";
import { useSession } from "../../providers";

interface Booking {
  _id: string;
  fp_no: string;
  event_date: string;
  time_slot: string;
  party_name: string;
  company_name: string | null;
  mobile: string;
  venue: string;
  rate: string;
  submitted_by: string;
  mailStatus: "sent" | "failed" | "pending";
}

/** Bookings — every prospectus raised for this venue. */
export default function BookingsPage() {
  const { session, venue, signOut } = useSession();
  const [items, setItems] = useState<Booking[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !venue) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ venue: venue.code, page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const res = await apiGet(`/api/bookings?${params}`, session.token);
      setItems(res.items);
      setPages(res.pages);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not reach the server.";
      setError(message);
      if (/sign in|expired/i.test(message)) signOut();
    } finally {
      setBusy(false);
    }
  }, [session, venue, page, search, signOut]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  return (
    <div className="bookings-card">
      <div className="bookings-head">
        <h1>Bookings</h1>
        <input
          type="text"
          placeholder="Search FP no, party, company, mobile…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>FP No</th>
              <th>Function date</th>
              <th>Slot</th>
              <th>Party</th>
              <th>Mobile</th>
              <th>Venue</th>
              <th>Rate</th>
              <th>By</th>
              <th>Mail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !busy && (
              <tr>
                <td colSpan={10} className="muted">
                  No bookings yet.
                </td>
              </tr>
            )}
            {items.map((row) => (
              <tr key={row._id}>
                <td>
                  <strong>{row.fp_no}</strong>
                </td>
                <td>{row.event_date}</td>
                <td>{row.time_slot}</td>
                <td>
                  {row.party_name}
                  {row.company_name ? ` — ${row.company_name}` : ""}
                </td>
                <td>{row.mobile}</td>
                <td>{row.venue}</td>
                <td>{row.rate}</td>
                <td>{row.submitted_by}</td>
                <td>
                  <span className={`pill pill-${row.mailStatus}`}>{row.mailStatus}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      downloadPdf(`/api/bookings/${row._id}/pdf`, session.token, `${row.fp_no}.pdf`).catch(() =>
                        setError("Could not download that PDF.")
                      )
                    }
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
