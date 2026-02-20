"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type LeadStatus = "new" | "contacted" | "booked" | "sold" | "dead";

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
  last_message?: string | null;
  inboundCount?: number | null;
  inbound_count?: number | null;
  inbound?: number | null;
  source?: string | null;
};

type LeadsResponse = {
  leads?: Lead[];
  counts?: Record<string, number>;
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-gray-100 text-gray-700 border-gray-300",
  contacted: "bg-yellow-100 text-yellow-800 border-yellow-300",
  booked: "bg-green-100 text-green-800 border-green-300",
  sold: "bg-indigo-100 text-indigo-800 border-indigo-300",
  dead: "bg-red-100 text-red-700 border-red-300",
};

function normalizeStatus(s: any): LeadStatus {
  const v = String(s || "new").toLowerCase();
  if (v === "new" || v === "contacted" || v === "booked" || v === "sold" || v === "dead") return v;
  return "new";
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
      <span className="text-[11px] px-2 py-1 rounded border bg-blue-100 text-blue-800 border-blue-300">
        Textdrip
      </span>
    );
  }
  if (s === "csv_import") {
    return (
      <span className="text-[11px] px-2 py-1 rounded border bg-green-100 text-green-800 border-green-300">
        CSV
      </span>
    );
  }
  if (s === "manual") {
    return (
      <span className="text-[11px] px-2 py-1 rounded border bg-gray-100 text-gray-800 border-gray-300">
        Manual
      </span>
    );
  }

  return (
    <span className="text-[11px] px-2 py-1 rounded border bg-purple-100 text-purple-800 border-purple-300">
      {s}
    </span>
  );
}

function normalizeLead(raw: any): Lead {
  const createdAt = raw?.createdAt ?? raw?.created_at ?? raw?.created ?? null;
  const lastMessageAt = raw?.lastMessageAt ?? raw?.last_message_at ?? null;
  const inboundCount = raw?.inboundCount ?? raw?.inbound_count ?? raw?.inbound ?? 0;

  return {
    ...raw,
    createdAt,
    lastMessageAt,
    inboundCount: Number(inboundCount ?? 0),
    source: String(raw?.source || "manual"),
  };
}

type SortKey = "newest" | "oldest";

