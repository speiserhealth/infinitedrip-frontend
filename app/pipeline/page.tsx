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
  ai_enabled?: number | null;
  ai_paused?: number | null;
  ai_cooldown_until?: string | null;
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
  engaged: "bg-amber-500/10 border-amber-400/35",
  cold: "bg-cyan-500/10 border-cyan-400/35",
  booked: "bg-emerald-500/10 border-emerald-400/35",
  sold: "bg-indigo-500/10 border-indigo-400/35",
  dead: "bg-rose-500/10 border-rose-400/35",
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
      <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] text-cyan-300">
        Textdrip
      </span>
    );
  }
  if (s === "csv_import") {
    return (
      <span className="rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
        CSV
      </span>
    );
  }
  if (s === "manual") {
    return (
      <span className="rounded border border-border/70 bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">
        Manual
      </span>
    );
  }

  return (
    <span className="rounded border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-300">
      {s}
    </span>
  );
}

type AiSignal = {
  tone: "green" | "yellow" | "red";
  label: string;
  className: string;
};

function formatCooldownCountdown(remainingMs: number) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function getAiSignal(lead: Lead, nowMs = Date.now()): AiSignal {
  const aiEnabled = Number(lead?.ai_enabled ?? 1) === 1;
  const aiPaused = Number(lead?.ai_paused ?? 0) === 1;
  const cooldownUntilMs = toDateSafe(String(lead?.ai_cooldown_until || ""));
  const inCooldown = cooldownUntilMs > nowMs;

  if (!aiEnabled || aiPaused) {
    return {
      tone: "red",
      label: "AI Stopped",
      className: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    };
  }
  if (inCooldown) {
    return {
      tone: "yellow",
      label: `AI Cooldown ${formatCooldownCountdown(cooldownUntilMs - nowMs)}`,
      className: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    tone: "green",
    label: "AI Active",
    className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  };
}

function normalizeLead(raw: any): Lead {
  return {
    ...raw,
    ai_enabled: Number(raw?.ai_enabled ?? 1),
    ai_paused: Number(raw?.ai_paused ?? 0),
    ai_cooldown_until: raw?.ai_cooldown_until ?? null,
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
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
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

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
    <div className="flex h-[90vh] flex-col rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Funnel</h1>

        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">Sort</div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-border bg-card px-2 py-2 text-sm text-foreground"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>

          {busy ? <div className="text-xs text-muted-foreground">Saving…</div> : null}

          <Link href="/leads" className="text-cyan-400 underline decoration-cyan-500/40">
            Leads
          </Link>

          <Link href="/dashboard" className="text-cyan-400 underline decoration-cyan-500/40">
            Dashboard
          </Link>
        </div>
      </div>

      {error && <div className="mb-3 text-sm text-rose-400">{error}</div>}

      <div className="flex-1 grid grid-cols-5 gap-4 overflow-x-auto">
        {COLUMNS.map((col) => {
          const isOver = dragOver === col;

          return (
            <div
              key={col}
              onDragOver={(e) => onDragOverColumn(e, col)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDropColumn(e, col)}
              className={`flex flex-col rounded-xl border p-3 ${COL_STYLE[col]} ${isOver ? "ring-2 ring-cyan-400" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium text-foreground">{STATUS_LABEL[col]}</div>
                <div className="flex items-center gap-2">
                  <select
                    value={columnRange[col]}
                    onChange={(e) =>
                      setColumnRange((prev) => ({ ...prev, [col]: e.target.value as RangeKey }))
                    }
                    className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground"
                    title="Date range"
                  >
                    <option value="3">3d</option>
                    <option value="7">7d</option>
                    <option value="30">30d</option>
                    <option value="90">90d</option>
                    <option value="all">All</option>
                  </select>
                  <div className="text-xs text-muted-foreground">{leadsFor(col).length}</div>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
                {leadsFor(col).map((l) => {
                  const waiting = l.lastMessageDirection === "in";
                  const hot = isHot(l);
                  const cold = isCold(l);
                  const aiSignal = getAiSignal(l, nowMs);

                  const cardClass = waiting
                    ? "bg-amber-500/15 border-amber-400/45"
                    : hot
                    ? "bg-rose-500/15 border-rose-400/45"
                    : cold
                    ? "bg-cyan-500/15 border-cyan-400/45"
                    : "bg-card/75 border-border/70";

                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, l.id)}
                      onDragEnd={onDragEnd}
                      className={`cursor-grab rounded-md border p-2 shadow-sm transition hover:shadow active:cursor-grabbing ${cardClass}`}
                    >
                      <Link href={`/leads/${l.id}`} className="block">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            {l.name || l.phone || `Lead #${l.id}`}
                          </div>

                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {waiting ? (
                              <span className="rounded border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">
                                WAITING
                              </span>
                            ) : null}
                            {hot ? (
                              <span className="rounded border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[10px] text-rose-200">
                                HOT
                              </span>
                            ) : null}
                            {!waiting && !hot && cold ? (
                              <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] text-cyan-200">
                                COLD
                              </span>
                            ) : null}
                            <span className={`rounded border px-2 py-1 text-[10px] ${aiSignal.className}`}>
                              {aiSignal.tone === "green" ? "🟢" : aiSignal.tone === "yellow" ? "🟡" : "🔴"} {aiSignal.label}
                            </span>

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
                                  ? "border-orange-300/50 bg-orange-500/15 text-orange-200"
                                  : "border-border bg-card text-muted-foreground"
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
                              className="rounded border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
                              title="Archive lead"
                            >
                              Archive
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground">{l.phone}</div>

                        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                          <span>Created: {formatCreated(l.createdAt)}</span>
                          <span>Age: {formatAge(l.createdAt)}</span>
                        </div>

                        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                          <span>Inbound: {Number(l.inboundCount ?? 0)}</span>
                          {l.lastMessageAt ? <span>Last: {formatCreated(l.lastMessageAt)}</span> : <span />}
                        </div>
                      </Link>
                    </div>
                  );
                })}

                {leadsFor(col).length === 0 && (
                  <div className="text-xs italic text-muted-foreground">No leads</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
