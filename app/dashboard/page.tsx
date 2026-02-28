"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";

type ChecklistStep = {
  key: string;
  label: string;
  done: boolean;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const checklistResp = await apiFetch("/api/onboarding/checklist", { cache: "no-store" });
        if (!checklistResp.ok) {
          const txt = await checklistResp.text().catch(() => "");
          throw new Error(`Checklist load failed (${checklistResp.status}): ${txt}`);
        }

        const checklistBody = await checklistResp.json().catch(() => ({}));
        if (dead) return;
        setChecklist(Array.isArray(checklistBody?.checklist?.steps) ? checklistBody.checklist.steps : []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e || "Could not load dashboard data");
        if (!dead) setError(msg);
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
          <p className="mt-1 text-sm text-muted-foreground">Account setup and quick access.</p>
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
        <div className="grid items-center gap-2 md:grid-cols-[1.25fr_1fr]">
          <div className="p-4 md:p-6">
            <div className="text-xl font-semibold tracking-wide text-cyan-300 md:text-2xl">INFINITE DRIP</div>
            <p className="mt-2 text-sm text-cyan-100/85">
              AI SMS appointment setting with lead tracking, booking, and follow-up in one view.
            </p>
            <div className="mt-4">
              <Link
                href="/calendar"
                className="inline-flex items-center rounded-md border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25"
              >
                Open Calendar
              </Link>
            </div>
          </div>
          <div className="flex min-h-[170px] items-center justify-center p-4 md:min-h-[220px] md:p-6">
            <div className="relative w-full max-w-[380px]">
              <Image
                src="/TestImage1.png"
                alt="InfiniteDrip infinity brand graphic"
                width={1280}
                height={720}
                className="h-auto w-full rounded-lg object-contain"
                priority
              />
            </div>
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
    </main>
  );
}
