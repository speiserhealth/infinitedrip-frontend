"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type UserRow = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  createdAt?: string;
  approval_status?: "pending" | "approved" | "suspended" | "rejected" | string;
  approved_at?: string | null;
  billing_status?: "trial" | "active" | "past_due" | "canceled" | "none" | string;
  trial_ends_at?: string | null;
};

type AdminStatus = {
  email_configured?: boolean;
  email_from?: string;
  google_oauth_configured?: boolean;
  pending_users?: number;
  user_counts?: {
    pending?: number;
    approved?: number;
    suspended?: number;
    rejected?: number;
  };
  setup_checks?: Array<{
    key: string;
    label: string;
    status: "green" | "yellow" | "red" | string;
    detail?: string;
  }>;
};

type InviteRow = {
  id: number;
  email?: string;
  role?: string;
  created_by?: string;
  created_at?: string;
  expires_at?: string;
  revoked_at?: string | null;
  used_at?: string | null;
  status?: string;
};

type LeadIntegrityResult = {
  scanned?: number;
  affected?: number;
  affected_rows?: number;
  fixed_rows?: number;
  apply_fixes?: boolean;
  issue_counts?: Record<string, number>;
  samples?: Array<{
    id: number;
    user_id: string;
    issues?: string[];
    before?: Record<string, any>;
    after?: Record<string, any>;
  }>;
};

type Tab = "all" | "pending" | "approved" | "suspended" | "rejected";
type BillingDraft = {
  billing_status: "trial" | "active" | "past_due" | "canceled" | "none";
  trial_ends_at: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
};

const TABS: Tab[] = ["all", "pending", "approved", "suspended", "rejected"];

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function healthClass(status?: string) {
  const s = String(status || "").toLowerCase();
  if (s === "green") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (s === "red") return "border-rose-400/40 bg-rose-500/10 text-rose-200";
  return "border-amber-400/40 bg-amber-500/10 text-amber-200";
}

function normalizeApprovalStatus(v?: string): "pending" | "approved" | "suspended" | "rejected" {
  const s = String(v || "").trim().toLowerCase();
  if (s === "approved" || s === "suspended" || s === "rejected" || s === "pending") return s;
  return "pending";
}

