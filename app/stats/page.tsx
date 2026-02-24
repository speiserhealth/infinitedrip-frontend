"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type Lead = {
  id: number;
  status?: string | null;
  source?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  created?: string | null;

  firstInboundAt?: string | null;
  firstOutboundAt?: string | null;

  lastMessageDirection?: "in" | "out" | null;
  inboundCount?: number | null;
  inbound_count?: number | null;
  inbound?: number | null;
  lastMessageAt?: string | null;
  last_message_at?: string | null;
  last_message?: string | null;
};

type LeadsResponse = {
  leads?: Lead[];
};

function toMs(v?: string | null): number | null {
  if (!v) return null;
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function fmtDuration(ms: number | null) {
  if (ms === null) return "-";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function srcLabel(src?: string | null) {
  const s = String(src || "manual");
  if (s === "inbound_webhook" || s === "textdrip") return "Textdrip";
  if (s === "csv_import") return "CSV";
  if (s === "manual") return "Manual";
  return s;
}

function normalizeLead(raw: any): Lead {
  return {
    ...raw,
    createdAt: raw?.createdAt ?? raw?.created_at ?? raw?.created ?? null,
    inboundCount: Number(raw?.inboundCount ?? raw?.inbound_count ?? raw?.inbound ?? 0),
    lastMessageAt: raw?.lastMessageAt ?? raw?.last_message_at ?? null,
    source: String(raw?.source || "manual"),
  };
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  const s = values.reduce((a, b) => a + b, 0);
  return Math.round(s / values.length);
}

export default function StatsPage() {
  const API_BASE =
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
    "https://infinitedrip-backend.onrender.com";

  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [error, setError] = React.useState("");

  async function load() {
    const r = await apiFetch(`${API_BASE}/api/leads`, { cache: "no-store" });
    if (!r.ok) throw new Error("Failed");
    const data: any = await r.json();
    const listRaw: Lead[] = Array.isArray(data) ? data : (data as LeadsResponse)?.leads ?? [];
    const list = listRaw.map((l: any) => normalizeLead(l));
    setLeads(list);
  }

  React.useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      let ok = false;
      try {
        await load();
        ok = true;
        if (!dead) setError("");
      } catch {
        if (!dead) setError("Load failed");
      } finally {
        if (!dead) {
          const delayMs = ok ? 7000 : 20000;
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

  const bySource = React.useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const l of leads) {
      const s = String(l.source || "manual");
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(l);
    }
    return Array.from(map.entries()).map(([source, list]) => ({ source, list }));
  }, [leads]);

  const overall = React.useMemo(() => {
    const rt: number[] = [];
    for (const l of leads) {
      const inMs = toMs(l.firstInboundAt);
      const outMs = toMs(l.firstOutboundAt);
      if (inMs !== null && outMs !== null && outMs >= inMs) {
        rt.push(outMs - inMs);
      }
    }
    return {
      total: leads.length,
      waiting: leads.filter((l) => l.lastMessageDirection === "in").length,
      hot: leads.filter((l) => Number(l.inboundCount ?? 0) >= 3).length,
      booked: leads.filter((l) => String(l.status || "").toLowerCase() === "booked").length,
      sold: leads.filter((l) => String(l.status || "").toLowerCase() === "sold").length,
      avgRt: avg(rt),
      medRt: median(rt),
      samples: rt.length,
    };
  }, [leads]);

  return (
    <div className="mx-auto max-w-6xl rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Stats</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link className="text-cyan-400 underline decoration-cyan-500/40" href="/dashboard">Dashboard</Link>
          <Link className="text-cyan-400 underline decoration-cyan-500/40" href="/leads">Leads</Link>
          <Link className="text-cyan-400 underline decoration-cyan-500/40" href="/pipeline">Funnel</Link>
        </div>
      </div>

      {error ? <div className="mb-3 text-sm text-rose-400">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Total leads</div>
          <div className="text-2xl font-semibold text-foreground">{overall.total}</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Waiting (client last msg)</div>
          <div className="text-2xl font-semibold text-foreground">{overall.waiting}</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Hot (3+ inbound msgs)</div>
          <div className="text-2xl font-semibold text-foreground">{overall.hot}</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Booked</div>
          <div className="text-2xl font-semibold text-foreground">{overall.booked}</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Sold</div>
          <div className="text-2xl font-semibold text-foreground">{overall.sold}</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">First response time (from first inbound to first outbound)</div>
          <div className="mt-1 text-sm text-muted-foreground">Samples: {overall.samples}</div>
          <div className="mt-2 text-sm text-foreground">
            Avg: <span className="font-semibold">{fmtDuration(overall.avgRt)}</span>
          </div>
          <div className="text-sm text-foreground">
            Median: <span className="font-semibold">{fmtDuration(overall.medRt)}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-sm">
        <div className="border-b border-border/70 px-4 py-3 font-medium text-foreground">By Source</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-right px-4 py-2">Leads</th>
                <th className="text-right px-4 py-2">Waiting</th>
                <th className="text-right px-4 py-2">Hot</th>
                <th className="text-right px-4 py-2">Booked</th>
                <th className="text-right px-4 py-2">Sold</th>
                <th className="text-right px-4 py-2">Avg RT</th>
                <th className="text-right px-4 py-2">Med RT</th>
              </tr>
            </thead>
            <tbody>
              {bySource
                .sort((a, b) => b.list.length - a.list.length)
                .map(({ source, list }) => {
                  const waiting = list.filter((l) => l.lastMessageDirection === "in").length;
                  const hot = list.filter((l) => Number(l.inboundCount ?? 0) >= 3).length;
                  const booked = list.filter((l) => String(l.status || "").toLowerCase() === "booked").length;
                  const sold = list.filter((l) => String(l.status || "").toLowerCase() === "sold").length;

                  const rts: number[] = [];
                  for (const l of list) {
                    const inMs = toMs(l.firstInboundAt);
                    const outMs = toMs(l.firstOutboundAt);
                    if (inMs !== null && outMs !== null && outMs >= inMs) rts.push(outMs - inMs);
                  }

                  const a = avg(rts);
                  const m = median(rts);

                  return (
                    <tr key={source} className="border-t border-border/70">
                      <td className="px-4 py-2">{srcLabel(source)}</td>
                      <td className="px-4 py-2 text-right">{list.length}</td>
                      <td className="px-4 py-2 text-right">
                        {waiting} ({pct(waiting, list.length)})
                      </td>
                      <td className="px-4 py-2 text-right">
                        {hot} ({pct(hot, list.length)})
                      </td>
                      <td className="px-4 py-2 text-right">
                        {booked} ({pct(booked, list.length)})
                      </td>
                      <td className="px-4 py-2 text-right">
                        {sold} ({pct(sold, list.length)})
                      </td>
                      <td className="px-4 py-2 text-right">{fmtDuration(a)}</td>
                      <td className="px-4 py-2 text-right">{fmtDuration(m)}</td>
                    </tr>
                  );
                })}

              {bySource.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                    No data yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
