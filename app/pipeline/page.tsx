"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type LeadStatus = "engaged" | "cold" | "booked" | "sold" | "dead";

type Lead = {
  id: number;
  name?: string | null;
  phone?: string | null;
  status?: LeadStatus | string | null;
  createdAt?: string | null;
  created_at?: string | null;
  created?: string | null;

  lastMessageDirection?: "in" | "out" | null;
  lastMessageAt?: string | null;
  last_message_at?: string | null;
  inboundCount?: number | null;
  inbound_count?: number | null;
  inbound?: number | null;
  source?: string | null;
  hot?: number | null;
  archived?: number | null;
};

const COLUMNS: LeadStatus[] = ["engaged", "cold", "booked", "sold", "dead"];

const STATUS_LABEL: Record<LeadStatus, string> = {
  engaged: "Engaged",
  cold: "Cold",
  booked: "Booked",
  sold: "Sold",
  dead: "Dead",
};

const COL_STYLE: Record<LeadStatus, string> = {
  engaged: "bg-yellow-50 border-yellow-300",
  cold: "bg-cyan-50 border-cyan-300",
  booked: "bg-green-50 border-green-300",
  sold: "bg-indigo-50 border-indigo-300",
  dead: "bg-red-50 border-red-300",
};

function normalizeStatus(s: any): LeadStatus {
  const v = String(s || "engaged").toLowerCase();
  if (v === "new" || v === "contacted" || v === "engaged") return "engaged";
  if (v === "booked" || v === "sold" || v === "cold" || v === "dead") return v;
  return "engaged";
}

