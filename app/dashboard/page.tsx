"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Appointment = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  link: string | null;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "https://infinitedrip-backend.onrender.com";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/appointments`)
      .then((res) => res.json())
      .then((data) => {
        setAppointments(data.events || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load appointments");
        setLoading(false);
      });
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        >
          Log out
        </button>
      </div>

      <h2 style={{ marginTop: 18, fontSize: 18, fontWeight: 700 }}>
        Upcoming appointments
      </h2>

      {loading && <p style={{ marginTop: 10 }}>Loading…</p>}
      {error && <p style={{ marginTop: 10 }}>{error}</p>}

      {!loading && !error && (
        <ul style={{ marginTop: 10, paddingLeft: 18 }}>
          {appointments.map((a) => (
            <li key={a.id} style={{ marginBottom: 8 }}>
              <strong>{a.title}</strong>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {a.start || "no start"} → {a.end || "no end"}
                {a.link ? (
                  <>
                    {" "}
                    •{" "}
                    <a href={a.link} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
