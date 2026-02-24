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
    <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">Billing foundation is active. Stripe checkout wiring can be connected next.</p>

      {error ? <div className="mt-4 rounded border border-rose-400/40 bg-rose-500/15 p-3 text-sm text-rose-300">{error}</div> : null}

      <div className="mt-4 rounded-xl border border-border/80 bg-card/70 p-4 text-sm">
        {loading ? (
          <div className="text-muted-foreground">Loading billing status...</div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground">Status:</span> <span className="font-medium text-foreground">{billing.status || "trial"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Trial ends:</span> <span className="text-foreground">{fmtDate(billing.trial_ends_at)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Stripe customer ID:</span>{" "}
              <span className="text-foreground">{billing.stripe_customer_id_set ? "Set" : "Not set"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Stripe subscription ID:</span>{" "}
              <span className="text-foreground">{billing.stripe_subscription_id_set ? "Set" : "Not set"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Billing enforcement:</span>{" "}
              <span className="text-foreground">{billing.enforced ? "Enabled" : "Disabled"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Last updated:</span> <span className="text-foreground">{fmtDate(billing.updated_at)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
