"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type DeliveryEvent = {
  id: number;
  user_id: string;
  lead_id?: number | null;
  message_id?: number | null;
  provider_message_id?: string;
  event_type?: string;
  status?: string;
  from_phone?: string;
  to_phone?: string;
  payload?: Record<string, any>;
  created_at?: string | null;
};

type SuppressedContact = {
  id: number;
  user_id: string;
  phone: string;
  reason?: string;
  source?: string;
  active: number;
  payload?: Record<string, any>;
  updated_at?: string | null;
};

type SummaryPayload = {
  window_hours?: number;
  filters?: { user_id?: string; phone?: string };
  delivery_events?: {
    total?: number;
    delivered?: number;
    failed?: number;
    opt_out?: number;
    opt_in?: number;
    unique_phones?: number;
    latest_event_at?: string | null;
    by_status?: Record<string, number>;
  };
  suppressed_contacts?: {
    active?: number;
  };
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

export default function AdminTextdripPage() {
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [summary, setSummary] = React.useState<SummaryPayload | null>(null);
  const [events, setEvents] = React.useState<DeliveryEvent[]>([]);
  const [contacts, setContacts] = React.useState<SuppressedContact[]>([]);

  const [limitInput, setLimitInput] = React.useState("200");
  const [hoursInput, setHoursInput] = React.useState("24");
  const [userFilter, setUserFilter] = React.useState("");
  const [phoneFilter, setPhoneFilter] = React.useState("");
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
        setEvents([]);
        setContacts([]);
        setLoading(false);
        return;
      }

      const limit = asPosInt(limitInput, 200, 1, 1000);
      const hours = asPosInt(hoursInput, 24, 1, 24 * 30);

      const summaryParams = new URLSearchParams();
      summaryParams.set("hours", String(hours));
      if (userFilter.trim()) summaryParams.set("user_id", userFilter.trim());
      if (phoneFilter.trim()) summaryParams.set("phone", phoneFilter.trim());

      const eventsParams = new URLSearchParams(summaryParams);
      eventsParams.set("limit", String(limit));
      eventsParams.set("include_payload", includePayload ? "1" : "0");
      if (statusFilter.trim()) eventsParams.set("status", statusFilter.trim());
      if (eventTypeFilter.trim()) eventsParams.set("event_type", eventTypeFilter.trim());

      const contactsParams = new URLSearchParams();
      contactsParams.set("limit", String(limit));
      contactsParams.set("active_only", activeOnly ? "1" : "0");
      if (userFilter.trim()) contactsParams.set("user_id", userFilter.trim());
      if (phoneFilter.trim()) contactsParams.set("phone", phoneFilter.trim());
      if (sourceFilter.trim()) contactsParams.set("source", sourceFilter.trim());

      const [summaryResp, eventsResp, contactsResp] = await Promise.all([
        apiFetch(`/api/admin/textdrip/summary?${summaryParams.toString()}`, { cache: "no-store" }),
        apiFetch(`/api/admin/textdrip/delivery-events?${eventsParams.toString()}`, { cache: "no-store" }),
        apiFetch(`/api/admin/textdrip/suppressed-contacts?${contactsParams.toString()}`, { cache: "no-store" }),
      ]);

      if (!summaryResp.ok) {
        const txt = await summaryResp.text().catch(() => "");
        throw new Error(`Load summary failed (${summaryResp.status}): ${txt}`);
      }
      if (!eventsResp.ok) {
        const txt = await eventsResp.text().catch(() => "");
        throw new Error(`Load delivery events failed (${eventsResp.status}): ${txt}`);
      }
      if (!contactsResp.ok) {
        const txt = await contactsResp.text().catch(() => "");
        throw new Error(`Load suppressed contacts failed (${contactsResp.status}): ${txt}`);
      }

      const summaryBody = await summaryResp.json().catch(() => ({}));
      const eventsBody = await eventsResp.json().catch(() => ({}));
      const contactsBody = await contactsResp.json().catch(() => ({}));

      setSummary((summaryBody?.summary || null) as SummaryPayload | null);
      setEvents(Array.isArray(eventsBody?.events) ? eventsBody.events : []);
      setContacts(Array.isArray(contactsBody?.contacts) ? contactsBody.contacts : []);
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

  async function setContactActive(contact: SuppressedContact, nextActive: boolean) {
    setBusyId(contact.id);
    setError("");
    try {
      const resp = await apiFetch(`/api/admin/textdrip/suppressed-contacts/${contact.id}`, {
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
    <div className="mx-auto max-w-[1600px] rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Textdrip Debug</h1>
        <button
          onClick={() => load()}
          className="rounded border border-border px-3 py-2 text-sm hover:bg-muted/40"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 rounded border border-border/70 bg-card/70 p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <input
            type="number"
            min={1}
            max={1000}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Limit"
          />
          <input
            type="number"
            min={1}
            max={24 * 30}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Window hours"
          />
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Filter user_id"
          />
          <input
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Filter phone (+1...)"
          />
          <input
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Delivery status (optional)"
          />
          <input
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Event type (optional)"
          />
          <input
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded border border-border px-2 py-2 text-sm"
            placeholder="Suppression source (optional)"
          />
          <div className="flex items-center gap-4 px-1 text-sm text-muted-foreground">
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

      {isAdmin === false ? <p className="mt-3 text-sm text-rose-400">Admin access required.</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading...</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Window</div>
          <div className="text-lg font-semibold">{summary?.window_hours || 0}h</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Events</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.total || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Delivered</div>
          <div className="text-lg font-semibold text-emerald-300">{Number(summary?.delivery_events?.delivered || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Failed</div>
          <div className="text-lg font-semibold text-rose-300">{Number(summary?.delivery_events?.failed || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Opt-out</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.opt_out || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Opt-in</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.opt_in || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Unique phones</div>
          <div className="text-lg font-semibold">{Number(summary?.delivery_events?.unique_phones || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Active suppressed</div>
          <div className="text-lg font-semibold">{Number(summary?.suppressed_contacts?.active || 0)}</div>
        </div>
      </div>

      {Object.keys(statusBreakdown).length > 0 ? (
        <div className="mt-3 rounded border border-border/70 bg-card/70 p-3">
          <div className="text-xs font-medium text-muted-foreground">Status breakdown</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(statusBreakdown).map(([k, v]) => (
              <span key={k} className="rounded border border-border/70 bg-muted/40 px-2 py-1 text-xs">
                {k}: {v}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Latest event: {fmtDate(summary?.delivery_events?.latest_event_at || "") || "-"}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded border border-border/70 bg-card/70">
        <div className="border-b border-border/70 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Recent Delivery Events</h2>
            <p className="text-xs text-muted-foreground">{events.length} rows</p>
          </div>
        </div>
        {!loading && events.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No delivery events found.</p>
        ) : null}
        {events.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">From</th>
                  <th className="px-3 py-2 text-left">To</th>
                  <th className="px-3 py-2 text-left">Lead/Msg</th>
                  <th className="px-3 py-2 text-left">Provider Msg ID</th>
                  {includePayload ? <th className="px-3 py-2 text-left">Payload</th> : null}
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.user_id || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.event_type || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.status || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.from_phone || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.to_phone || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.lead_id || "-"}/{row.message_id || "-"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.provider_message_id || "-"}</td>
                    {includePayload ? (
                      <td className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-cyan-300">View</summary>
                          <pre className="mt-1 whitespace-pre-wrap text-xs">
                            {JSON.stringify(row.payload || {}, null, 2)}
                          </pre>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded border border-border/70 bg-card/70">
        <div className="border-b border-border/70 px-4 py-3">
          <h2 className="text-lg font-medium">Suppressed Contacts</h2>
          <p className="text-xs text-muted-foreground">{contacts.length} rows</p>
        </div>
        {!loading && contacts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No suppressed contacts found.</p>
        ) : null}
        {contacts.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Payload</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((row) => {
                  const isBusy = busyId === row.id;
                  const isActive = Number(row.active || 0) === 1;
                  return (
                    <tr key={row.id} className="border-t border-border/60 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.updated_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.user_id || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.phone || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.reason || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.source || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isActive ? (
                          <span className="rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-300">active</span>
                        ) : (
                          <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isActive ? (
                          <button
                            disabled={isBusy}
                            onClick={() => setContactActive(row, false)}
                            className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                          >
                            Unsuppress
                          </button>
                        ) : (
                          <button
                            disabled={isBusy}
                            onClick={() => setContactActive(row, true)}
                            className="rounded border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                          >
                            Suppress
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-cyan-300">View</summary>
                          <pre className="mt-1 whitespace-pre-wrap text-xs">
                            {JSON.stringify(row.payload || {}, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