function tabLabel(tab: Tab) {
  if (tab === "all") return "All";
  return tab[0].toUpperCase() + tab.slice(1);
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [status, setStatus] = React.useState<AdminStatus>({});
  const [tab, setTab] = React.useState<Tab>("all");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteExpiryDays, setInviteExpiryDays] = React.useState("7");
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [inviteUrl, setInviteUrl] = React.useState("");
  const [integrityUserId, setIntegrityUserId] = React.useState("");
  const [integrityLimit, setIntegrityLimit] = React.useState("5000");
  const [integrityBusy, setIntegrityBusy] = React.useState(false);
  const [integrityResult, setIntegrityResult] = React.useState<LeadIntegrityResult | null>(null);
  const [billingByUser, setBillingByUser] = React.useState<Record<number, BillingDraft>>({});

  async function load(nextTab: Tab = tab) {
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
        setUsers([]);
        setStatus({});
        setLoading(false);
        return;
      }

      const [usersResp, statusResp, invitesResp] = await Promise.all([
        apiFetch(`/api/admin/users?status=${nextTab}`, { cache: "no-store" }),
        apiFetch("/api/admin/system-status", { cache: "no-store" }),
        apiFetch("/api/admin/invites?limit=20", { cache: "no-store" }),
      ]);

      if (!usersResp.ok) {
        const txt = await usersResp.text().catch(() => "");
        throw new Error(`Load users failed (${usersResp.status}): ${txt}`);
      }
      if (!statusResp.ok) {
        const txt = await statusResp.text().catch(() => "");
        throw new Error(`Load status failed (${statusResp.status}): ${txt}`);
      }
      if (!invitesResp.ok) {
        const txt = await invitesResp.text().catch(() => "");
        throw new Error(`Load invites failed (${invitesResp.status}): ${txt}`);
      }

      const usersBody = await usersResp.json();
      const statusBody = await statusResp.json();
      const invitesBody = await invitesResp.json();

      const nextUsers = Array.isArray(usersBody?.users) ? usersBody.users : [];
      setUsers(nextUsers);
      setBillingByUser((prev) => {
        const next: Record<number, BillingDraft> = { ...prev };
        for (const u of nextUsers) {
          const id = Number(u?.id || 0);
          if (!id) continue;
          if (!next[id]) {
            next[id] = {
              billing_status: (String(u?.billing_status || "trial").toLowerCase() as BillingDraft["billing_status"]) || "trial",
              trial_ends_at: String(u?.trial_ends_at || ""),
              stripe_customer_id: "",
              stripe_subscription_id: "",
            };
          }
        }
        return next;
      });
      setStatus((statusBody?.status || {}) as AdminStatus);
      setInvites(Array.isArray(invitesBody?.invites) ? invitesBody.invites : []);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(tab);
  }, [tab]);

  async function runAction(id: number, action: "approve" | "reject" | "suspend" | "reactivate" | "delete" | "delete-account" | "resend-approval-email" | "send-reset-email") {
    setBusyId(id);
    setError("");
    try {
      let url = `/api/admin/users/${id}/${action}`;
      let method = "POST";
      if (action === "delete") {
        url = `/api/admin/users/${id}`;
        method = "DELETE";
      }
      if (action === "delete-account") {
        url = `/api/admin/users/${id}/delete-account`;
        method = "POST";
      }
      const r = await apiFetch(url, { method });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${action} failed (${r.status}): ${txt}`);
      }
      await load(tab);
    } finally {
      setBusyId(null);
    }
  }

  async function createInvite() {
    setError("");
    setInviteUrl("");
    const days = Number(inviteExpiryDays || "7");
    const expiresMinutes = Math.max(1, days) * 24 * 60;
    const r = await apiFetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: "agent", expiresMinutes }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Create invite failed (${r.status}): ${txt}`);
    }
    const body = await r.json().catch(() => ({}));
    setInviteUrl(String(body?.signup_url || ""));
    setInviteEmail("");
    await load(tab);
  }

  async function revokeInvite(id: number) {
    setError("");
    const r = await apiFetch(`/api/admin/invites/${id}/revoke`, {
      method: "POST",
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Revoke invite failed (${r.status}): ${txt}`);
    }
    await load(tab);
  }

  async function runLeadIntegrity(applyFixes: boolean) {
    setError("");
    setIntegrityBusy(true);
    try {
      const params = new URLSearchParams();
      const userId = String(integrityUserId || "").trim();
      const limitNum = Math.max(1, Math.min(50000, Number(integrityLimit || "5000")));
      params.set("limit", String(limitNum));
      params.set("sample", "25");
      params.set("apply", applyFixes ? "1" : "0");
      if (userId) params.set("user_id", userId);

      const r = await apiFetch(`/api/admin/data-integrity/leads?${params.toString()}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Lead integrity check failed (${r.status}): ${txt}`);
      }
      const body = await r.json().catch(() => ({}));
      setIntegrityResult((body?.result || null) as LeadIntegrityResult | null);
      if (applyFixes) await load(tab);
    } catch (e: any) {
      setError(String(e?.message || "Lead integrity check failed"));
    } finally {
      setIntegrityBusy(false);
    }
  }

  function setBillingDraft(id: number, patch: Partial<BillingDraft>) {
    setBillingByUser((prev) => {
      const current: BillingDraft = prev[id] || {
        billing_status: "trial",
        trial_ends_at: "",
        stripe_customer_id: "",
        stripe_subscription_id: "",
      };
      return {
        ...prev,
        [id]: { ...current, ...patch },
      };
    });
  }

  async function saveBilling(id: number) {
    const draft = billingByUser[id];
    if (!draft) return;
    setBusyId(id);
    setError("");
    try {
      const payload: Record<string, any> = {
        billing_status: draft.billing_status,
        trial_ends_at: draft.trial_ends_at ? draft.trial_ends_at : null,
      };
      if (draft.stripe_customer_id.trim()) payload.stripe_customer_id = draft.stripe_customer_id.trim();
      if (draft.stripe_subscription_id.trim()) payload.stripe_subscription_id = draft.stripe_subscription_id.trim();

      const r = await apiFetch(`/api/admin/users/${id}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Billing update failed (${r.status}): ${txt}`);
      }
      await load(tab);
    } catch (e: any) {
      setError(String(e?.message || "Billing update failed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <h1 className="text-2xl font-semibold">User Management</h1>
      {isAdmin === false ? (
        <p className="mt-3 text-sm text-rose-400">Admin access required.</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Pending</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.pending || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Approved</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.approved || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Suspended</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.suspended || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Rejected</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.rejected || 0)}</div>
        </div>
        <div className="rounded border border-border/70 bg-card/70 p-3 text-sm">
          <div className="text-muted-foreground">Email Delivery</div>
          <div className={status.email_configured ? "text-emerald-300 font-medium" : "text-amber-300 font-medium"}>
            {status.email_configured ? "Configured" : "Not configured"}
          </div>
          <div className="text-xs text-muted-foreground">{status.email_from || "Set EMAIL_FROM + RESEND_API_KEY"}</div>
        </div>
      </div>

      <div className="mt-4 rounded border border-border/70 bg-card/70 p-4">
        <h2 className="text-lg font-medium">Setup Health</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(status.setup_checks || []).map((c) => (
            <div key={c.key} className={`rounded border px-3 py-2 text-sm ${healthClass(c.status)}`}>
              <div className="font-medium">{c.label}</div>
              <div className="text-xs opacity-90">{c.detail || ""}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded border border-border/70 bg-card/70 p-4">
        <h2 className="text-lg font-medium">Lead Integrity</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Scans lead status/source/hot/archive consistency. Optional fix mode applies canonical values.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            value={integrityUserId}
            onChange={(e) => setIntegrityUserId(e.target.value)}
            placeholder="Optional user_id scope"
            className="rounded border border-border px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={50000}
            value={integrityLimit}
            onChange={(e) => setIntegrityLimit(e.target.value)}
            placeholder="Scan row limit"
            className="rounded border border-border px-3 py-2 text-sm"
          />
          <button
            disabled={integrityBusy}
            onClick={() => runLeadIntegrity(false)}
            className="rounded bg-slate-900 text-white text-sm px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {integrityBusy ? "Running..." : "Scan"}
          </button>
          <button
            disabled={integrityBusy}
            onClick={() => runLeadIntegrity(true)}
            className="rounded bg-orange-600 text-white text-sm px-3 py-2 hover:bg-orange-500 disabled:opacity-60"
          >
            {integrityBusy ? "Working..." : "Scan + Fix"}
          </button>
        </div>

        {integrityResult ? (
          <div className="mt-3 rounded border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
            <div>
              Scanned: {Number(integrityResult.scanned || 0)} | Affected rows:{" "}
              {Number(integrityResult.affected_rows || 0)} | Fixed rows:{" "}
              {Number(integrityResult.fixed_rows || 0)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(integrityResult.issue_counts || {}).map(([k, v]) => (
                <span key={k} className="rounded border border-border/70 bg-card/70 px-2 py-1">
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded border border-border/70 bg-card/70 p-4">
        <h2 className="text-lg font-medium">Create Invite</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Optional invite email"
            className="rounded border border-border px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={inviteExpiryDays}
            onChange={(e) => setInviteExpiryDays(e.target.value)}
            placeholder="Expiry days"
            className="rounded border border-border px-3 py-2 text-sm"
          />
          <button
            onClick={() => createInvite().catch((e) => setError(String(e?.message || "Create invite failed")))}
            className="rounded bg-cyan-600 text-white text-sm px-3 py-2 hover:bg-cyan-500"
          >
            Create Invite
          </button>
          <button
            onClick={() => {
              if (!inviteUrl) return;
              navigator.clipboard.writeText(inviteUrl).catch(() => {});
            }}
            className="rounded border border-border text-sm px-3 py-2 hover:bg-muted/40"
          >
            Copy Invite URL
          </button>
        </div>
        {inviteUrl ? (
          <div className="mt-2 text-xs text-muted-foreground break-all">{inviteUrl}</div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "rounded px-3 py-2 text-sm border",
              tab === t ? "bg-slate-900 text-white border-slate-900" : "bg-card/70 text-muted-foreground border-border hover:bg-muted/40",
            ].join(" ")}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading...</p> : null}

      {!loading && users.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No users in this view.</p> : null}

      {!loading && users.length > 0 ? (
        <div className="mt-4 space-y-2">
          {users.map((u) => {
            const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "(No name)";
            const busy = busyId === u.id;
            const approval = normalizeApprovalStatus(u.approval_status);
            const draft = billingByUser[u.id] || {
              billing_status: (String(u?.billing_status || "trial").toLowerCase() as BillingDraft["billing_status"]) || "trial",
              trial_ends_at: String(u?.trial_ends_at || ""),
              stripe_customer_id: "",
              stripe_subscription_id: "",
            };
            return (
              <div key={u.id} className="rounded border border-border/70 p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{fullName}</div>
                  <div className="text-muted-foreground">{u.email}</div>
                  <div className="text-muted-foreground">{u.phone || "No phone"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Created: {fmtDate(u.createdAt)}
                    {u.approved_at ? ` | Approved: ${fmtDate(u.approved_at)}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Access: {approval}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Billing: {String(u.billing_status || "trial")} | Trial ends: {fmtDate(u.trial_ends_at) || "n/a"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  {approval !== "approved" && approval !== "suspended" ? (
                    <button
                      onClick={() => runAction(u.id, "approve").catch((e) => setError(String(e?.message || "Approve failed")))}
                      disabled={busy}
                      className="rounded bg-green-600 text-white text-sm px-3 py-2 hover:bg-emerald-500 disabled:opacity-60"
                    >
                      Enable Access
                    </button>
                  ) : null}

                  {approval === "suspended" ? (
                    <button
                      onClick={() => runAction(u.id, "reactivate").catch((e) => setError(String(e?.message || "Reactivate failed")))}
                      disabled={busy}
                      className="rounded bg-green-600 text-white text-sm px-3 py-2 hover:bg-emerald-500 disabled:opacity-60"
                    >
                      Reactivate Access
                    </button>
                  ) : null}

                  {approval === "approved" ? (
                    <button
                      onClick={() => runAction(u.id, "suspend").catch((e) => setError(String(e?.message || "Suspend failed")))}
                      disabled={busy}
                      className="rounded bg-yellow-600 text-white text-sm px-3 py-2 hover:bg-amber-500 disabled:opacity-60"
                    >
                      Disable Access
                    </button>
                  ) : null}

                  {approval === "pending" ? (
                    <button
                      onClick={() => runAction(u.id, "reject").catch((e) => setError(String(e?.message || "Reject failed")))}
                      disabled={busy}
                      className="rounded bg-yellow-600 text-white text-sm px-3 py-2 hover:bg-amber-500 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  ) : null}

                  <button
                    onClick={() => {
                      if (!window.confirm(`Delete account for ${u.email}? This removes all user data.`)) return;
                      runAction(u.id, "delete-account").catch((e) => setError(String(e?.message || "Delete account failed")));
                    }}
                    disabled={busy}
                    className="rounded bg-red-600 text-white text-sm px-3 py-2 hover:bg-rose-500 disabled:opacity-60"
                  >
                    Delete Account
                  </button>

                  {approval === "pending" || approval === "rejected" ? (
                    <button
                      onClick={() => {
                        if (!window.confirm(`Delete pending user ${u.email}?`)) return;
                        runAction(u.id, "delete").catch((e) => setError(String(e?.message || "Delete failed")));
                      }}
                      disabled={busy}
                      className="rounded border border-rose-400/50 text-rose-200 text-sm px-3 py-2 hover:bg-rose-500/10 disabled:opacity-60"
                    >
                      Delete Pending User
                    </button>
                  ) : null}

                  <button
                    onClick={() => runAction(u.id, "resend-approval-email").catch((e) => setError(String(e?.message || "Resend failed")))}
                    disabled={busy}
                    className="rounded bg-slate-700 text-white text-sm px-3 py-2 hover:bg-slate-600 disabled:opacity-60"
                  >
                    Resend Approval
                  </button>

                  <button
                    onClick={() => runAction(u.id, "send-reset-email").catch((e) => setError(String(e?.message || "Reset email failed")))}
                    disabled={busy}
                    className="rounded bg-indigo-700 text-white text-sm px-3 py-2 hover:bg-indigo-600 disabled:opacity-60"
                  >
                    Send Reset
                  </button>

                  <select
                    value={draft.billing_status}
                    onChange={(e) =>
                      setBillingDraft(u.id, {
                        billing_status: String(e.target.value || "trial") as BillingDraft["billing_status"],
                      })
                    }
                    className="rounded border border-border px-2 py-2 text-sm"
                  >
                    <option value="trial">trial</option>
                    <option value="active">active</option>
                    <option value="past_due">past_due</option>
                    <option value="canceled">canceled</option>
                    <option value="none">none</option>
                  </select>

                  <input
                    type="text"
                    value={draft.trial_ends_at}
                    onChange={(e) => setBillingDraft(u.id, { trial_ends_at: e.target.value })}
                    placeholder="Trial end (YYYY-MM-DD HH:mm:ss)"
                    className="w-56 rounded border border-border px-2 py-2 text-sm"
                  />

                  <button
                    onClick={() => saveBilling(u.id)}
                    disabled={busy}
                    className="rounded bg-slate-800 text-white text-sm px-3 py-2 hover:bg-slate-700 disabled:opacity-60"
                  >
                    Save Billing
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && invites.length > 0 ? (
        <div className="mt-6 rounded border border-border/70 bg-card/70 p-4">
          <h2 className="text-lg font-medium">Recent Invites</h2>
          <div className="mt-2 space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="text-xs text-muted-foreground border border-border/60 rounded p-2">
                <div>ID {inv.id} | role {inv.role || "agent"} | email {inv.email || "(any)"} | status {inv.status || "unknown"}</div>
                <div>
                  Created: {fmtDate(inv.created_at)} | Expires: {fmtDate(inv.expires_at)} | Revoked: {inv.revoked_at ? fmtDate(inv.revoked_at) : "no"} | Used: {inv.used_at ? fmtDate(inv.used_at) : "no"}
                </div>
                {!inv.used_at && !inv.revoked_at ? (
                  <button
                    onClick={() => revokeInvite(inv.id).catch((e) => setError(String(e?.message || "Revoke invite failed")))}
                    className="mt-2 rounded border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
