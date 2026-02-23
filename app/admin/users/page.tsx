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
  approval_status?: "pending" | "approved" | "rejected" | string;
  approved_at?: string | null;
};

type AdminStatus = {
  email_configured?: boolean;
  email_from?: string;
  google_oauth_configured?: boolean;
  pending_users?: number;
  user_counts?: {
    pending?: number;
    approved?: number;
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
  used_at?: string | null;
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

type Tab = "pending" | "approved" | "rejected";

const TABS: Tab[] = ["pending", "approved", "rejected"];

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function healthClass(status?: string) {
  const s = String(status || "").toLowerCase();
  if (s === "green") return "border-green-300 bg-green-50 text-green-800";
  if (s === "red") return "border-red-300 bg-red-50 text-red-800";
  return "border-yellow-300 bg-yellow-50 text-yellow-800";
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [status, setStatus] = React.useState<AdminStatus>({});
  const [tab, setTab] = React.useState<Tab>("pending");
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

      setUsers(Array.isArray(usersBody?.users) ? usersBody.users : []);
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

  async function runAction(id: number, action: "approve" | "reject" | "delete" | "resend-approval-email" | "send-reset-email") {
    setBusyId(id);
    setError("");
    try {
      let url = `/api/admin/users/${id}/${action}`;
      let method = "POST";
      if (action === "delete") {
        url = `/api/admin/users/${id}`;
        method = "DELETE";
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

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">User Management</h1>
      {isAdmin === false ? (
        <p className="mt-3 text-sm text-red-600">Admin access required.</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Pending</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.pending || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Approved</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.approved || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Rejected</div>
          <div className="text-xl font-semibold">{Number(status.user_counts?.rejected || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Email Delivery</div>
          <div className={status.email_configured ? "text-green-700 font-medium" : "text-yellow-700 font-medium"}>
            {status.email_configured ? "Configured" : "Not configured"}
          </div>
          <div className="text-xs text-gray-500">{status.email_from || "Set EMAIL_FROM + RESEND_API_KEY"}</div>
        </div>
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-white p-4">
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

      <div className="mt-4 rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium">Lead Integrity</h2>
        <p className="mt-1 text-xs text-gray-500">
          Scans lead status/source/hot/archive consistency. Optional fix mode applies canonical values.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            value={integrityUserId}
            onChange={(e) => setIntegrityUserId(e.target.value)}
            placeholder="Optional user_id scope"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={50000}
            value={integrityLimit}
            onChange={(e) => setIntegrityLimit(e.target.value)}
            placeholder="Scan row limit"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            disabled={integrityBusy}
            onClick={() => runLeadIntegrity(false)}
            className="rounded bg-gray-900 text-white text-sm px-3 py-2 hover:bg-gray-800 disabled:opacity-60"
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
          <div className="mt-3 rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
            <div>
              Scanned: {Number(integrityResult.scanned || 0)} | Affected rows:{" "}
              {Number(integrityResult.affected_rows || 0)} | Fixed rows:{" "}
              {Number(integrityResult.fixed_rows || 0)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(integrityResult.issue_counts || {}).map(([k, v]) => (
                <span key={k} className="rounded border border-gray-200 bg-white px-2 py-1">
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-medium">Create Invite</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Optional invite email"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={inviteExpiryDays}
            onChange={(e) => setInviteExpiryDays(e.target.value)}
            placeholder="Expiry days"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => createInvite().catch((e) => setError(String(e?.message || "Create invite failed")))}
            className="rounded bg-blue-600 text-white text-sm px-3 py-2 hover:bg-blue-500"
          >
            Create Invite
          </button>
          <button
            onClick={() => {
              if (!inviteUrl) return;
              navigator.clipboard.writeText(inviteUrl).catch(() => {});
            }}
            className="rounded border border-gray-300 text-sm px-3 py-2 hover:bg-gray-50"
          >
            Copy Invite URL
          </button>
        </div>
        {inviteUrl ? (
          <div className="mt-2 text-xs text-gray-600 break-all">{inviteUrl}</div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "rounded px-3 py-2 text-sm border",
              tab === t ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
            ].join(" ")}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}

      {!loading && users.length === 0 ? <p className="mt-3 text-sm text-gray-600">No users in this tab.</p> : null}

      {!loading && users.length > 0 ? (
        <div className="mt-4 space-y-2">
          {users.map((u) => {
            const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "(No name)";
            const busy = busyId === u.id;
            return (
              <div key={u.id} className="rounded border border-gray-200 p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{fullName}</div>
                  <div className="text-gray-600">{u.email}</div>
                  <div className="text-gray-500">{u.phone || "No phone"}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created: {fmtDate(u.createdAt)}
                    {u.approved_at ? ` | Approved: ${fmtDate(u.approved_at)}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  {tab !== "approved" ? (
                    <button
                      onClick={() => runAction(u.id, "approve").catch((e) => setError(String(e?.message || "Approve failed")))}
                      disabled={busy}
                      className="rounded bg-green-600 text-white text-sm px-3 py-2 hover:bg-green-500 disabled:opacity-60"
                    >
                      Approve
                    </button>
                  ) : null}

                  {tab !== "rejected" ? (
                    <button
                      onClick={() => runAction(u.id, "reject").catch((e) => setError(String(e?.message || "Reject failed")))}
                      disabled={busy}
                      className="rounded bg-yellow-600 text-white text-sm px-3 py-2 hover:bg-yellow-500 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  ) : null}

                  {tab === "pending" || tab === "rejected" ? (
                    <button
                      onClick={() => runAction(u.id, "delete").catch((e) => setError(String(e?.message || "Delete failed")))}
                      disabled={busy}
                      className="rounded bg-red-600 text-white text-sm px-3 py-2 hover:bg-red-500 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : null}

                  <button
                    onClick={() => runAction(u.id, "resend-approval-email").catch((e) => setError(String(e?.message || "Resend failed")))}
                    disabled={busy}
                    className="rounded bg-gray-700 text-white text-sm px-3 py-2 hover:bg-gray-600 disabled:opacity-60"
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
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && invites.length > 0 ? (
        <div className="mt-6 rounded border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-medium">Recent Invites</h2>
          <div className="mt-2 space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="text-xs text-gray-700 border border-gray-100 rounded p-2">
                <div>ID {inv.id} | role {inv.role || "agent"} | email {inv.email || "(any)"}</div>
                <div>Created: {fmtDate(inv.created_at)} | Expires: {fmtDate(inv.expires_at)} | Used: {inv.used_at ? fmtDate(inv.used_at) : "no"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
