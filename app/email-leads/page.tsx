"use client";

import * as React from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

type Lead = {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lead_timezone?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  created?: string | null;
  last_message?: string | null;
  lastMessageAt?: string | null;
  last_message_at?: string | null;
  inboundCount?: number | null;
  inbound_count?: number | null;
  ai_paused?: number | null;
  ai_pause_reason?: string | null;
  lead_snapshot_json?: string | null;
};

type GmailLeadImportStatus = {
  access_granted?: boolean;
  configured?: boolean;
  connected?: boolean;
  account_email?: string;
  enabled?: boolean;
  query?: string;
  source_hints?: { from?: string[]; subject?: string[] };
  auto_text_enabled?: boolean;
  auto_text_template_set?: boolean;
  worker_enabled?: boolean;
  worker_interval_ms?: number;
  worker_per_user_limit?: number;
  warning?: string;
  detail?: string;
  recent_imports_24h?: number;
  checked_at?: string;
};

type SettingsForm = {
  gmail_lead_import_enabled: boolean;
  gmail_lead_import_query: string;
  gmail_lead_import_auto_text_enabled: boolean;
  gmail_lead_import_auto_text_template: string;
};

type ImportSample = {
  status?: string;
  reason?: string;
};

type ImportResultSummary = {
  scanned: number;
  imported: number;
  ignored: number;
  deduped: number;
  reasonCounts: Array<{ reason: string; count: number }>;
};

type QueryBuilderState = {
  lookbackDays: string;
  senderHintsText: string;
  subjectHintsText: string;
  advancedMode: boolean;
};

const QUOTE_WIZARD_DEFAULT_SENDERS = [
  "quotewizard@leads.qwagents.com",
  "leads.qwagents.com",
  "nextgen",
  "mastodon",
  "ushamarketplace",
  "usha",
];

const QUOTE_WIZARD_DEFAULT_SUBJECTS = [
  "qw health lead",
  "health lead",
  "custom lead type name",
  "nextgen",
  "mastodon",
  "usha marketplace",
];

const DEFAULT_FORM: SettingsForm = {
  gmail_lead_import_enabled: false,
  gmail_lead_import_query: "in:inbox newer_than:14d",
  gmail_lead_import_auto_text_enabled: false,
  gmail_lead_import_auto_text_template: "",
};

const DEFAULT_QUERY_BUILDER: QueryBuilderState = {
  lookbackDays: "14",
  senderHintsText: QUOTE_WIZARD_DEFAULT_SENDERS.join("\n"),
  subjectHintsText: QUOTE_WIZARD_DEFAULT_SUBJECTS.join("\n"),
  advancedMode: false,
};

