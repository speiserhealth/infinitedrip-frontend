"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type EmailEvent = {
  id: number;
  user_id: string;
  email?: string;
  provider_message_id?: string;
  event_type?: string;
  status?: string;
  subject?: string;
  from_email?: string;
  to_email?: string;
  error_reason?: string;
  payload?: Record<string, any>;
  created_at?: string | null;
};

type SuppressedEmail = {
  id: number;
  user_id: string;
  email: string;
  reason?: string;
  source?: string;
  active: number;
  payload?: Record<string, any>;
  updated_at?: string | null;
};

type SummaryPayload = {
  window_hours?: number;
  filters?: { user_id?: string; email?: string };
  delivery_events?: {
    total?: number;
    delivered?: number;
    failed?: number;
    opened?: number;
    clicked?: number;
    complaints?: number;
    unique_emails?: number;
    latest_event_at?: string | null;
    by_status?: Record<string, number>;
  };
  suppressed_emails?: {
    active?: number;
  };
};

type ConfigPayload = {
  resend_configured?: boolean;
  email_from?: string;
  webhook_secret_set?: boolean;
  webhook_url?: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function asPosInt(raw: string, fallback: number, min: number, max: number) {
  const n = Number(raw || "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default function AdminEmailPage() {
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [summary, setSummary] = React.useState<SummaryPayload | null>(null);
  const [config, setConfig] = React.useState<ConfigPayload>({});
  const [events, setEvents] = React.useState<EmailEvent[]>([]);
  const [suppressed, setSuppressed] = React.useState<SuppressedEmail[]>([]);

  const [limitInput, setLimitInput] = React.useState("200");
  const [hoursInput, setHoursInput] = React.useState("24");
  const [userFilter, setUserFilter] = React.useState("");
  const [emailFilter, setEmailFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [eventTypeFilter, setEventTypeFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [includePayload, setIncludePayload] = React.useState(false);

  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const meResp = await apiFetch("/api/me", { cache: "no-store" });
      if (!meResp.ok) throw new Error("Not authenticated");
      const meBody = await meResp.json().catch(() => ({}));
      const admin = String(meBody?.user?.role || "").toLowerCase() === "admin";
      setIsAdmin(admin);
      if (!admin) {
        setSummary(null);
        setConfig({});
        setEvents([]);
        setSuppressed([]);
        setLoading(false);
        return;
      }

      const limit = asPosInt(limitInput, 200, 1, 1000);
      const hours = asPosInt(hoursInput, 24, 1, 24 * 30);

      const summaryParams = new URLSearchParams();
      summaryParams.set("hours", String(hours));
      if (userFilter.trim()) summaryParams.set("user_id", userFilter.trim());
      if (emailFilter.trim()) summaryParams.set("email", emailFilter.trim());

      const eventsParams = new URLSearchParams(summaryParams);
      eventsParams.set("limit", String(limit));
      eventsParams.set("include_payload", includePayload ? "1" : "0");
      if (statusFilter.trim()) eventsParams.set("status", statusFilter.trim());
      if (eventTypeFilter.trim()) eventsParams.set("event_type", eventTypeFilter.trim());

      const suppressedParams = new URLSearchParams();
      suppressedParams.set("limit", String(limit));
      suppressedParams.set("active_only", activeOnly ? "1" : "0");
      if (userFilter.trim()) suppressedParams.set("user_id", userFilter.trim());
      if (emailFilter.trim()) suppressedParams.set("email", emailFilter.trim());
      if (sourceFilter.trim()) suppressedParams.set("source", sourceFilter.trim());

      const [summaryResp, eventsResp, suppressedResp] = await Promise.all([
        apiFetch(`/api/admin/email/summary?${summaryParams.toString()}`, { cache: "no-store" }),
        apiFetch(`/api/admin/email/delivery-events?${eventsParams.toString()}`, { cache: "no-store" }),
        apiFetch(`/api/admin/email/suppressed-emails?${suppressedParams.toString()}`, { cache: "no-store" }),
      ]);

      if (!summaryResp.ok) {
        const txt = await summaryResp.text().catch(() => "");
        throw new Error(`Load summary failed (${summaryResp.status}): ${txt}`);
      }
      if (!eventsResp.ok) {
        const txt = await eventsResp.text().catch(() => "");
        throw new Error(`Load events failed (${eventsResp.status}): ${txt}`);
      }
      if (!suppressedResp.ok) {
        const txt = await suppressedResp.text().catch(() => "");
        throw new Error(`Load suppressed emails failed (${suppressedResp.status}): ${txt}`);
      }

      const summaryBody = await summaryResp.json().catch(() => ({}));
      const eventsBody = await eventsResp.json().catch(() => ({}));
      const suppressedBody = await suppressedResp.json().catch(() => ({}));

      setSummary((summaryBody?.summary || null) as SummaryPayload | null);
      setConfig((summaryBody?.config || {}) as ConfigPayload);
      setEvents(Array.isArray(eventsBody?.events) ? eventsBody.events : []);
      setSuppressed(Array.isArray(suppressedBody?.emails) ? suppressedBody.emails : []);
    } catch (e: any) {
      setError(String(e?.message || "Load failed"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setSuppressedActive(row: SuppressedEmail, nextActive: boolean) {
    setBusyId(row.id);
    setError("");
    try {
      const resp = await apiFetch(`/api/admin/email/suppressed-emails/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Update failed (${resp.status}): ${txt}`);
      }
      await load();
    } catch (e: any) {
      setError(String(e?.message || "Update failed"));
    } finally {
      setBusyId(null);
    }
  }

  const statusBreakdown = summary?.delivery_events?.by_status || {};

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Email Debug</h1>
        <button
          onClick={() => load()}
          className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 rounded border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <input
            type="number"
            min={1}
            max={1000}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Limit"
          />
          <input
            type="number"
            min={1}
            max={24 * 30}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Window hours"
          />
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Filter user_id"
          />
          <input
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Filter email"
          />
          <input
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Status (optional)"
          />
          <input
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Event type (optional)"
          />
          <input
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Suppression source (optional)"
          />
          <div className="flex items-center gap-4 px-1 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includePayload}
                onChange={(e) => setIncludePayload(e.target.checked)}
              />
              Include payload
            </label>
          </div>
        </div>
      </div>

      {isAdmin === false ? <p className="mt-3 text-sm text-red-600">Admin access required.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}

      <div className="mt-3 rounded border border-gray-200 bg-white p-3 text-xs text-gray-700">
        <div>
          Resend configured:{" "}
          <span className={config.resend_configured ? "text-green-700 font-medium" : "text-yellow-700 font-medium"}>
            {config.resend_configured ? "yes" : "no"}
          </span>
          {" | "}From: {config.email_from || "-"}
        </div>
        <div>
          Webhook secret set:{" "}
          <span className={config.webhook_secret_set ? "text-green-700 font-medium" : "text-yellow-700 font-medium"}>
            {config.webhook_secret_set ? "yes" : "no"}
          </span>
        </div>
        <div className="mt-1 break-all">
          Webhook URL: <code>{config.webhook_url || "-"}</code>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Window</div>
          <div className="text-lg font-semibold">{summary?.window_hours || 0}h</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Events</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.total || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Delivered</div>
          <div className="text-lg font-semibold text-green-700">{Number(summary?.delivery_events?.delivered || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Failed</div>
          <div className="text-lg font-semibold text-red-700">{Number(summary?.delivery_events?.failed || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Opened</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.opened || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Clicked</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.clicked || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Complaints</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.complaints || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-500">Active suppressed</div>
          <div className="text-lg font-semibold">{Number(summary?.suppressed_emails?.active || 0)}</div>
        </div>
      </div>

      {Object.keys(statusBreakdown).length > 0 ? (
        <div className="mt-3 rounded border border-gray-200 bg-white p-3">
          <div className="text-xs font-medium text-gray-600">Status breakdown</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(statusBreakdown).map(([k, v]) => (
              <span key={k} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
                {k}: {v}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Latest event: {fmtDate(summary?.delivery_events?.latest_event_at || "") || "-"}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Recent Email Events</h2>
            <p className="text-xs text-gray-500">{events.length} rows</p>
          </div>
        </div>
        {!loading && events.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-600">No email events found.</p>
        ) : null}
        {events.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">From</th>
                  <th className="px-3 py-2 text-left">Provider Msg ID</th>
                  <th className="px-3 py-2 text-left">Error</th>
                  {includePayload ? <th className="px-3 py-2 text-left">Payload</th> : null}
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.user_id || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.email || row.to_email || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.event_type || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.status || "-"}</td>
                    <td className="px-3 py-2">{row.subject || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.from_email || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.provider_message_id || "-"}</td>
                    <td className="px-3 py-2">{row.error_reason || "-"}</td>
                    {includePayload ? (
                      <td className="px-3 py-2 max-w-[420px]">
                        <pre className="whitespace-pre-wrap break-words text-xs text-gray-700">
                          {JSON.stringify(row.payload || {}, null, 2)}
                        </pre>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Suppressed Emails</h2>
            <p className="text-xs text-gray-500">{suppressed.length} rows</p>
          </div>
        </div>
        {!loading && suppressed.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-600">No suppressed emails found.</p>
        ) : null}
        {suppressed.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {suppressed.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.updated_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.user_id || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.email || "-"}</td>
                    <td className="px-3 py-2">{row.reason || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.source || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.active ? <span className="text-red-700">active</span> : <span className="text-green-700">inactive</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        disabled={busyId === row.id}
                        onClick={() => setSuppressedActive(row, !row.active)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                      >
                        {row.active ? "Unsuppress" : "Suppress"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
