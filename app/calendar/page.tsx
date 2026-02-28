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

type CalendarView = "day" | "week" | "month";

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

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDateSafe(raw?: string | null): Date | null {
  if (!raw) return null;
  const str = String(raw || "").trim();
  if (!str) return null;
  const iso = str.includes("T") ? str : `${str.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function startOfWeek(d: Date): Date {
  const base = startOfDay(d);
  return addDays(base, -base.getDay());
}

function endOfWeek(d: Date): Date {
  return endOfDay(addDays(startOfWeek(d), 6));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateHeading(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRangeLabel(view: CalendarView, anchor: Date): string {
  if (view === "month") {
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  if (view === "week") {
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    const startLabel = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endLabel = e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${startLabel} - ${endLabel}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function getVisibleRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  if (view === "day") {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = endOfWeek(anchor);
    return { start, end };
  }
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  return { start: startOfWeek(monthStart), end: endOfWeek(monthEnd) };
}

function formatEventTimeRange(a: Appointment): string {
  const start = parseDateSafe(a.start);
  const end = parseDateSafe(a.end);
  if (!start) return "No time";
  const s = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!end) return s;
  const e = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${s} - ${e}`;
}

function sortEvents(items: Appointment[]): Appointment[] {
  return [...items].sort((a, b) => {
    const aMs = parseDateSafe(a.start)?.getTime() || 0;
    const bMs = parseDateSafe(b.start)?.getTime() || 0;
    return aMs - bMs;
  });
}