async function readResponseError(r: Response): Promise<string> {
  const ct = (r.headers.get("content-type") || "").toLowerCase();

  // Try text first (works for both JSON + HTML)
  const text = await r.text().catch(() => "");

  // If it's HTML, surface that clearly (usually means we hit Next.js instead of backend)
  if (ct.includes("text/html") || text.trim().startsWith("<!DOCTYPE html")) {
    return "Server returned HTML (wrong route / proxy / auth).";
  }

  // If JSON, try to extract a useful message
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(text || "{}");
      const msg =
        j?.error ||
        j?.message ||
        j?.detail ||
        j?.errors?.[0]?.message ||
        "";
      return msg ? String(msg) : (text || "Request failed");
    } catch {
      return text || "Request failed";
    }
  }

  return text || "Request failed";
}

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number> | null>(null);
  const [error, setError] = React.useState("");

  const [sort, setSort] = React.useState<SortKey>("newest");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [file, setFile] = React.useState<File | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string>("");

  async function loadLeads() {
    const r = await apiFetch(`/api/leads`, { cache: "no-store" });
    if (!r.ok) {
      const details = await readResponseError(r);
      const url = (r as any)?.url ? String((r as any).url) : "unknown-url";
      throw new Error(`Failed to load leads (${r.status}) [${url}]: ${details}`);
    }

    const data: any = await r.json();
    const listRaw: Lead[] = Array.isArray(data) ? data : (data as LeadsResponse)?.leads ?? [];
    const list = listRaw.map((l: any) => normalizeLead(l));
    const c = Array.isArray(data) ? null : (data as LeadsResponse)?.counts ?? null;

    setLeads(list);
    setCounts(c);
  }

  React.useEffect(() => {
    let dead = false;

    async function tick() {
      try {
        await loadLeads();
        if (!dead) {
          setError((prev) => {
            const p = String(prev || "");
            if (
              p.startsWith("Load failed") ||
              p.startsWith("Failed to load leads") ||
              p.includes("Failed to load leads (")
            ) {
              return "";
            }
            return p;
          });
        }
      } catch (e: any) {
        const msg = e?.message ? String(e.message) : "Load failed";
        if (!dead) setError(msg);
      }
    }

    tick();
    const t = setInterval(tick, 2000);

    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;

    try {
      setAdding(true);
      setError("");

      const r = await apiFetch(`/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });

      if (!r.ok) {
        const details = await readResponseError(r);
        const url = (r as any)?.url ? String((r as any).url) : "unknown-url";
        throw new Error(`Add lead failed (${r.status}) [${url}]: ${details}`);
      }

      const created: any = await r.json().catch(() => null);

      // Optimistic UI: insert immediately so it shows up even if the poll races.
      if (created && typeof created === "object") {
        setLeads((prev) => {
          const id = Number((created as any).id || 0);
          const filtered = id ? prev.filter((x: any) => Number((x as any).id || 0) !== id) : prev;
          return [normalizeLead(created), ...filtered.map((x: any) => normalizeLead(x))];
        });
      }

      setName("");
      setPhone("");

      // Refresh from server in background (keeps counts accurate)
      loadLeads().catch(() => {});
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Add lead failed";
      setError(msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    try {
      setImporting(true);
      setError("");
      setImportResult("");

      const fd = new FormData();
      fd.append("file", file);

      const r = await apiFetch(`/api/leads/import`, {
        method: "POST",
        body: fd,
      });

      if (!r.ok) {
        const details = await readResponseError(r);
        const url = (r as any)?.url ? String((r as any).url) : "unknown-url";
        throw new Error(`CSV import failed (${r.status}) [${url}]: ${details}`);
      }

      const data: any = await r.json().catch(() => ({}));
      setImportResult(`Imported ${data.imported ?? "?"}. Total ${data.total ?? "?"}.`);
      setFile(null);

      await loadLeads();
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "CSV import failed";
      setError(msg);
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteLead(leadId: number) {
    const yes = window.confirm("Delete this lead and all its messages?");
    if (!yes) return;
    try {
      setError("");
      const r = await apiFetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Delete failed (${r.status}): ${details}`);
      }
      setLeads((prev) => prev.filter((l) => Number(l.id) !== Number(leadId)));
      loadLeads().catch(() => {});
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Delete failed");
    }
  }

  const sortedLeads = React.useMemo(() => {
    const copy = [...leads];

    const isWaiting = (l: Lead) => l.lastMessageDirection === "in";
    const inbound = (l: Lead) => Number(l.inboundCount ?? 0);
    const isHot = (l: Lead) => inbound(l) >= 3;

    const isCold = (l: Lead) => {
      const status = normalizeStatus(l.status);
      const createdMs = toDateSafe(l.createdAt);
      const ageMs = createdMs ? Date.now() - createdMs : 0;

      return (
        (status === "new" && ageMs >= 24 * 60 * 60 * 1000) ||
        (status === "contacted" && ageMs >= 3 * 24 * 60 * 60 * 1000)
      );
    };

    copy.sort((a, b) => {
      const wa = isWaiting(a) ? 1 : 0;
      const wb = isWaiting(b) ? 1 : 0;
      if (wa !== wb) return wb - wa;

      const ha = isHot(a) ? 1 : 0;
      const hb = isHot(b) ? 1 : 0;
      if (ha !== hb) return hb - ha;

      const ca = isCold(a) ? 1 : 0;
      const cb = isCold(b) ? 1 : 0;
      if (ca !== cb) return ca - cb;

      const ta = toDateSafe(a.createdAt);
      const tb = toDateSafe(b.createdAt);
      return sort === "newest" ? tb - ta : ta - tb;
    });

    return copy;
  }, [leads, sort]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          {counts ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} className="px-2 py-1 rounded border bg-gray-50">
                  {k}: <span className="font-semibold">{v}</span>
                </span>
              ))}
            </div>
          ) : null}
          {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
        </div>

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

          <Link href="/pipeline" className="text-blue-600 underline">
            Funnel
          </Link>
          <Link href="/stats" className="text-blue-600 underline">
            Stats
          </Link>
          <Link href="/dashboard" className="text-blue-600 underline">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <form onSubmit={handleAddLead} className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="font-medium mb-2">Add lead</div>
          <div className="grid grid-cols-1 gap-2">
            <input
              className="border rounded px-3 py-2"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Phone (required)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              disabled={adding}
              className="border rounded px-3 py-2 bg-gray-50 hover:bg-gray-100"
              type="submit"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        <form onSubmit={handleImport} className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="font-medium mb-2">Import CSV</div>
          <div className="text-xs text-gray-500 mb-2">CSV columns: name, phone</div>
          <div className="grid grid-cols-1 gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              disabled={importing || !file}
              className="border rounded px-3 py-2 bg-gray-50 hover:bg-gray-100"
              type="submit"
            >
              {importing ? "Importing…" : "Import"}
            </button>
            {importResult ? <div className="text-xs text-green-700">{importResult}</div> : null}
          </div>
        </form>
      </div>

      <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">
          {sortedLeads.length} lead{sortedLeads.length === 1 ? "" : "s"}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Lead</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Age</th>
                <th className="text-left px-4 py-2">Last msg</th>
                <th className="text-right px-4 py-2">Inbound</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map((l) => {
                const st = normalizeStatus(l.status);
                const cls = STATUS_STYLE[st];

                const waiting = l.lastMessageDirection === "in";
                const hot = Number(l.inboundCount ?? 0) >= 3;

                return (
                  <tr key={l.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <Link className="text-blue-600 underline" href={`/leads/${l.id}`}>
                          {l.name || l.phone || `Lead #${l.id}`}
                        </Link>
                        <div className="text-xs text-gray-500">{l.phone}</div>
                      </div>
                    </td>

                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-2 border rounded px-2 py-1 text-xs ${cls}`}>
                        {st}
                        {waiting ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-white">waiting</span>
                        ) : null}
                        {hot ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-white">hot</span>
                        ) : null}
                      </span>
                    </td>

                    <td className="px-4 py-2">{renderSourceBadge(l.source)}</td>

                    <td className="px-4 py-2 text-gray-700">{formatCreated(l.createdAt)}</td>
                    <td className="px-4 py-2 text-gray-700">{formatAge(l.createdAt)}</td>

                    <td className="px-4 py-2 text-gray-700">
                      {l.lastMessageAt ? formatCreated(l.lastMessageAt) : "-"}
                    </td>

                    <td className="px-4 py-2 text-right">{Number(l.inboundCount ?? 0)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteLead(l.id)}
                        className="text-xs px-2 py-1 rounded border bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sortedLeads.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-sm text-gray-500" colSpan={8}>
                    No leads yet.
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
