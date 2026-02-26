"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type LeadStatus = "engaged" | "booked" | "sold" | "cold" | "dead";

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
  last_message?: string | null;
  inboundCount?: number | null;
  inbound_count?: number | null;
  inbound?: number | null;
  source?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lead_timezone?: string | null;
  hot?: number | null;
  archived?: number | null;
  archived_at?: string | null;
};

type LeadsResponse = {
  leads?: Lead[];
  counts?: Record<string, number>;
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  engaged: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  booked: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  sold: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
  cold: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  dead: "border-rose-400/40 bg-rose-500/15 text-rose-300",
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
      <span className="text-[11px] rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-cyan-300">
        Textdrip
      </span>
    );
  }
  if (s === "csv_import") {
    return (
      <span className="text-[11px] rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-emerald-300">
        CSV
      </span>
    );
  }
  if (s === "manual") {
    return (
      <span className="text-[11px] rounded border border-border/70 bg-muted/60 px-2 py-1 text-muted-foreground">
        Manual
      </span>
    );
  }

  return (
    <span className="text-[11px] rounded border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 text-indigo-300">
      {s}
    </span>
  );
}

type AiSignal = {
  tone: "green" | "yellow" | "red";
  label: string;
  className: string;
};

function getAiSignal(lead: Lead): AiSignal {
  const aiEnabled = Number(lead?.ai_enabled ?? 1) === 1;
  const aiPaused = Number(lead?.ai_paused ?? 0) === 1;
  const cooldownUntilMs = toDateSafe(String(lead?.ai_cooldown_until || ""));
  const inCooldown = cooldownUntilMs > Date.now();

  if (!aiEnabled || aiPaused) {
    return {
      tone: "red",
      label: "Stopped",
      className: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    };
  }
  if (inCooldown) {
    return {
      tone: "yellow",
      label: "Cooldown",
      className: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    tone: "green",
    label: "Active",
    className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  };
}

function normalizeLead(raw: any): Lead {
  const createdAt = raw?.createdAt ?? raw?.created_at ?? raw?.created ?? null;
  const lastMessageAt = raw?.lastMessageAt ?? raw?.last_message_at ?? null;
  const inboundCount = raw?.inboundCount ?? raw?.inbound_count ?? raw?.inbound ?? 0;

  return {
    ...raw,
    ai_enabled: Number(raw?.ai_enabled ?? 1),
    ai_paused: Number(raw?.ai_paused ?? 0),
    ai_cooldown_until: raw?.ai_cooldown_until ?? null,
    createdAt,
    lastMessageAt,
    inboundCount: Number(inboundCount ?? 0),
    source: String(raw?.source || "manual"),
    city: String(raw?.city || "").trim(),
    state: String(raw?.state || "").trim(),
    zip: String(raw?.zip || "").trim(),
    lead_timezone: String(raw?.lead_timezone || "").trim(),
    hot: Number(raw?.hot ?? 0),
    archived: Number(raw?.archived ?? 0),
    archived_at: raw?.archived_at ?? null,
  };
}

type SortKey = "newest" | "oldest";
type LeadView = "active" | "archived" | "all";

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
  const [view, setView] = React.useState<LeadView>("active");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [file, setFile] = React.useState<File | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string>("");

  async function loadLeads() {
    const includeArchived = view !== "active";
    const suffix = includeArchived ? "?include_archived=1" : "";
    const r = await apiFetch(`/api/leads${suffix}`, { cache: "no-store" });
    if (!r.ok) {
      const details = await readResponseError(r);
      const url = (r as any)?.url ? String((r as any).url) : "unknown-url";
      throw new Error(`Failed to load leads (${r.status}) [${url}]: ${details}`);
    }

    const data: any = await r.json();
    const listRaw: Lead[] = Array.isArray(data) ? data : (data as LeadsResponse)?.leads ?? [];
    const list = listRaw.map((l: any) => normalizeLead(l));
    const c = Array.isArray(data) ? null : (data as LeadsResponse)?.counts ?? null;

    const filtered = list.filter((l) => {
      const a = Number((l as any).archived ?? 0) === 1;
      if (view === "active") return !a;
      if (view === "archived") return a;
      return true;
    });
    setLeads(filtered);
    setCounts(c);
  }

  React.useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      let ok = false;
      try {
        await loadLeads();
        ok = true;
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
  }, [view]);

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

  async function handleArchiveLead(leadId: number, archived: boolean) {
    try {
      setError("");
      const r = await apiFetch(`/api/leads/${leadId}/archive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Archive update failed (${r.status}): ${details}`);
      }
      await loadLeads();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Archive update failed");
    }
  }

  const sortedLeads = React.useMemo(() => {
    const copy = [...leads];

    const isWaiting = (l: Lead) => l.lastMessageDirection === "in";
    const inbound = (l: Lead) => Number(l.inboundCount ?? 0);
    const isHot = (l: Lead) => Number(l.hot ?? 0) === 1;

    const isCold = (l: Lead) => {
      const status = normalizeStatus(l.status);
      const createdMs = toDateSafe(l.createdAt);
      const ageMs = createdMs ? Date.now() - createdMs : 0;

      return (
        (status === "engaged" && ageMs >= 3 * 24 * 60 * 60 * 1000)
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
    <div className="mx-auto max-w-6xl rounded-2xl border border-border/70 bg-card/40 p-4 shadow-xl backdrop-blur-sm md:p-5">
      <div className="mb-3 flex flex-col md:flex-row md:items-start md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
          {counts ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5">
                  {k}: <span className="font-semibold">{v}</span>
                </span>
              ))}
            </div>
          ) : null}
          {error ? <div className="mt-2 text-sm text-rose-400">{error}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted-foreground">Sort</div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as LeadView)}
            className="rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground"
            title="Lead view"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All records</option>
          </select>

          <Link href="/pipeline" className="text-sm text-cyan-400 underline decoration-cyan-500/40">
            Funnel
          </Link>
          <Link href="/stats" className="text-sm text-cyan-400 underline decoration-cyan-500/40">
            Stats
          </Link>
          <Link href="/dashboard" className="text-sm text-cyan-400 underline decoration-cyan-500/40">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <form onSubmit={handleAddLead} className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
          <div className="mb-1.5 text-sm font-medium text-foreground">Add lead</div>
          <div className="grid grid-cols-1 gap-1.5">
            <input
              className="rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="Phone (required)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              disabled={adding}
              className="rounded border border-border bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-accent"
              type="submit"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        <form onSubmit={handleImport} className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
          <div className="mb-1.5 text-sm font-medium text-foreground">Import CSV</div>
          <div className="mb-1.5 text-xs text-muted-foreground">CSV columns: name, phone</div>
          <div className="grid grid-cols-1 gap-1.5">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-muted-foreground"
            />
            <button
              disabled={importing || !file}
              className="rounded border border-border bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-accent"
              type="submit"
            >
              {importing ? "Importing…" : "Import"}
            </button>
            {importResult ? <div className="text-xs text-emerald-300">{importResult}</div> : null}
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-sm">
        <div className="border-b border-border/70 px-3 py-2 text-sm font-medium text-foreground">
          {sortedLeads.length} lead{sortedLeads.length === 1 ? "" : "s"}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-1.5">Lead</th>
                <th className="text-left px-3 py-1.5">Status</th>
                <th className="text-left px-3 py-1.5">AI</th>
                <th className="text-left px-3 py-1.5">Source</th>
                <th className="text-left px-3 py-1.5">TZ</th>
                <th className="text-left px-3 py-1.5">Created</th>
                <th className="text-left px-3 py-1.5">Age</th>
                <th className="text-left px-3 py-1.5">Last msg</th>
                <th className="text-right px-3 py-1.5">Inbound</th>
                <th className="text-right px-3 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map((l) => {
                const st = normalizeStatus(l.status);
                const cls = STATUS_STYLE[st];
                const aiSignal = getAiSignal(l);

                const waiting = l.lastMessageDirection === "in";
                const hot = Number(l.inboundCount ?? 0) >= 3;

                return (
                  <tr key={l.id} className="border-t border-border/70 hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col">
                        <Link className="leading-tight text-cyan-400 underline decoration-cyan-500/40" href={`/leads/${l.id}`}>
                          {l.name || l.phone || `Lead #${l.id}`}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{l.phone}</div>
                      </div>
                    </td>

                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center gap-1.5 border rounded px-1.5 py-0.5 text-[11px] ${cls}`}>
                        {st}
                        {waiting ? (
                          <span className="rounded border border-amber-400/40 bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-200">waiting</span>
                        ) : null}
                        {hot ? (
                          <span className="rounded border border-rose-400/40 bg-rose-500/15 px-1 py-0.5 text-[10px] text-rose-200">hot</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px] ${aiSignal.className}`}>
                        <span aria-hidden="true">
                          {aiSignal.tone === "green" ? "🟢" : aiSignal.tone === "yellow" ? "🟡" : "🔴"}
                        </span>
                        {aiSignal.label}
                      </span>
                    </td>

                    <td className="px-3 py-1.5">{renderSourceBadge(l.source)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {String(l.lead_timezone || "").trim() || "-"}
                    </td>

                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{formatCreated(l.createdAt)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{formatAge(l.createdAt)}</td>

                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {l.lastMessageAt ? formatCreated(l.lastMessageAt) : "-"}
                    </td>

                    <td className="px-3 py-1.5 text-right">{Number(l.inboundCount ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleArchiveLead(l.id, Number(l.archived ?? 0) !== 1)}
                          className="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                        >
                          {Number(l.archived ?? 0) === 1 ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(l.id)}
                          className="rounded border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/25"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sortedLeads.length === 0 ? (
                <tr className="border-t">
                  <td className="px-3 py-5 text-sm text-muted-foreground" colSpan={10}>
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