function groupEventsByDay(items: Appointment[]): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const item of sortEvents(items)) {
    const start = parseDateSafe(item.start);
    if (!start) continue;
    const key = toDayKey(start);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

export default function CalendarPage() {
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [savingRules, setSavingRules] = React.useState(false);
  const [events, setEvents] = React.useState<Appointment[]>([]);
  const [view, setView] = React.useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = React.useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(() => new Date());
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [maxConcurrent, setMaxConcurrent] = React.useState("1");
  const [overlapWindow, setOverlapWindow] = React.useState("30");

  const [status, setStatus] = React.useState<CalendarStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [connectingGoogle, setConnectingGoogle] = React.useState(false);

  const visibleRange = React.useMemo(() => getVisibleRange(view, anchorDate), [view, anchorDate]);
  const eventsByDay = React.useMemo(() => groupEventsByDay(events), [events]);

  const selectedDayEvents = React.useMemo(() => {
    return sortEvents(eventsByDay.get(toDayKey(startOfDay(selectedDate))) || []);
  }, [eventsByDay, selectedDate]);

  const monthCells = React.useMemo(() => {
    if (view !== "month") return [] as Date[];
    const out: Date[] = [];
    let cursor = new Date(visibleRange.start);
    while (cursor.getTime() <= visibleRange.end.getTime()) {
      out.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [view, visibleRange]);

  const weekDays = React.useMemo(() => {
    if (view !== "week") return [] as Date[];
    const out: Date[] = [];
    for (let i = 0; i < 7; i += 1) out.push(addDays(startOfWeek(anchorDate), i));
    return out;
  }, [view, anchorDate]);

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

  const loadSettings = React.useCallback(async () => {
    const settingsRes = await apiFetch("/api/settings", { cache: "no-store" });
    if (!settingsRes.ok) {
      const txt = await settingsRes.text().catch(() => "");
      throw new Error(`Calendar settings load failed (${settingsRes.status}): ${txt}`);
    }
    const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;
    const settings = settingsBody?.settings || {};
    setMaxConcurrent(String(settings.calendar_max_concurrent_bookings || 1));
    setOverlapWindow(String(settings.calendar_overlap_window_minutes || 30));
  }, []);

  const loadEvents = React.useCallback(async () => {
    setLoadingEvents(true);
    setError("");
    try {
      const params = new URLSearchParams({
        timeMin: visibleRange.start.toISOString(),
        timeMax: visibleRange.end.toISOString(),
        maxResults: "500",
      });
      const apptRes = await apiFetch(`/api/appointments?${params.toString()}`, { cache: "no-store" });
      if (!apptRes.ok) {
        const txt = await apptRes.text().catch(() => "");
        throw new Error(`Appointments load failed (${apptRes.status}): ${txt}`);
      }
      const apptBody = await apptRes.json().catch(() => ({}));
      setEvents(Array.isArray(apptBody?.events) ? apptBody.events : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Failed loading calendar events");
      setError(msg);
    } finally {
      setLoadingEvents(false);
    }
  }, [visibleRange]);

  React.useEffect(() => {
    loadSettings().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e || "Failed loading calendar settings");
      setError(msg);
    });
    loadStatus();
  }, [loadSettings, loadStatus]);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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

  function shiftWindow(delta: number) {
    setSuccess("");
    setAnchorDate((prev) => {
      if (view === "day") return addDays(prev, delta);
      if (view === "week") return addDays(prev, delta * 7);
      return addMonths(prev, delta);
    });
    setSelectedDate((prev) => {
      if (view === "day") return addDays(prev, delta);
      if (view === "week") return addDays(prev, delta * 7);
      return addMonths(prev, delta);
    });
  }

  function setToday() {
    const now = new Date();
    setAnchorDate(now);
    setSelectedDate(now);
  }

  return (
    <main className="rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Day/week/month calendar with per-user booking controls.
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
            onClick={loadEvents}
            className="rounded border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Refresh events
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
      {success ? <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</div> : null}

      <section className="mt-6 rounded-xl border border-border/80 bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded border border-border/70 bg-background/40 p-1">
            {([
              { key: "day", label: "Day" },
              { key: "week", label: "Week" },
              { key: "month", label: "Month" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`rounded px-2 py-1 text-xs ${
                  view === tab.key
                    ? "border border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                    : "border border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftWindow(-1)}
              className="rounded border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={setToday}
              className="rounded border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftWindow(1)}
              className="rounded border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm font-medium text-cyan-200">{formatRangeLabel(view, anchorDate)}</div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[2.5fr_1fr]">
          <div className="rounded border border-border/70 bg-background/30 p-3">
            {loadingEvents ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}

            {!loadingEvents && view === "month" ? (
              <>
                <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground">
                  {WEEKDAY_LABELS.map((d) => (
                    <div key={d} className="rounded bg-background/40 px-2 py-1 text-center">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthCells.map((d) => {
                    const dayKey = toDayKey(d);
                    const dayEvents = eventsByDay.get(dayKey) || [];
                    const inCurrentMonth = d.getMonth() === anchorDate.getMonth();
                    const isSelected = sameDay(d, selectedDate);
                    const isToday = sameDay(d, new Date());
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        onClick={() => setSelectedDate(d)}
                        className={`min-h-[108px] rounded border px-2 py-1 text-left transition ${
                          isSelected
                            ? "border-cyan-400/70 bg-cyan-500/15"
                            : "border-border/60 bg-background/35 hover:border-cyan-400/40"
                        }`}
                      >
                        <div className={`text-xs font-medium ${inCurrentMonth ? "text-foreground" : "text-muted-foreground/60"}`}>
                          {isToday ? <span className="rounded bg-cyan-500/20 px-1.5 py-0.5">{d.getDate()}</span> : d.getDate()}
                        </div>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <div key={ev.id} className="truncate rounded bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-cyan-100">
                              {formatEventTimeRange(ev)} {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 ? (
                            <div className="text-[11px] text-muted-foreground">+{dayEvents.length - 2} more</div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!loadingEvents && view === "week" ? (
              <div className="grid gap-2 md:grid-cols-7">
                {weekDays.map((d) => {
                  const key = toDayKey(d);
                  const dayEvents = eventsByDay.get(key) || [];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`rounded border p-2 text-left ${
                        sameDay(d, selectedDate)
                          ? "border-cyan-400/70 bg-cyan-500/15"
                          : "border-border/60 bg-background/35 hover:border-cyan-400/40"
                      }`}
                    >
                      <div className="text-xs text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                      <div className="text-sm font-semibold text-foreground">{d.getDate()}</div>
                      <div className="mt-2 space-y-1">
                        {dayEvents.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">No events</div>
                        ) : (
                          dayEvents.slice(0, 6).map((ev) => (
                            <div key={ev.id} className="truncate rounded bg-slate-800/70 px-1.5 py-1 text-[11px] text-cyan-100">
                              {formatEventTimeRange(ev)} {ev.title}
                            </div>
                          ))
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {!loadingEvents && view === "day" ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-cyan-200">{formatDateHeading(selectedDate)}</div>
                {selectedDayEvents.length === 0 ? (
                  <div className="rounded border border-border/60 bg-background/35 px-3 py-3 text-sm text-muted-foreground">
                    No appointments on this day.
                  </div>
                ) : (
                  selectedDayEvents.map((ev) => (
                    <div key={ev.id} className="rounded border border-border/60 bg-background/35 px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{ev.title}</div>
                      <div className="text-xs text-muted-foreground">{formatEventTimeRange(ev)}</div>
                      {ev.link ? (
                        <a
                          className="mt-1 inline-block text-xs text-cyan-400 underline decoration-cyan-500/40"
                          href={ev.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open event
                        </a>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <section className="rounded border border-border/70 bg-background/30 p-3">
              <h2 className="text-sm font-semibold text-foreground">Booking rules</h2>
              <p className="mt-1 text-xs text-muted-foreground">Control double/triple-booking behavior.</p>
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-muted-foreground">Capacity</label>
                <select
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="1">Single booking</option>
                  <option value="2">Double booking</option>
                  <option value="3">Triple booking</option>
                </select>
              </div>
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-muted-foreground">Overlap window</label>
                <select
                  value={overlapWindow}
                  onChange={(e) => setOverlapWindow(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <button
                type="button"
                onClick={saveRules}
                disabled={savingRules}
                className="mt-3 w-full rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
              >
                {savingRules ? "Saving..." : "Save rules"}
              </button>
            </section>

            <section className="rounded border border-border/70 bg-background/30 p-3">
              <h2 className="text-sm font-semibold text-foreground">Selected day</h2>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateHeading(selectedDate)}</p>
              <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {selectedDayEvents.length === 0 ? (
                  <div className="rounded border border-border/60 bg-background/35 px-2 py-2 text-xs text-muted-foreground">
                    No appointments.
                  </div>
                ) : (
                  selectedDayEvents.map((ev) => (
                    <div key={`side-${ev.id}`} className="rounded border border-border/60 bg-background/35 px-2 py-2">
                      <div className="text-xs font-semibold text-foreground">{ev.title}</div>
                      <div className="text-[11px] text-muted-foreground">{formatEventTimeRange(ev)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
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