function normalizeTokenListFromText(input: string): string[] {
  return Array.from(
    new Set(
      String(input || "")
        .split(/[\n,;]+/)
        .map((x) => String(x || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function quoteQueryToken(input: string) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^[a-z0-9._@+-]+$/i.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildGmailQueryFromBuilder(builder: QueryBuilderState): string {
  const lookback = Math.max(1, Math.min(90, Number(builder.lookbackDays || 14) || 14));
  const senders = normalizeTokenListFromText(builder.senderHintsText);
  const subjects = normalizeTokenListFromText(builder.subjectHintsText);
  const parts: string[] = [`in:inbox`, `newer_than:${lookback}d`];
  if (senders.length) {
    parts.push(`(${senders.map((s) => `from:${quoteQueryToken(s)}`).join(" OR ")})`);
  }
  if (subjects.length) {
    parts.push(`(${subjects.map((s) => `subject:${quoteQueryToken(s)}`).join(" OR ")})`);
  }
  return parts.join(" ").trim();
}

function parseGmailQueryToBuilder(query: string): QueryBuilderState {
  const q = String(query || "").trim();
  const lookbackMatch = q.match(/\bnewer_than\s*:\s*(\d+)d\b/i);
  const lookbackDays = lookbackMatch?.[1] || "14";

  const fromTokens: string[] = [];
  const subjectTokens: string[] = [];

  const fromRe = /\bfrom:\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))/gi;
  const subjectRe = /\bsubject:\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))/gi;
  let m: RegExpExecArray | null = null;
  while ((m = fromRe.exec(q)) !== null) {
    const token = String(m[1] || m[2] || m[3] || "").trim().toLowerCase();
    if (token) fromTokens.push(token);
  }
  while ((m = subjectRe.exec(q)) !== null) {
    const token = String(m[1] || m[2] || m[3] || "").trim().toLowerCase();
    if (token) subjectTokens.push(token);
  }

  const senderList = Array.from(new Set(fromTokens.length ? fromTokens : QUOTE_WIZARD_DEFAULT_SENDERS));
  const subjectList = Array.from(new Set(subjectTokens.length ? subjectTokens : QUOTE_WIZARD_DEFAULT_SUBJECTS));

  return {
    lookbackDays,
    senderHintsText: senderList.join("\n"),
    subjectHintsText: subjectList.join("\n"),
    advancedMode: false,
  };
}

function toDateSafe(v?: string | null): number {
  if (!v) return 0;
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatDateTime(v?: string | null) {
  if (!v) return "-";
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatPreview(v?: string | null, max = 72) {
  const s = String(v || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}

function formatConversationPreview(v?: string | null) {
  const s = String(v || "").replace(/\s+/g, " ").trim();
  if (!s) return "-";
  if (s.length <= 140) return s;
  return `${s.slice(0, 140)}...`;
}

function parseSnapshot(raw?: string | null) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

type ProviderBadge = {
  label: string;
  className: string;
};

function normalizeProviderToken(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function classifyProviderBadge({
  source,
  fromEmail,
  subject,
}: {
  source?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
}): ProviderBadge {
  const src = normalizeProviderToken(source);
  const from = normalizeProviderToken(fromEmail);
  const subj = normalizeProviderToken(subject);

  if (src === "quotewizard") {
    return {
      label: "QUOTE WIZARD",
      className: "border-sky-400/40 bg-sky-500/15 text-sky-300",
    };
  }
  if (src === "nextgen") {
    return {
      label: "NEXTGEN",
      className: "border-blue-400/40 bg-blue-500/15 text-blue-300",
    };
  }
  if (src === "mastodon") {
    return {
      label: "MASTODON",
      className: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
    };
  }
  if (src === "ushamarketplace") {
    return {
      label: "USHAMARKETPLACE",
      className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (src === "usha") {
    return {
      label: "USHA",
      className: "border-teal-400/40 bg-teal-500/15 text-teal-300",
    };
  }

  if (src === "manual") {
    return {
      label: "MANUAL",
      className: "border-border/70 bg-muted/60 text-muted-foreground",
    };
  }
  if (src === "csv_import") {
    return {
      label: "CSV IMPORT",
      className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (src === "textdrip" || src === "inbound_webhook") {
    return {
      label: "TEXTDRIP",
      className: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
    };
  }

  if (
    from.includes("quotewizard") ||
    from.includes("qwagents.com") ||
    subj.includes("qw health lead")
  ) {
    return {
      label: "QUOTE WIZARD",
      className: "border-sky-400/40 bg-sky-500/15 text-sky-300",
    };
  }
  if (from.includes("nextgen") || subj.includes("nextgen") || subj.includes("next gen")) {
    return {
      label: "NEXTGEN",
      className: "border-blue-400/40 bg-blue-500/15 text-blue-300",
    };
  }
  if (from.includes("mastodon") || subj.includes("mastodon")) {
    return {
      label: "MASTODON",
      className: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
    };
  }
  if (from.includes("ushamarketplace") || subj.includes("usha marketplace")) {
    return {
      label: "USHAMARKETPLACE",
      className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (from.includes("usha") || subj.includes("usha")) {
    return {
      label: "USHA",
      className: "border-teal-400/40 bg-teal-500/15 text-teal-300",
    };
  }
  if (from.includes("lendingtree")) {
    return {
      label: "LENDINGTREE",
      className: "border-violet-400/40 bg-violet-500/15 text-violet-300",
    };
  }
  if (src === "gmail") {
    return {
      label: "EMAIL LEAD",
      className: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
    };
  }

  if (src) {
    return {
      label: src.replace(/[_-]+/g, " ").toUpperCase(),
      className: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
    };
  }
  return {
    label: "UNKNOWN",
    className: "border-border/70 bg-muted/60 text-muted-foreground",
  };
}

function normalizeLead(raw: any): Lead {
  return {
    ...raw,
    source: String(raw?.source || "manual"),
    createdAt: raw?.createdAt ?? raw?.created_at ?? raw?.created ?? null,
    lastMessageAt: raw?.lastMessageAt ?? raw?.last_message_at ?? null,
    inboundCount: Number(raw?.inboundCount ?? raw?.inbound_count ?? raw?.inbound ?? 0),
    lead_snapshot_json: String(raw?.lead_snapshot_json || ""),
  };
}

async function readResponseError(r: Response): Promise<string> {
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const text = await r.text().catch(() => "");
  if (ct.includes("text/html") || text.trim().startsWith("<!DOCTYPE html")) {
    return "Server returned HTML (wrong route / proxy / auth).";
  }
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(text || "{}");
      return String(j?.error || j?.message || j?.detail || text || "Request failed");
    } catch {
      return text || "Request failed";
    }
  }
  return text || "Request failed";
}

export default function EmailLeadsPage() {
  const [accessChecked, setAccessChecked] = React.useState(false);
  const [hasAccess, setHasAccess] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const [runningImport, setRunningImport] = React.useState(false);
  const [loadingLeads, setLoadingLeads] = React.useState(false);

  const [form, setForm] = React.useState<SettingsForm>(DEFAULT_FORM);
  const [queryBuilder, setQueryBuilder] = React.useState<QueryBuilderState>(DEFAULT_QUERY_BUILDER);
  const [status, setStatus] = React.useState<GmailLeadImportStatus | null>(null);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [importSummary, setImportSummary] = React.useState<ImportResultSummary | null>(null);
  const [testTo, setTestTo] = React.useState("");
  const [testMessage, setTestMessage] = React.useState("");
  const [sendingTest, setSendingTest] = React.useState(false);
  const [purging, setPurging] = React.useState(false);

  const load = React.useCallback(async () => {
    setError("");
    setSuccess("");
    try {
      const meResp = await apiFetch("/api/me", { cache: "no-store" });
      if (!meResp.ok) {
        const detail = await readResponseError(meResp);
        throw new Error(`Authentication check failed: ${detail}`);
      }
      const meBody = await meResp.json().catch(() => ({}));
      const role = String(meBody?.user?.role || "").toLowerCase();
      const granted = role === "admin" || meBody?.user?.email_lead_import_access === true;
      setHasAccess(granted);
      setAccessChecked(true);
      if (!granted) return;

      const [settingsResp, statusResp] = await Promise.all([
        apiFetch("/api/settings", { cache: "no-store" }),
        apiFetch("/api/integrations/gmail-leads/status", { cache: "no-store" }),
      ]);
      if (settingsResp.ok) {
        const settingsBody = await settingsResp.json().catch(() => ({}));
        const s = settingsBody?.settings || {};
        setForm({
          gmail_lead_import_enabled: !!s?.gmail_lead_import_enabled,
          gmail_lead_import_query: String(s?.gmail_lead_import_query || "in:inbox newer_than:14d"),
          gmail_lead_import_auto_text_enabled: !!s?.gmail_lead_import_auto_text_enabled,
          gmail_lead_import_auto_text_template: String(s?.gmail_lead_import_auto_text_template || ""),
        });
        setTestMessage((prev) =>
          String(prev || "").trim()
            ? prev
            : String(s?.gmail_lead_import_auto_text_template || "")
        );
        setQueryBuilder(parseGmailQueryToBuilder(String(s?.gmail_lead_import_query || "in:inbox newer_than:14d")));
      }
      if (statusResp.ok) {
        const statusBody = await statusResp.json().catch(() => ({}));
        setStatus((statusBody?.status || null) as GmailLeadImportStatus | null);
      }
    } catch (e: any) {
      setError(String(e?.message || "Load failed"));
    }
  }, []);

  const loadEmailLeads = React.useCallback(async () => {
    if (!hasAccess) return;
    setLoadingLeads(true);
    try {
      const r = await apiFetch("/api/leads?include_archived=0", { cache: "no-store" });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Failed to load leads (${r.status}): ${details}`);
      }
      const body = await r.json().catch(() => ({}));
      const listRaw = Array.isArray(body) ? body : body?.leads || [];
      const list = listRaw
        .map((x: any) => normalizeLead(x))
        .filter((x: Lead) => String(x.source || "").toLowerCase() === "gmail")
        .sort((a: Lead, b: Lead) => toDateSafe(b.createdAt) - toDateSafe(a.createdAt));
      setLeads(list);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load email leads"));
    } finally {
      setLoadingLeads(false);
    }
  }, [hasAccess]);

  React.useEffect(() => {
    load().catch(() => {});
  }, [load]);

  React.useEffect(() => {
    if (!hasAccess) return;
    loadEmailLeads().catch(() => {});
    const t = window.setInterval(() => loadEmailLeads().catch(() => {}), 12000);
    return () => window.clearInterval(t);
  }, [hasAccess, loadEmailLeads]);

  async function saveSettings() {
    if (!hasAccess) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const r = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmail_lead_import_enabled: !!form.gmail_lead_import_enabled,
          gmail_lead_import_query: String(form.gmail_lead_import_query || "").trim(),
          gmail_lead_import_auto_text_enabled: !!form.gmail_lead_import_auto_text_enabled,
          gmail_lead_import_auto_text_template: String(form.gmail_lead_import_auto_text_template || "").trim(),
        }),
      });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Save failed (${r.status}): ${details}`);
      }
      setSuccess("Email lead import settings saved.");
      await load().catch(() => {});
    } catch (e: any) {
      setError(String(e?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function checkStatus() {
    if (!hasAccess) return;
    setCheckingStatus(true);
    setError("");
    try {
      const r = await apiFetch("/api/integrations/gmail-leads/status", { cache: "no-store" });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Status check failed (${r.status}): ${details}`);
      }
      const body = await r.json().catch(() => ({}));
      setStatus((body?.status || null) as GmailLeadImportStatus | null);
    } catch (e: any) {
      setError(String(e?.message || "Status check failed"));
    } finally {
      setCheckingStatus(false);
    }
  }

  async function runImportNow() {
    if (!hasAccess) return;
    setRunningImport(true);
    setError("");
    setSuccess("");
    setImportSummary(null);
    try {
      const r = await apiFetch("/api/integrations/gmail-leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 0, dry_run: false }),
      });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Import failed (${r.status}): ${details}`);
      }
      const body = await r.json().catch(() => ({}));
      const result = body?.result || {};
      const samples = Array.isArray(result?.samples) ? (result.samples as ImportSample[]) : [];
      const ignoredReasonMap = new Map<string, number>();
      for (const sample of samples) {
        const status = String(sample?.status || "").trim().toLowerCase();
        if (status !== "ignored") continue;
        const reason = String(sample?.reason || "unknown").trim().toLowerCase() || "unknown";
        ignoredReasonMap.set(reason, (ignoredReasonMap.get(reason) || 0) + 1);
      }
      const reasonCounts = Array.from(ignoredReasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
      setImportSummary({
        scanned: Number(result?.scanned || 0),
        imported: Number(result?.imported || 0),
        ignored: Number(result?.skipped_nonlead || 0),
        deduped: Number(result?.deduped || 0),
        reasonCounts,
      });
      setSuccess(
        `Import complete. Scanned ${Number(result?.scanned || 0)}, imported ${Number(result?.imported || 0)}, ignored ${Number(result?.skipped_nonlead || 0)}, deduped ${Number(result?.deduped || 0)}${result?.truncated ? " (scan capped by server hard max)." : ""}.`
      );
      await Promise.all([checkStatus(), loadEmailLeads()]);
    } catch (e: any) {
      setError(String(e?.message || "Import failed"));
    } finally {
      setRunningImport(false);
    }
  }

  async function sendTestTextNow() {
    if (!hasAccess) return;
    setSendingTest(true);
    setError("");
    setSuccess("");
    try {
      const to = String(testTo || "").trim();
      const message = String(testMessage || "").trim();
      if (!to) throw new Error("Test phone is required.");
      if (!message) throw new Error("Test message is required.");
      const r = await apiFetch("/api/integrations/gmail-leads/test-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message }),
      });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Test send failed (${r.status}): ${details}`);
      }
      const body = await r.json().catch(() => ({}));
      setSuccess(
        `Test text queued to ${to}. Lead #${Number(body?.lead_id || 0)}.`
      );
      await loadEmailLeads();
    } catch (e: any) {
      setError(String(e?.message || "Test send failed"));
    } finally {
      setSendingTest(false);
    }
  }

  async function purgeImportedLeads() {
    if (!hasAccess) return;
    if (!window.confirm("Delete all imported email leads for this account? This cannot be undone.")) return;
    setPurging(true);
    setError("");
    setSuccess("");
    try {
      const r = await apiFetch("/api/integrations/gmail-leads/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false }),
      });
      if (!r.ok) {
        const details = await readResponseError(r);
        throw new Error(`Purge failed (${r.status}): ${details}`);
      }
      const body = await r.json().catch(() => ({}));
      setSuccess(
        `Purged ${Number(body?.deleted_count || 0)} imported email lead${Number(body?.deleted_count || 0) === 1 ? "" : "s"}.`
      );
      await Promise.all([checkStatus(), loadEmailLeads()]);
    } catch (e: any) {
      setError(String(e?.message || "Purge failed"));
    } finally {
      setPurging(false);
    }
  }

  if (!accessChecked) {
    return (
      <div className="mx-auto w-full max-w-[1680px] rounded-2xl border border-border/70 bg-card/40 p-5 shadow-xl backdrop-blur-sm">
        <div className="text-sm text-muted-foreground">Loading Email Leads...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="mx-auto w-full max-w-[1680px] rounded-2xl border border-border/70 bg-card/40 p-5 shadow-xl backdrop-blur-sm">
        <h1 className="text-2xl font-semibold text-foreground">Email Leads</h1>
        <div className="mt-2 rounded border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Email Leads is not enabled for this account. Ask an admin to enable Email Lead Import access.
        </div>
      </div>
    );
  }

  const humanAlertCount = leads.reduce(
    (count, lead) => count + (Number(lead?.ai_paused || 0) === 1 ? 1 : 0),
    0
  );

  return (
    <div className="mx-auto w-full max-w-[1680px] rounded-2xl border border-border/70 bg-card/40 p-4 shadow-xl backdrop-blur-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Email Leads</h1>
          {humanAlertCount > 0 ? (
            <div className="mt-1 inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
              {humanAlertCount > 99 ? "99+" : humanAlertCount} need human attention
            </div>
          ) : null}
          <div className="mt-1 text-xs text-muted-foreground">
            Gmail inbox import for structured lead-source emails.
          </div>
          <div className="mt-1 text-[11px] text-cyan-200/90">
            Full import scans all matching messages (first run may take a while). Ongoing auto-scan uses smaller batches.
          </div>
          {error ? <div className="mt-2 text-sm text-rose-400">{error}</div> : null}
          {success ? <div className="mt-2 text-sm text-emerald-300">{success}</div> : null}
          {importSummary && importSummary.ignored > 0 ? (
            <div className="mt-2 rounded border border-amber-400/35 bg-amber-500/10 p-2 text-xs text-amber-200">
              <div className="font-medium">Ignored reason breakdown</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {(importSummary.reasonCounts.length ? importSummary.reasonCounts : [{ reason: "unknown", count: importSummary.ignored }]).map((row) => (
                  <span
                    key={`${row.reason}-${row.count}`}
                    className="rounded border border-amber-300/35 bg-amber-500/10 px-2 py-0.5"
                  >
                    {row.reason}: {row.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => checkStatus().catch(() => {})}
            disabled={checkingStatus}
            className="rounded border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted/40 disabled:opacity-60"
          >
            {checkingStatus ? "Checking..." : "Check Status"}
          </button>
          <button
            type="button"
            onClick={() => runImportNow().catch(() => {})}
            disabled={runningImport || !form.gmail_lead_import_enabled}
            className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            {runningImport ? "Importing..." : "Run Full Import"}
          </button>
          <button
            type="button"
            onClick={() => purgeImportedLeads().catch(() => {})}
            disabled={purging}
            className="rounded border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-60"
          >
            {purging ? "Purging..." : "Purge Imported"}
          </button>
          <button
            type="button"
            onClick={() => saveSettings().catch(() => {})}
            disabled={saving}
            className="rounded border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
          <div className="mb-2 text-sm font-medium text-foreground">Import Controls</div>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between rounded border border-border/70 bg-muted/40 p-2">
              <div>
                <div className="text-sm text-foreground">Enable Gmail Lead Import</div>
                <div className="text-xs text-muted-foreground">Allow worker/manual import to create email leads.</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, gmail_lead_import_enabled: !prev.gmail_lead_import_enabled }))
                }
                className={`rounded px-3 py-1.5 text-xs ${
                  form.gmail_lead_import_enabled
                    ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                    : "border border-rose-400/40 bg-rose-500/15 text-rose-200"
                }`}
              >
                {form.gmail_lead_import_enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <div className="flex items-center justify-between rounded border border-border/70 bg-muted/40 p-2">
              <div>
                <div className="text-sm text-foreground">Auto-Text on Import</div>
                <div className="text-xs text-muted-foreground">Send one outbound text when an email lead is imported.</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    gmail_lead_import_auto_text_enabled: !prev.gmail_lead_import_auto_text_enabled,
                  }))
                }
                className={`rounded px-3 py-1.5 text-xs ${
                  form.gmail_lead_import_auto_text_enabled
                    ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                    : "border border-rose-400/40 bg-rose-500/15 text-rose-200"
                }`}
              >
                {form.gmail_lead_import_auto_text_enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Lead Source Match Rules</span>
              <div className="rounded border border-border/70 bg-muted/30 p-2">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded border border-cyan-400/25 bg-cyan-500/10 p-2 text-[11px] text-cyan-100">
                    Defaults are preloaded for QuoteWizard, NextGen, Mastodon, USHAMarketplace, and USHA patterns. Update these only if your lead source uses different sender addresses or subject wording.
                  </div>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Look back this many days</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={queryBuilder.lookbackDays}
                      onChange={(e) => {
                        const next = { ...queryBuilder, lookbackDays: e.target.value };
                        setQueryBuilder(next);
                        if (!next.advancedMode) {
                          setForm((prev) => ({ ...prev, gmail_lead_import_query: buildGmailQueryFromBuilder(next) }));
                        }
                      }}
                      className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        ...queryBuilder,
                        senderHintsText: QUOTE_WIZARD_DEFAULT_SENDERS.join("\n"),
                        subjectHintsText: QUOTE_WIZARD_DEFAULT_SUBJECTS.join("\n"),
                      };
                      setQueryBuilder(next);
                      if (!next.advancedMode) {
                        setForm((prev) => ({ ...prev, gmail_lead_import_query: buildGmailQueryFromBuilder(next) }));
                      }
                    }}
                    className="w-fit rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Use QuoteWizard Defaults
                  </button>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">
                      Lead sender email/domain list (one per line)
                    </span>
                    <textarea
                      rows={3}
                      value={queryBuilder.senderHintsText}
                      onChange={(e) => {
                        const next = { ...queryBuilder, senderHintsText: e.target.value };
                        setQueryBuilder(next);
                        if (!next.advancedMode) {
                          setForm((prev) => ({ ...prev, gmail_lead_import_query: buildGmailQueryFromBuilder(next) }));
                        }
                      }}
                      className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                      placeholder={"example:\nquotewizard@leads.qwagents.com\nnextgen\nushamarketplace"}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Subject keywords (one per line)</span>
                    <textarea
                      rows={3}
                      value={queryBuilder.subjectHintsText}
                      onChange={(e) => {
                        const next = { ...queryBuilder, subjectHintsText: e.target.value };
                        setQueryBuilder(next);
                        if (!next.advancedMode) {
                          setForm((prev) => ({ ...prev, gmail_lead_import_query: buildGmailQueryFromBuilder(next) }));
                        }
                      }}
                      className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                      placeholder={"example:\nQW HEALTH Lead\nNEXTGEN\nUSHA Marketplace"}
                    />
                  </label>
                  <div className="rounded border border-border/70 bg-card/70 p-2 text-[11px] text-muted-foreground">
                    Auto-generated filter:
                    <div className="mt-1 break-all text-cyan-200">
                      {buildGmailQueryFromBuilder(queryBuilder)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setQueryBuilder((prev) => {
                        const next = { ...prev, advancedMode: !prev.advancedMode };
                        if (!next.advancedMode) {
                          setForm((f) => ({ ...f, gmail_lead_import_query: buildGmailQueryFromBuilder(next) }));
                        }
                        return next;
                      })
                    }
                    className="w-fit rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                  >
                    {queryBuilder.advancedMode ? "Hide Advanced Query" : "Show Advanced Query"}
                  </button>
                  {queryBuilder.advancedMode ? (
                    <label className="text-xs">
                      <span className="mb-1 block text-muted-foreground">Advanced Query (optional)</span>
                      <input
                        type="text"
                        value={form.gmail_lead_import_query}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, gmail_lead_import_query: e.target.value }))
                        }
                        className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                        placeholder='in:inbox newer_than:14d (from:leadsource.com)'
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Auto-Text Template</span>
              <textarea
                rows={3}
                value={form.gmail_lead_import_auto_text_template}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, gmail_lead_import_auto_text_template: e.target.value }))
                }
                className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                placeholder="Hi, following up on your request. Can I send you a quote?"
              />
            </label>
            <div className="rounded border border-border/70 bg-muted/35 p-2">
              <div className="mb-1 text-sm text-foreground">Send Test Text</div>
              <div className="mb-2 text-[11px] text-muted-foreground">
                Sends via the same outbound Textdrip path used by lead messaging and auto-text.
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                  placeholder="+15551234567"
                />
                <button
                  type="button"
                  onClick={() => sendTestTextNow().catch(() => {})}
                  disabled={sendingTest}
                  className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-60"
                >
                  {sendingTest ? "Sending..." : "Send Test Text"}
                </button>
              </div>
              <textarea
                rows={2}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                placeholder="Test message"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
          <div className="mb-2 text-sm font-medium text-foreground">Connection Status</div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Access: {status?.access_granted === false ? "Not granted" : "Granted"}</div>
            <div>Gmail: {status?.connected ? "Connected" : "Not connected"}</div>
            <div>Mailbox: {status?.account_email ? status.account_email : "-"}</div>
            <div>Configured: {status?.configured ? "Yes" : "No"}</div>
            <div>Import enabled: {status?.enabled ? "Yes" : "No"}</div>
            <div>Auto-scan worker: {status?.worker_enabled ? "On" : "Off"}</div>
            <div>
              Auto-scan interval: {Number(status?.worker_interval_ms || 0) > 0 ? `${Math.round(Number(status?.worker_interval_ms || 0) / 1000)}s` : "-"}
            </div>
            <div>Auto-scan batch cap: {Number(status?.worker_per_user_limit || 0) || "-"}</div>
            <div>Auto-text template: {status?.auto_text_template_set ? "Set" : "Not set"}</div>
            <div>Imports (24h): {Number(status?.recent_imports_24h || 0)}</div>
            {status?.source_hints?.from?.length ? (
              <div className="break-all">Sender hints: {status.source_hints.from.join(", ")}</div>
            ) : null}
            {status?.source_hints?.subject?.length ? (
              <div className="break-all">Subject hints: {status.source_hints.subject.join(", ")}</div>
            ) : null}
            {status?.warning ? <div className="text-amber-300">Warning: {status.warning}</div> : null}
            {status?.detail ? <div className="break-all text-rose-300">{status.detail}</div> : null}
            {status?.checked_at ? <div>Last check: {formatDateTime(String(status.checked_at))}</div> : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card/70 shadow-sm">
        <div className="border-b border-border/70 px-3 py-2 text-sm font-medium text-foreground">
          {loadingLeads ? "Loading..." : `${leads.length} email lead${leads.length === 1 ? "" : "s"}`}
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-[1480px] w-full text-xs md:text-sm">
            <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Lead</th>
                <th className="px-3 py-1.5 text-left">Email</th>
                <th className="px-3 py-1.5 text-left">Source</th>
                <th className="px-3 py-1.5 text-left">Subject</th>
                <th className="px-3 py-1.5 text-left">Conversation Preview</th>
                <th className="px-3 py-1.5 text-left">Created</th>
                <th className="px-3 py-1.5 text-left">Last Msg</th>
                <th className="px-3 py-1.5 text-right">Inbound</th>
                <th className="px-3 py-1.5 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const snap = parseSnapshot(lead.lead_snapshot_json);
                const fromEmail = String(snap?.gmail?.from_email || "");
                const subject = String(snap?.gmail?.subject || "");
                const provider = classifyProviderBadge({
                  source: lead.source,
                  fromEmail,
                  subject,
                });
                const needsHuman = Number(lead.ai_paused || 0) === 1;
                const location = [lead.city, lead.state, lead.zip].filter(Boolean).join(", ");
                return (
                  <tr key={lead.id} className="border-t border-border/70 hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          {needsHuman ? (
                            <span
                              title="Needs human intervention"
                              className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]"
                            />
                          ) : null}
                          <Link href={`/leads/${lead.id}`} className="text-cyan-400 underline decoration-cyan-500/40">
                            {lead.name || lead.phone || `Lead #${lead.id}`}
                          </Link>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{lead.phone || "-"}</div>
                        {needsHuman ? (
                          <div className="text-[11px] text-rose-300">
                            Human attention: {String(lead.ai_pause_reason || "ai_paused")}
                          </div>
                        ) : null}
                        {location ? <div className="text-[11px] text-muted-foreground">{location}</div> : null}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{lead.email || "-"}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit items-center rounded border px-2 py-1 text-[11px] font-medium ${provider.className}`}>
                          {provider.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatPreview(fromEmail, 42) || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatPreview(subject, 48) || "-"}</td>
                    <td className="max-w-[420px] px-3 py-1.5 text-foreground">
                      {formatConversationPreview(lead.last_message)}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(lead.createdAt || lead.created_at || lead.created)}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {lead.lastMessageAt ? formatDateTime(lead.lastMessageAt) : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right">{Number(lead.inboundCount || lead.inbound_count || 0)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!loadingLeads && leads.length === 0 ? (
                <tr className="border-t border-border/70">
                  <td colSpan={9} className="px-3 py-5 text-sm text-muted-foreground">
                    No Gmail-imported leads yet.
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
