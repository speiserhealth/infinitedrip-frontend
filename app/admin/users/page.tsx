"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type PendingUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  createdAt?: string;
  approval_status?: string;
};

type AdminStatus = {
  email_configured?: boolean;
  email_from?: string;
  google_oauth_configured?: boolean;
  pending_users?: number;
};

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<PendingUser[]>([]);
  const [status, setStatus] = React.useState<AdminStatus>({});
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [usersResp, statusResp] = await Promise.all([
        apiFetch("/api/admin/pending-users", { cache: "no-store" }),
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
    load();
  }, []);

  async function runAction(id: number, action: "approve" | "reject" | "delete") {
    setBusyId(id);
    setError("");
    try {
      const url = action === "delete" ? `/api/admin/users/${id}` : `/api/admin/users/${id}/${action}`;
      const method = action === "delete" ? "DELETE" : "POST";
      const r = await apiFetch(url, { method });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${action} failed (${r.status}): ${txt}`);
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Pending User Approvals</h1>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Pending users</div>
          <div className="text-xl font-semibold">{Number(status.pending_users || 0)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Email delivery</div>
          <div className={status.email_configured ? "text-green-700 font-medium" : "text-yellow-700 font-medium"}>
            {status.email_configured ? "Configured" : "Not configured"}
          </div>
          <div className="text-xs text-gray-500">{status.email_from || "Set EMAIL_FROM + RESEND_API_KEY"}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-gray-600">Google OAuth</div>
          <div className={status.google_oauth_configured ? "text-green-700 font-medium" : "text-yellow-700 font-medium"}>
            {status.google_oauth_configured ? "Configured" : "Missing config"}
          </div>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}

      {!loading && users.length === 0 ? <p className="mt-3 text-sm text-gray-600">No pending users.</p> : null}

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
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => runAction(u.id, "approve").catch((e) => setError(String(e?.message || "Approve failed")))}
                    disabled={busy}
                    className="rounded bg-green-600 text-white text-sm px-3 py-2 hover:bg-green-500 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => runAction(u.id, "reject").catch((e) => setError(String(e?.message || "Reject failed")))}
                    disabled={busy}
                    className="rounded bg-yellow-600 text-white text-sm px-3 py-2 hover:bg-yellow-500 disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => runAction(u.id, "delete").catch((e) => setError(String(e?.message || "Delete failed")))}
                    disabled={busy}
                    className="rounded bg-red-600 text-white text-sm px-3 py-2 hover:bg-red-500 disabled:opacity-60"
                  >
                    Delete
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
