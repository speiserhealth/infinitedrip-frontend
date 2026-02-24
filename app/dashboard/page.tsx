"use client";

import Image from "next/image";
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
    <main className="rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Account setup and upcoming appointments.</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          Log out
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <section className="mt-6 overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900/70 shadow-[0_0_36px_rgba(56,189,248,0.16)]">
        <div className="grid items-center gap-2 md:grid-cols-[1.4fr_1fr]">
          <div className="relative min-h-[170px] md:min-h-[220px]">
            <Image
              src="/infinity-hero.svg"
              alt="InfiniteDrip infinity brand graphic"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/10 via-slate-900/5 to-slate-950/30" />
          </div>
          <div className="p-4 md:p-6">
            <div className="text-xl font-semibold tracking-wide text-cyan-300 md:text-2xl">INFINITE DRIP</div>
            <p className="mt-2 text-sm text-cyan-100/85">
              AI SMS appointment setting with lead tracking, booking, and follow-up in one view.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border/80 bg-card/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-foreground">First-Login Setup Checklist</h2>
          <div className="text-sm text-muted-foreground">
            {completion.done}/{completion.total} complete
          </div>
        </div>
        <div className="mt-2 h-2 rounded bg-muted">
          <div className="h-2 rounded bg-emerald-500" style={{ width: `${completion.pct}%` }} />
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading checklist...</p>
        ) : checklist.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No checklist steps returned.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {checklist.map((step, idx) => (
              <li
                key={step.key}
                className="flex items-center justify-between gap-3 rounded border border-border/60 bg-background/40 px-3 py-2"
                style={{ animationDelay: `${idx * 35}ms` }}
              >
                <span className="text-sm text-foreground">{step.label}</span>
                <span
                  className={`rounded border px-2 py-0.5 text-xs ${
                    step.done
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-400/40 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {step.done ? "Done" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border/80 bg-card/70 p-4">
        <h2 className="text-lg font-medium text-foreground">Upcoming appointments</h2>
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading appointments...</p> : null}
        {!loading && appointments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No upcoming appointments.</p>
        ) : null}
        {!loading && appointments.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {appointments.map((a) => (
              <li key={a.id} className="rounded border border-border/60 bg-background/40 px-3 py-2">
                <div className="font-medium text-foreground">{a.title}</div>
                <div className="text-xs text-muted-foreground">
                  {a.start || "no start"} to {a.end || "no end"}
                  {a.link ? (
                    <>
                      {" "}
                      •{" "}
                      <a className="text-cyan-400 underline decoration-cyan-500/40" href={a.link} target="_blank" rel="noreferrer">
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
