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

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function AdminTextdripPage() {
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [events, setEvents] = React.useState<DeliveryEvent[]>([]);
  const [contacts, setContacts] = React.useState<SuppressedContact[]>([]);
  const [limitInput, setLimitInput] = React.useState("200");
  const [activeOnly, setActiveOnly] = React.useState(true);
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
        setEvents([]);
        setContacts([]);
        setLoading(false);
        return;
      }

      const limit = Math.max(1, Math.min(1000, Number(limitInput || "200")));
      const activeOnlyParam = activeOnly ? "1" : "0";

      const [eventsResp, contactsResp] = await Promise.all([
        apiFetch(`/api/admin/textdrip/delivery-events?limit=${limit}`, { cache: "no-store" }),
        apiFetch(
          `/api/admin/textdrip/suppressed-contacts?limit=${limit}&active_only=${activeOnlyParam}`,
          { cache: "no-store" }
        ),
      ]);

      if (!eventsResp.ok) {
        const txt = await eventsResp.text().catch(() => "");
        throw new Error(`Load delivery events failed (${eventsResp.status}): ${txt}`);
      }
      if (!contactsResp.ok) {
        const txt = await contactsResp.text().catch(() => "");
        throw new Error(`Load suppressed contacts failed (${contactsResp.status}): ${txt}`);
      }

      const eventsBody = await eventsResp.json().catch(() => ({}));
      const contactsBody = await contactsResp.json().catch(() => ({}));
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
  }, [activeOnly]);

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

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Textdrip Debug</h1>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            title="Limit"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            Active only
          </label>
          <button
            onClick={() => load()}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {isAdmin === false ? <p className="mt-3 text-sm text-red-600">Admin access required.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}

      <div className="mt-6 rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium">Recent Delivery Events</h2>
          <p className="text-xs text-gray-500">Most recent Textdrip delivery status callbacks.</p>
        </div>
        {!loading && events.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-600">No delivery events found.</p>
        ) : null}
        {events.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">From</th>
                  <th className="px-3 py-2 text-left">To</th>
                  <th className="px-3 py-2 text-left">Lead/Msg</th>
                  <th className="px-3 py-2 text-left">Provider Msg ID</th>
                  <th className="px-3 py-2 text-left">Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
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
                    <td className="px-3 py-2">
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-700">View</summary>
                        <pre className="mt-1 whitespace-pre-wrap text-xs">
                          {JSON.stringify(row.payload || {}, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium">Suppressed Contacts</h2>
          <p className="text-xs text-gray-500">Use Unsuppress to allow sends again for a contact.</p>
        </div>
        {!loading && contacts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-600">No suppressed contacts found.</p>
        ) : null}
        {contacts.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
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
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.updated_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.user_id || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.phone || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.reason || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.source || "-"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isActive ? (
                          <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">active</span>
                        ) : (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isActive ? (
                          <button
                            disabled={isBusy}
                            onClick={() => setContactActive(row, false)}
                            className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            Unsuppress
                          </button>
                        ) : (
                          <button
                            disabled={isBusy}
                            onClick={() => setContactActive(row, true)}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Suppress
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-blue-700">View</summary>
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