function toDateSafe(v?: string | null): number {
  if (!v) return 0;
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatCreated(v?: string | null) {
  if (!v) return "";
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function formatAge(v?: string | null) {
  const t = toDateSafe(v);
  if (!t) return "";

  const diffMs = Date.now() - t;
  if (diffMs < 0) return "";

  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function renderSourceBadge(v?: string | null) {
  const s = String(v || "manual");

  if (s === "textdrip" || s === "inbound_webhook") {
    return (
      <span className="text-[10px] px-2 py-1 rounded border bg-blue-100 text-blue-800 border-blue-300">
        Textdrip
      </span>
    );
  }
  if (s === "csv_import") {
    return (
      <span className="text-[10px] px-2 py-1 rounded border bg-green-100 text-green-800 border-green-300">
        CSV
      </span>
    );
  }
  if (s === "manual") {
    return (
      <span className="text-[10px] px-2 py-1 rounded border bg-gray-100 text-gray-800 border-gray-300">
        Manual
      </span>
    );
  }

  return (
    <span className="text-[10px] px-2 py-1 rounded border bg-purple-100 text-purple-800 border-purple-300">
      {s}
    </span>
  );
}

function normalizeLead(raw: any): Lead {
  return {
    ...raw,
    createdAt: raw?.createdAt ?? raw?.created_at ?? raw?.created ?? null,
    lastMessageAt: raw?.lastMessageAt ?? raw?.last_message_at ?? null,
    inboundCount: Number(raw?.inboundCount ?? raw?.inbound_count ?? raw?.inbound ?? 0),
    source: String(raw?.source || "manual"),
    hot: Number(raw?.hot ?? 0),
  };
}

type SortKey = "newest" | "oldest";
type RangeKey = "3" | "7" | "30" | "90" | "all";

export default function PipelinePage() {
  const API_BASE =
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
    "https://infinitedrip-backend.onrender.com";

  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [columnRange, setColumnRange] = React.useState<Record<LeadStatus, RangeKey>>({
    engaged: "30",
    cold: "30",
    booked: "30",
    sold: "30",
    dead: "30",
  });

  const dragLeadIdRef = React.useRef<number | null>(null);
  const [dragOver, setDragOver] = React.useState<LeadStatus | null>(null);

  async function loadLeads() {
    const r = await apiFetch(`${API_BASE}/api/leads`, { cache: "no-store" });
    if (!r.ok) throw new Error("Load failed");
    const data = await r.json();
    const listRaw: Lead[] = Array.isArray(data) ? data : data?.leads ?? [];
    const list = listRaw.map((l: any) => normalizeLead(l));
    setLeads(list);
  }

  React.useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let ok = false;
      try {
        await loadLeads();
        ok = true;
        if (!dead) setError("");
      } catch {
        if (!dead) setError("Load failed");
      } finally {
        if (!dead) {
          const delayMs = ok ? 5000 : 15000;
          timer = setTimeout(tick, delayMs);
        }
      }
    }

    tick();

    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, [API_BASE]);

  function isCold(l: Lead) {
    return normalizeStatus(l.status) === "cold";
  }

  function isHot(l: Lead) {
    return Number(l.hot ?? 0) === 1;
  }

  function leadsFor(status: LeadStatus) {
    const range = columnRange[status] || "30";
    const now = Date.now();
    const maxAgeMs = range === "all" ? null : Number(range) * 24 * 60 * 60 * 1000;

    const list = leads.filter((l) => {
      if (normalizeStatus(l.status) !== status) return false;
      if (maxAgeMs === null) return true;
      const createdMs = toDateSafe(l.createdAt);
      if (!createdMs) return false;
      return (now - createdMs) <= maxAgeMs;
    });
    list.sort((a, b) => {
      const ta = toDateSafe(a.createdAt);
      const tb = toDateSafe(b.createdAt);
      return sort === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }

  async function moveLead(leadId: number, nextStatus: LeadStatus) {
    try {
      setBusy(true);
      setError("");

      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!r.ok) throw new Error("Move failed");
      await loadLeads();
    } catch {
      setError("Move failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHot(leadId: number, hot: boolean) {
    try {
      setBusy(true);
      setError("");
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/hot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hot }),
      });
      if (!r.ok) throw new Error("Hot toggle failed");
      await loadLeads();
    } catch {
      setError("Hot toggle failed");
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(leadId: number, archived: boolean) {
    try {
      setBusy(true);
      setError("");
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/archive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!r.ok) throw new Error("Archive update failed");
      await loadLeads();
    } catch {
      setError("Archive update failed");
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(e: React.DragEvent, leadId: number) {
    dragLeadIdRef.current = leadId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(leadId));
  }

  function onDragEnd() {
    dragLeadIdRef.current = null;
    setDragOver(null);
  }

  function onDragOverColumn(e: React.DragEvent, col: LeadStatus) {
    e.preventDefault();
    setDragOver(col);
    e.dataTransfer.dropEffect = "move";
  }

  async function onDropColumn(e: React.DragEvent, col: LeadStatus) {
    e.preventDefault();

    const idFromDt = Number(e.dataTransfer.getData("text/plain"));
    const leadId = dragLeadIdRef.current ?? (Number.isFinite(idFromDt) ? idFromDt : null);

    setDragOver(null);
    dragLeadIdRef.current = null;

    if (!leadId) return;

    const existing = leads.find((l) => l.id === leadId);
    if (existing && normalizeStatus(existing.status) === col) return;

    await moveLead(leadId, col);
  }

  return (
    <div className="p-6 h-[90vh] flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Funnel</h1>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">Sort</div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border rounded px-2 py-2 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>

          {busy ? <div className="text-xs text-gray-500">Saving…</div> : null}

          <Link href="/leads" className="text-blue-600 underline">
            Leads
          </Link>

          <Link href="/dashboard" className="text-blue-600 underline">
            Dashboard
          </Link>
        </div>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

      <div className="flex-1 grid grid-cols-5 gap-4 overflow-x-auto">
        {COLUMNS.map((col) => {
          const isOver = dragOver === col;

          return (
            <div
              key={col}
              onDragOver={(e) => onDragOverColumn(e, col)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDropColumn(e, col)}
              className={`border rounded-lg p-3 flex flex-col ${COL_STYLE[col]} ${isOver ? "ring-2 ring-blue-400" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">{STATUS_LABEL[col]}</div>
                <div className="flex items-center gap-2">
                  <select
                    value={columnRange[col]}
                    onChange={(e) =>
                      setColumnRange((prev) => ({ ...prev, [col]: e.target.value as RangeKey }))
                    }
                    className="text-[11px] border rounded px-1.5 py-0.5 bg-white"
                    title="Date range"
                  >
                    <option value="3">3d</option>
                    <option value="7">7d</option>
                    <option value="30">30d</option>
                    <option value="90">90d</option>
                    <option value="all">All</option>
                  </select>
                  <div className="text-xs text-gray-500">{leadsFor(col).length}</div>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
                {leadsFor(col).map((l) => {
                  const waiting = l.lastMessageDirection === "in";
                  const hot = isHot(l);
                  const cold = isCold(l);

                  const cardClass = waiting
                    ? "bg-orange-50 border-orange-300"
                    : hot
                    ? "bg-red-50 border-red-300"
                    : cold
                    ? "bg-blue-50 border-blue-300"
                    : "bg-white border-gray-200";

                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, l.id)}
                      onDragEnd={onDragEnd}
                      className={`border rounded-md p-2 shadow-sm hover:shadow transition cursor-grab active:cursor-grabbing ${cardClass}`}
                    >
                      <Link href={`/leads/${l.id}`} className="block">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">
                            {l.name || l.phone || `Lead #${l.id}`}
                          </div>

                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {waiting ? (
                              <span className="text-[10px] px-2 py-1 rounded border bg-orange-100 text-orange-800 border-orange-300">
                                WAITING
                              </span>
                            ) : null}
                            {hot ? (
                              <span className="text-[10px] px-2 py-1 rounded border bg-red-100 text-red-800 border-red-300">
                                HOT
                              </span>
                            ) : null}
                            {!waiting && !hot && cold ? (
                              <span className="text-[10px] px-2 py-1 rounded border bg-blue-100 text-blue-900 border-blue-300">
                                COLD
                              </span>
                            ) : null}

                            {renderSourceBadge(l.source)}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleHot(l.id, !hot).catch(() => {});
                              }}
                              className={`text-[11px] px-2 py-1 rounded border ${
                                hot
                                  ? "bg-orange-100 border-orange-300 text-orange-800"
                                  : "bg-white border-gray-300 text-gray-600"
                              }`}
                              title={hot ? "Unset hot" : "Set hot"}
                            >
                              🔥
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setArchived(l.id, true).catch(() => {});
                              }}
                              className="text-[11px] px-2 py-1 rounded border bg-white border-gray-300 text-gray-600"
                              title="Archive lead"
                            >
                              Archive
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-gray-600">{l.phone}</div>

                        <div className="text-[11px] text-gray-500 mt-1 flex justify-between">
                          <span>Created: {formatCreated(l.createdAt)}</span>
                          <span>Age: {formatAge(l.createdAt)}</span>
                        </div>

                        <div className="text-[11px] text-gray-500 mt-1 flex justify-between">
                          <span>Inbound: {Number(l.inboundCount ?? 0)}</span>
                          {l.lastMessageAt ? <span>Last: {formatCreated(l.lastMessageAt)}</span> : <span />}
                        </div>
                      </Link>
                    </div>
                  );
                })}

                {leadsFor(col).length === 0 && (
                  <div className="text-xs text-gray-400 italic">No leads</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
