"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";

type Appointment = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  link: string | null;
};

type ChecklistStep = {
  key: string;
  label: string;
  done: boolean;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [apptResp, checklistResp] = await Promise.all([
          apiFetch("/api/appointments", { cache: "no-store" }),
          apiFetch("/api/onboarding/checklist", { cache: "no-store" }),
        ]);

        if (!apptResp.ok) {
          const txt = await apptResp.text().catch(() => "");
          throw new Error(`Appointments load failed (${apptResp.status}): ${txt}`);
        }
        if (!checklistResp.ok) {
          const txt = await checklistResp.text().catch(() => "");
          throw new Error(`Checklist load failed (${checklistResp.status}): ${txt}`);
        }

        const apptBody = await apptResp.json().catch(() => ({}));
        const checklistBody = await checklistResp.json().catch(() => ({}));

        if (dead) return;
        setAppointments(Array.isArray(apptBody?.events) ? apptBody.events : []);
        setChecklist(Array.isArray(checklistBody?.checklist?.steps) ? checklistBody.checklist.steps : []);
      } catch (e: any) {
        if (!dead) setError(String(e?.message || "Could not load dashboard data"));
      } finally {
        if (!dead) setLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, []);

  const completion = useMemo(() => {
    if (!checklist.length) return { done: 0, total: 0, pct: 0 };
    const done = checklist.filter((s) => s.done).length;
    const total = checklist.length;
    const pct = Math.round((done / total) * 100);
    return { done, total, pct };
  }, [checklist]);

  return (
    <main className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Account setup and upcoming appointments.</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Log out
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <section className="mt-6 rounded border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">First-Login Setup Checklist</h2>
          <div className="text-sm text-gray-600">
            {completion.done}/{completion.total} complete
          </div>
        </div>
        <div className="mt-2 h-2 rounded bg-gray-100">
          <div className="h-2 rounded bg-green-500" style={{ width: `${completion.pct}%` }} />
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-gray-500">Loading checklist...</p>
        ) : checklist.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No checklist steps returned.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {checklist.map((step) => (
              <li key={step.key} className="flex items-center justify-between gap-3 rounded border border-gray-100 px-3 py-2">
                <span className="text-sm text-gray-800">{step.label}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${step.done ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}
                >
                  {step.done ? "Done" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium">Upcoming appointments</h2>
        {loading ? <p className="mt-3 text-sm text-gray-500">Loading appointments...</p> : null}
        {!loading && appointments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No upcoming appointments.</p>
        ) : null}
        {!loading && appointments.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {appointments.map((a) => (
              <li key={a.id} className="rounded border border-gray-100 px-3 py-2">
                <div className="font-medium text-gray-900">{a.title}</div>
                <div className="text-xs text-gray-500">
                  {a.start || "no start"} to {a.end || "no end"}
                  {a.link ? (
                    <>
                      {" "}
                      •{" "}
                      <a className="text-blue-600 underline" href={a.link} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
