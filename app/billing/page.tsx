"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type BillingStatus = {
  status?: string;
  trial_ends_at?: string | null;
  stripe_customer_id_set?: boolean;
  stripe_subscription_id_set?: boolean;
  updated_at?: string | null;
  enforced?: boolean;
};

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function BillingPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [billing, setBilling] = React.useState<BillingStatus>({});

  React.useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const r = await apiFetch("/api/billing/status", { cache: "no-store" });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`Billing status failed (${r.status}): ${txt}`);
        }
        const body = await r.json().catch(() => ({}));
        if (!dead) setBilling((body?.billing || {}) as BillingStatus);
      } catch (e: any) {
        if (!dead) setError(String(e?.message || "Failed to load billing status"));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-gray-600">Billing foundation is active. Stripe checkout wiring can be connected next.</p>

      {error ? <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 rounded border border-gray-200 bg-white p-4 text-sm">
        {loading ? (
          <div className="text-gray-500">Loading billing status...</div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-gray-500">Status:</span> <span className="font-medium text-gray-900">{billing.status || "trial"}</span>
            </div>
            <div>
              <span className="text-gray-500">Trial ends:</span> <span className="text-gray-900">{fmtDate(billing.trial_ends_at)}</span>
            </div>
            <div>
              <span className="text-gray-500">Stripe customer ID:</span>{" "}
              <span className="text-gray-900">{billing.stripe_customer_id_set ? "Set" : "Not set"}</span>
            </div>
            <div>
              <span className="text-gray-500">Stripe subscription ID:</span>{" "}
              <span className="text-gray-900">{billing.stripe_subscription_id_set ? "Set" : "Not set"}</span>
            </div>
            <div>
              <span className="text-gray-500">Billing enforcement:</span>{" "}
              <span className="text-gray-900">{billing.enforced ? "Enabled" : "Disabled"}</span>
            </div>
            <div>
              <span className="text-gray-500">Last updated:</span> <span className="text-gray-900">{fmtDate(billing.updated_at)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
