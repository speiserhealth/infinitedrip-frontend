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
};

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<PendingUser[]>([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch("/api/admin/pending-users", { cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Load failed (${r.status}): ${txt}`);
      }
      const body = await r.json();
      setUsers(Array.isArray(body?.users) ? body.users : []);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function approve(id: number) {
    const r = await apiFetch(`/api/admin/users/${id}/approve`, { method: "POST" });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Approve failed (${r.status}): ${txt}`);
    }
    await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Pending User Approvals</h1>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-gray-600">Loading...</p> : null}

      {!loading && users.length === 0 ? <p className="mt-3 text-sm text-gray-600">No pending users.</p> : null}

      {!loading && users.length > 0 ? (
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded border border-gray-200 p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "(No name)"}</div>
                <div className="text-gray-600">{u.email}</div>
                <div className="text-gray-500">{u.phone || "No phone"}</div>
              </div>
              <button
                onClick={() => approve(u.id).catch((e) => setError(String(e?.message || "Approve failed")))}
                className="rounded bg-green-600 text-white text-sm px-3 py-2 hover:bg-green-500"
              >
                Approve
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
