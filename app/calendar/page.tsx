"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type Appointment = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  link: string | null;
};

type AppointmentWindow = "day" | "week" | "month";

type CalendarStatus = {
  configured?: boolean;
  connected?: boolean;
  gmail_connected?: boolean;
  account_email?: string;
  warning?: string;
  detail?: string;
  calendar_id?: string;
  next_event_at?: string | null;
  checked_at?: string;
};

type SettingsResponse = {
  ok?: boolean;
  settings?: {
    calendar_max_concurrent_bookings?: number;
    calendar_overlap_window_minutes?: number;
  };
};

function parseDateSafe(raw?: string | null): Date | null {
  if (!raw) return null;
  const str = String(raw || "").trim();
  if (!str) return null;
  const iso = str.includes("T") ? str : `${str.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isWithinWindow(start: Date | null, window: AppointmentWindow, now = new Date()) {
  if (!start) return false;
  const startMs = start.getTime();
  const nowMs = now.getTime();
  if (startMs < nowMs) return false;

  const horizon = new Date(now);
  if (window === "day") horizon.setDate(horizon.getDate() + 1);
  else if (window === "week") horizon.setDate(horizon.getDate() + 7);
  else horizon.setDate(horizon.getDate() + 30);
  return startMs <= horizon.getTime();
}

export default function CalendarPage() {
  const [loading, setLoading] = React.useState(true);
  const [savingRules, setSavingRules] = React.useState(false);
  const [events, setEvents] = React.useState<Appointment[]>([]);
  const [windowSize, setWindowSize] = React.useState<AppointmentWindow>("week");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [maxConcurrent, setMaxConcurrent] = React.useState("1");
  const [overlapWindow, setOverlapWindow] = React.useState("30");

  const [status, setStatus] = React.useState<CalendarStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [connectingGoogle, setConnectingGoogle] = React.useState(false);

  const visibleEvents = React.useMemo(() => {
    const rows = [...events];
    rows.sort((a, b) => {
      const aMs = parseDateSafe(a.start)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bMs = parseDateSafe(b.start)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aMs - bMs;
    });
    return rows.filter((a) => isWithinWindow(parseDateSafe(a.start), windowSize));
  }, [events, windowSize]);

  const loadStatus = React.useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await apiFetch("/api/appointments/status", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setStatus(body?.status || null);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [apptRes, settingsRes] = await Promise.all([
        apiFetch("/api/appointments", { cache: "no-store" }),
        apiFetch("/api/settings", { cache: "no-store" }),
      ]);

      if (!apptRes.ok) {
        const txt = await apptRes.text().catch(() => "");
        throw new Error(`Appointments load failed (${apptRes.status}): ${txt}`);
      }
      if (!settingsRes.ok) {
        const txt = await settingsRes.text().catch(() => "");
        throw new Error(`Calendar settings load failed (${settingsRes.status}): ${txt}`);
      }

      const apptBody = await apptRes.json().catch(() => ({}));
      const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;

      setEvents(Array.isArray(apptBody?.events) ? apptBody.events : []);
      const settings = settingsBody?.settings || {};
      setMaxConcurrent(String(settings.calendar_max_concurrent_bookings || 1));
      setOverlapWindow(String(settings.calendar_overlap_window_minutes || 30));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Failed loading calendar");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
    loadStatus();
  }, [loadAll, loadStatus]);

  async function saveRules() {
    setSavingRules(true);
    setError("");
    setSuccess("");
    try {
      const body = {
        calendar_max_concurrent_bookings: Number(maxConcurrent || 1),
        calendar_overlap_window_minutes: Number(overlapWindow || 30),
      };
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.detail || data?.error || `save_failed_${res.status}`));
      }
      setSuccess("Calendar booking rules saved.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Could not save booking rules");
      setError(msg);
    } finally {
      setSavingRules(false);
    }
  }

  async function connectGoogle() {
    setConnectingGoogle(true);
    setError("");
    try {
      const res = await apiFetch("/api/integrations/google/url", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error(String(body?.detail || body?.error || `google_url_failed_${res.status}`));
      }
      window.location.href = String(body.url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Failed to start Google connect");
      setConnectingGoogle(false);
      setError(msg);
    }
  }

  return (
    <main className="rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage appointments, booking capacity, and overlap rules per user.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25"
          >
            Calendar setup
          </button>
          <button
            type="button"
            onClick={loadAll}
            className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
      {success ? <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}

      <section className="mt-6 rounded-xl border border-border/80 bg-card/70 p-4">
        <h2 className="text-lg font-medium text-foreground">Booking rules</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set how many appointments you allow in the same time window.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="rounded border border-border/70 bg-background/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Booking capacity</div>
            <select
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="1">Single booking</option>
              <option value="2">Double booking</option>
              <option value="3">Triple booking</option>
            </select>
          </label>

          <label className="rounded border border-border/70 bg-background/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Overlap window</div>
            <select
              value={overlapWindow}
              onChange={(e) => setOverlapWindow(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-sm"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={saveRules}
              disabled={savingRules}
              className="w-full rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
            >
              {savingRules ? "Saving..." : "Save calendar rules"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border/80 bg-card/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-foreground">Upcoming appointments</h2>
          <div className="inline-flex items-center gap-1 rounded border border-border/70 bg-background/40 p-1">
            {([
              { key: "day", label: "Day" },
              { key: "week", label: "Week" },
              { key: "month", label: "Month" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setWindowSize(tab.key)}
                className={`rounded px-2 py-1 text-xs ${
                  windowSize === tab.key
                    ? "border border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                    : "border border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading appointments...</p> : null}
        {!loading && visibleEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No upcoming appointments in this window.</p>
        ) : null}
        {!loading && visibleEvents.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {visibleEvents.map((a) => (
              <li key={a.id} className="rounded border border-border/60 bg-background/40 px-3 py-2">
                <div className="font-medium text-foreground">{a.title}</div>
                <div className="text-xs text-muted-foreground">
                  {a.start || "no start"} to {a.end || "no end"}
                  {a.link ? (
                    <>
                      {" "}•{" "}
                      <a className="text-cyan-400 underline decoration-cyan-500/40" href={a.link} target="_blank" rel="noreferrer">
                        open event
                      </a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {setupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-cyan-300/35 bg-slate-900/95 p-4 shadow-[0_0_30px_rgba(56,189,248,0.20)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-cyan-200">Calendar setup</h3>
              <button
                type="button"
                onClick={() => setSetupOpen(false)}
                className="rounded border border-slate-600 bg-slate-800/80 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-3 rounded border border-border/70 bg-background/40 p-3 text-sm">
              <div className="text-foreground">
                Google Calendar: {status?.connected ? "Connected" : status?.configured ? "Configured but not connected" : "Not configured"}
              </div>
              <div className="mt-1 text-muted-foreground">Gmail: {status?.gmail_connected ? "Connected" : "Not connected"}</div>
              {status?.account_email ? (
                <div className="mt-1 text-xs text-cyan-200">Connected account: {status.account_email}</div>
              ) : null}
              {status?.warning ? <div className="mt-1 text-xs text-amber-300">Warning: {status.warning}</div> : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={connectGoogle}
                disabled={connectingGoogle}
                className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-60"
              >
                {connectingGoogle ? "Connecting..." : "Connect Google Calendar"}
              </button>
              <button
                type="button"
                onClick={loadStatus}
                disabled={statusLoading}
                className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                {statusLoading ? "Checking..." : "Check status"}
              </button>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noreferrer"
                className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                Open Google Calendar
              </a>
              <Link href="/settings" className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                Advanced settings
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
