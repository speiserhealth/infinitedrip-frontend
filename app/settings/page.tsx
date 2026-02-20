"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type SettingsResponse = {
  ok?: boolean;
  settings?: {
    user_id?: string;
    textdrip_api_token_set?: boolean;
    textdrip_base_url?: string;
    textdrip_inbound_number?: string;
    textdrip_webhook_secret_set?: boolean;
    google_calendar_id?: string;
    google_client_id?: string;
    google_client_secret_set?: boolean;
    google_refresh_token_set?: boolean;
    updated_at?: string | null;
  };
};

type FormState = {
  textdrip_api_token: string;
  textdrip_base_url: string;
  textdrip_inbound_number: string;
  textdrip_webhook_secret: string;
  google_calendar_id: string;
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
};

const INITIAL_FORM: FormState = {
  textdrip_api_token: "",
  textdrip_base_url: "",
  textdrip_inbound_number: "",
  textdrip_webhook_secret: "",
  google_calendar_id: "",
  google_client_id: "",
  google_client_secret: "",
  google_refresh_token: "",
};

function formatUpdatedAt(value?: string | null) {
  if (!value) return "";
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [tokenSet, setTokenSet] = React.useState(false);
  const [webhookSecretSet, setWebhookSecretSet] = React.useState(false);
  const [googleClientSecretSet, setGoogleClientSecretSet] = React.useState(false);
  const [googleRefreshTokenSet, setGoogleRefreshTokenSet] = React.useState(false);

  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/settings", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Load failed (${res.status}): ${txt || "Unknown error"}`);
      }

      const data = (await res.json()) as SettingsResponse;
      const s = data?.settings || {};

      setForm({
        textdrip_api_token: "",
        textdrip_base_url: String(s.textdrip_base_url || ""),
        textdrip_inbound_number: String(s.textdrip_inbound_number || ""),
        textdrip_webhook_secret: "",
        google_calendar_id: String(s.google_calendar_id || ""),
        google_client_id: String(s.google_client_id || ""),
        google_client_secret: "",
        google_refresh_token: "",
      });

      setTokenSet(!!s.textdrip_api_token_set);
      setWebhookSecretSet(!!s.textdrip_webhook_secret_set);
      setGoogleClientSecretSet(!!s.google_client_secret_set);
      setGoogleRefreshTokenSet(!!s.google_refresh_token_set);
      setUpdatedAt(s.updated_at || null);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadSettings();
  }, []);

  function onField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload: Record<string, string> = {
        textdrip_base_url: form.textdrip_base_url,
        textdrip_inbound_number: form.textdrip_inbound_number,
        google_calendar_id: form.google_calendar_id,
        google_client_id: form.google_client_id,
      };

      if (form.textdrip_api_token.trim()) payload.textdrip_api_token = form.textdrip_api_token;
      if (form.textdrip_webhook_secret.trim()) payload.textdrip_webhook_secret = form.textdrip_webhook_secret;
      if (form.google_client_secret.trim()) payload.google_client_secret = form.google_client_secret;
      if (form.google_refresh_token.trim()) payload.google_refresh_token = form.google_refresh_token;

      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}): ${txt || "Unknown error"}`);
      }

      setSuccess("Settings saved.");
      await loadSettings();
    } catch (e: any) {
      setError(String(e?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold text-gray-900">User Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Configure your own Textdrip and Google Calendar credentials for this account.
      </p>

      {updatedAt ? (
        <p className="mt-2 text-xs text-gray-500">Last updated: {formatUpdatedAt(updatedAt)}</p>
      ) : null}

      {error ? <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? (
        <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">{success}</div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-sm text-gray-500">Loading settings...</div>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSave}>
          <section className="rounded border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-medium text-gray-900">Textdrip</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">API Token</span>
                <input
                  type="password"
                  value={form.textdrip_api_token}
                  onChange={(e) => onField("textdrip_api_token", e.target.value)}
                  placeholder={tokenSet ? "Saved (enter to replace)" : "Paste API token"}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Base URL</span>
                <input
                  type="text"
                  value={form.textdrip_base_url}
                  onChange={(e) => onField("textdrip_base_url", e.target.value)}
                  placeholder="https://api.textdrip.com/..."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Inbound Number</span>
                <input
                  type="text"
                  value={form.textdrip_inbound_number}
                  onChange={(e) => onField("textdrip_inbound_number", e.target.value)}
                  placeholder="+19045551234"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Webhook Secret</span>
                <input
                  type="password"
                  value={form.textdrip_webhook_secret}
                  onChange={(e) => onField("textdrip_webhook_secret", e.target.value)}
                  placeholder={webhookSecretSet ? "Saved (enter to replace)" : "Optional secret"}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-medium text-gray-900">Google Calendar</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Calendar ID</span>
                <input
                  type="text"
                  value={form.google_calendar_id}
                  onChange={(e) => onField("google_calendar_id", e.target.value)}
                  placeholder="primary"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Client ID</span>
                <input
                  type="text"
                  value={form.google_client_id}
                  onChange={(e) => onField("google_client_id", e.target.value)}
                  placeholder="Google OAuth Client ID"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Client Secret</span>
                <input
                  type="password"
                  value={form.google_client_secret}
                  onChange={(e) => onField("google_client_secret", e.target.value)}
                  placeholder={googleClientSecretSet ? "Saved (enter to replace)" : "Google OAuth Client Secret"}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">Refresh Token</span>
                <input
                  type="password"
                  value={form.google_refresh_token}
                  onChange={(e) => onField("google_refresh_token", e.target.value)}
                  placeholder={googleRefreshTokenSet ? "Saved (enter to replace)" : "Google refresh token"}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </form>
      )}
    </div>
  );
}
