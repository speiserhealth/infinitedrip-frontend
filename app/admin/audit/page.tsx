"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type AuditRow = {
  id: number;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata?: Record<string, any>;
  created_at?: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function AdminAuditPage() {
  const [logs, setLogs] = React.useState<AuditRow[]>([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const meResp = await apiFetch("/api/me", { cache: "no-store" });
      if (!meResp.ok) throw new Error("Not authenticated");
      const meBody = await meResp.json().catch(() => ({}));
      const role = String(meBody?.user?.role || "").toLowerCase();
      const admin = role === "admin";
      setIsAdmin(admin);
      if (!admin) {
        setLogs([]);
        setLoading(false);
        return;
      }

      const r = await apiFetch("/api/admin/audit-logs?limit=200", { cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Load failed (${r.status}): ${txt}`);
      }
      const body = await r.json();
      setLogs(Array.isArray(body?.logs) ? body.logs : []);
    } catch (e: any) {
      setError(String(e?.message || "Load failed"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <button onClick={() => load()} className="rounded border border-border px-3 py-2 text-sm hover:bg-muted/40">
          Refresh
        </button>
      </div>
      {isAdmin === false ? (
        <p className="mt-3 text-sm text-rose-400">Admin access required.</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading...</p> : null}

      {!loading && logs.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No audit events yet.</p> : null}

      {!loading && logs.length > 0 ? (
        <div className="mt-4 overflow-auto rounded border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.actor_user_id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.action}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.target_type}:{l.target_id}</td>
                  <td className="px-3 py-2"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(l.metadata || {}, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
