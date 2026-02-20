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
};

type Tab = "pending" | "approved" | "rejected";

const TABS: Tab[] = ["pending", "approved", "rejected"];

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [status, setStatus] = React.useState<AdminStatus>({});
  const [tab, setTab] = React.useState<Tab>("pending");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function load(nextTab: Tab = tab) {
    setLoading(true);
    setError("");
    try {
      const [usersResp, statusResp] = await Promise.all([
        apiFetch(`/api/admin/users?status=${nextTab}`, { cache: "no-store" }),
        apiFetch("/api/admin/system-status", { cache: "no-store" }),
      ]);

      if (!usersResp.ok) {
        const txt = await usersResp.text().catch(() => "");
        throw new Error(`Load users failed (${usersResp.status}): ${txt}`);
      }
      if (!statusResp.ok) {
        const txt = await statusResp.text().catch(() => "");
        throw new Error(`Load status failed (${statusResp.status}): ${txt}`);
      }

      const usersBody = await usersResp.json();
      const statusBody = await statusResp.json();

      setUsers(Array.isArray(usersBody?.users) ? usersBody.users : []);
      setStatus((statusBody?.status || {}) as AdminStatus);
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

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">User Management</h1>

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
    </div>
  );
}
