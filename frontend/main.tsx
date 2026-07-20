import React from "react";
import ReactDOM from "react-dom/client";
import { SessionProvider } from "./app/providers";
import AppLayout from "./app/(app)/layout";
import NewBookingPage from "./app/(app)/page";
import BookingsPage from "./app/(app)/bookings/page";
import AdminPage from "./app/admin/page";
import "./app/globals.css";
import "./app/admin/admin.css";

function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/admin") return <AdminPage />;

  const page = path === "/bookings" ? <BookingsPage /> : <NewBookingPage />;
  return <AppLayout>{page}</AppLayout>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>
);
