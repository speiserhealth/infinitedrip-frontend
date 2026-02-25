"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type SettingsResponse = {
  ok?: boolean;
  webhook_url?: string;
  settings?: {
    user_id?: string;
    textdrip_api_token_set?: boolean;
    textdrip_base_url?: string;
    textdrip_base_url_effective?: string;
    textdrip_webhook_secret?: string;
    textdrip_webhook_secret_set?: boolean;
    ai_first_reply_mode?: string;
    ai_allow_quote?: boolean;
    ai_quiet_hours_enabled?: boolean;
    ai_quiet_hours_start?: string;
    ai_quiet_hours_end?: string;
    ai_max_replies_per_5m?: number;
    ai_reply_cooldown_minutes?: number;
    appointment_reminders_enabled?: boolean;
    appointment_reminder_offsets?: number[] | string;
    google_calendar_id?: string;
    google_client_id?: string;
    google_client_secret_set?: boolean;
    google_refresh_token_set?: boolean;
    google_account_email?: string;
    google_account_email_set?: boolean;
    updated_at?: string | null;
  };
};

type FormState = {
  textdrip_api_token: string;
  textdrip_base_url: string;
  textdrip_webhook_secret: string;
  ai_first_reply_mode: "require_prior_outbound" | "allow_first_reply";
  ai_allow_quote: boolean;
  ai_quiet_hours_enabled: boolean;
  ai_quiet_hours_start: string;
  ai_quiet_hours_end: string;
  ai_max_replies_per_5m: string;
  ai_reply_cooldown_minutes: string;
  appointment_reminders_enabled: boolean;
  appointment_reminder_offsets: string[];
  google_calendar_id: string;
  google_client_id: string;
  google_client_secret: string;
  google_refresh_token: string;
};

type AiFaqRow = {
  id: number;
  question: string;
  answer: string;
  active: number;
  priority: number;
  source?: string;
  updated_at?: string | null;
  created_at?: string | null;
};

type CalendarStatus = {
  configured?: boolean;
  connected?: boolean;
  gmail_connected?: boolean;
  account_email?: string;
  warning?: string;
  detail?: string;
  calendar_id?: string;
  next_event_at?: string | null;
  checked_at?: string;
};

type OnboardingChecklistResponse = {
  ok?: boolean;
  checklist?: {
    steps?: Array<{ key?: string; label?: string; done?: boolean }>;
  };
};

type TextdripSetupState = {
  textdripConnected: boolean;
  webhookConfigured: boolean;
  webhookLive: boolean;
  checkedAt: string;
};

type TextdripConnectDraft = {
  apiToken: string;
  baseUrl: string;
  webhookSecret: string;
};

type MeResponse = {
  ok?: boolean;
  user?: {
    role?: string;
  };
};

type AiTestMsg = {
  role: "user" | "assistant";
  text: string;
  at: string;
};

const INITIAL_FORM: FormState = {
  textdrip_api_token: "",
  textdrip_base_url: "",
  textdrip_webhook_secret: "",
  ai_first_reply_mode: "require_prior_outbound",
  ai_allow_quote: false,
  ai_quiet_hours_enabled: false,
  ai_quiet_hours_start: "22:00",
  ai_quiet_hours_end: "08:00",
  ai_max_replies_per_5m: "20",
  ai_reply_cooldown_minutes: "2",
  appointment_reminders_enabled: false,
  appointment_reminder_offsets: [],
  google_calendar_id: "",
  google_client_id: "",
  google_client_secret: "",
  google_refresh_token: "",
};

const INITIAL_TEXTDRIP_SETUP: TextdripSetupState = {
  textdripConnected: false,
  webhookConfigured: false,
  webhookLive: false,
  checkedAt: "",
};

const INITIAL_TEXTDRIP_DRAFT: TextdripConnectDraft = {
  apiToken: "",
  baseUrl: "",
  webhookSecret: "",
};

function formatUpdatedAt(value?: string | null) {
  if (!value) return "";
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function clampMaxReplies(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function normalizeReminderOffsets(raw: unknown): string[] {
  const vals = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[,\s;]+/)
        .filter(Boolean);
  const set = new Set<string>();
  for (const v of vals) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const m = Math.floor(n);
    if (m === 15 || m === 30 || m === 60) set.add(String(m));
  }
  return Array.from(set).sort((a, b) => Number(a) - Number(b));
}

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [connectingGoogle, setConnectingGoogle] = React.useState(false);
  const [rotatingSecret, setRotatingSecret] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [tokenSet, setTokenSet] = React.useState(false);
  const [webhookSecretSet, setWebhookSecretSet] = React.useState(false);
  const [googleClientSecretSet, setGoogleClientSecretSet] = React.useState(false);
  const [googleRefreshTokenSet, setGoogleRefreshTokenSet] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [calendarStatus, setCalendarStatus] = React.useState<CalendarStatus | null>(null);
  const [checkingCalendar, setCheckingCalendar] = React.useState(false);
  const [checkingTextdrip, setCheckingTextdrip] = React.useState(false);
  const [runningTextdripWizard, setRunningTextdripWizard] = React.useState(false);
  const [textdripSetup, setTextdripSetup] = React.useState<TextdripSetupState>(INITIAL_TEXTDRIP_SETUP);
  const [textdripTemplateSource, setTextdripTemplateSource] = React.useState("");
  const [textdripModalOpen, setTextdripModalOpen] = React.useState(false);
  const [textdripModalSaving, setTextdripModalSaving] = React.useState(false);
  const [textdripDraft, setTextdripDraft] = React.useState<TextdripConnectDraft>(INITIAL_TEXTDRIP_DRAFT);
  const [textdripAdvancedOpen, setTextdripAdvancedOpen] = React.useState(false);
  const [textdripBaseUrlEffective, setTextdripBaseUrlEffective] = React.useState("");
  const [isAdmin, setIsAdmin] = React.useState(false);

  const [faqs, setFaqs] = React.useState<AiFaqRow[]>([]);
  const [adminFaqs, setAdminFaqs] = React.useState<AiFaqRow[]>([]);
  const [faqSaving, setFaqSaving] = React.useState(false);
  const [faqBusyId, setFaqBusyId] = React.useState<number | null>(null);
  const [adminFaqSaving, setAdminFaqSaving] = React.useState(false);
  const [adminFaqBusyId, setAdminFaqBusyId] = React.useState<number | null>(null);
  const [newFaqQuestion, setNewFaqQuestion] = React.useState("");
  const [newFaqAnswer, setNewFaqAnswer] = React.useState("");
  const [newFaqPriority, setNewFaqPriority] = React.useState("100");
  const [newAdminFaqQuestion, setNewAdminFaqQuestion] = React.useState("");
  const [newAdminFaqAnswer, setNewAdminFaqAnswer] = React.useState("");
  const [newAdminFaqPriority, setNewAdminFaqPriority] = React.useState("100");

  const [aiTestOpen, setAiTestOpen] = React.useState(false);
  const [aiTestInput, setAiTestInput] = React.useState("");
  const [aiTestBusy, setAiTestBusy] = React.useState(false);
  const [aiTestThread, setAiTestThread] = React.useState<AiTestMsg[]>([]);

  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [googleStatus, setGoogleStatus] = React.useState("");

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
      setWebhookUrl(String(data?.webhook_url || ""));
      setTextdripBaseUrlEffective(String(s.textdrip_base_url_effective || s.textdrip_base_url || ""));

      setForm({
        textdrip_api_token: "",
        textdrip_base_url: String(s.textdrip_base_url || ""),
        textdrip_webhook_secret: String(s.textdrip_webhook_secret || ""),
        ai_first_reply_mode:
          String(s.ai_first_reply_mode || "").trim().toLowerCase() === "allow_first_reply"
            ? "allow_first_reply"
            : "require_prior_outbound",
        ai_allow_quote: !!s.ai_allow_quote,
        ai_quiet_hours_enabled: !!s.ai_quiet_hours_enabled,
        ai_quiet_hours_start: String(s.ai_quiet_hours_start || "22:00"),
        ai_quiet_hours_end: String(s.ai_quiet_hours_end || "08:00"),
        ai_max_replies_per_5m: String(clampMaxReplies(String(s.ai_max_replies_per_5m ?? "20"))),
        ai_reply_cooldown_minutes: String(
          Math.max(0, Math.min(120, Math.floor(Number(s.ai_reply_cooldown_minutes ?? 2) || 2)))
        ),
        appointment_reminders_enabled: !!s.appointment_reminders_enabled,
        appointment_reminder_offsets: normalizeReminderOffsets(s.appointment_reminder_offsets),
        google_calendar_id: String(s.google_calendar_id || ""),
        google_client_id: String(s.google_client_id || ""),
        google_client_secret: "",
        google_refresh_token: "",
      });
      setTextdripDraft((prev) => ({
        ...prev,
        apiToken: "",
        baseUrl: String(s.textdrip_base_url || ""),
        webhookSecret: "",
      }));

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

  async function loadMeRole() {
    try {
      const res = await apiFetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as MeResponse;
      const role = String(body?.user?.role || "").trim().toLowerCase();
      setIsAdmin(role === "admin");
    } catch {
      setIsAdmin(false);
    }
  }

  React.useEffect(() => {
    loadMeRole().catch(() => {});
    loadSettings();
    loadFaqs().catch(() => {});
    loadCalendarStatus().catch(() => {});
    loadTextdripSetupStatus().catch(() => {});
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    setGoogleStatus(String(params.get("google") || "").trim());
  }, []);

  React.useEffect(() => {
    if (!isAdmin) return;
    loadAdminFaqs().catch((e) => setError(String(e?.message || "Admin FAQ load failed")));
  }, [isAdmin]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!textdripModalOpen && !aiTestOpen) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [textdripModalOpen, aiTestOpen]);

  function onField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openTextdripModal() {
    setError("");
    setSuccess("");
    setTextdripAdvancedOpen(false);
    setTextdripDraft({
      apiToken: "",
      baseUrl: String(form.textdrip_base_url || ""),
      webhookSecret: "",
    });
    setTextdripModalOpen(true);
  }

  async function loadFaqs() {
    const res = await apiFetch("/api/ai/faqs?limit=200", { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`FAQ load failed (${res.status}): ${txt || "Unknown error"}`);
    }
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body?.faqs) ? body.faqs : [];
    setFaqs(
      list.map((x: any) => ({
        id: Number(x?.id || 0),
        question: String(x?.question || ""),
        answer: String(x?.answer || ""),
        active: Number(x?.active || 0) ? 1 : 0,
        priority: Number(x?.priority || 100),
        updated_at: x?.updated_at || null,
        created_at: x?.created_at || null,
      }))
    );
  }

  async function loadAdminFaqs() {
    const res = await apiFetch("/api/admin/ai/default-faqs?limit=200", { cache: "no-store" });
    if (res.status === 403) {
      setAdminFaqs([]);
      return;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Admin FAQ load failed (${res.status}): ${txt || "Unknown error"}`);
    }
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body?.faqs) ? body.faqs : [];
    setAdminFaqs(
      list.map((x: any) => ({
        id: Number(x?.id || 0),
        question: String(x?.question || ""),
        answer: String(x?.answer || ""),
        active: Number(x?.active || 0) ? 1 : 0,
        priority: Number(x?.priority || 100),
        source: "admin_default",
        updated_at: x?.updated_at || null,
        created_at: x?.created_at || null,
      }))
    );
  }

  async function loadCalendarStatus() {
    setCheckingCalendar(true);
    try {
      const res = await apiFetch("/api/appointments/status", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Calendar status failed (${res.status}): ${txt || "Unknown error"}`);
      }
      const body = await res.json().catch(() => ({}));
      setCalendarStatus((body?.status || null) as CalendarStatus | null);
    } finally {
      setCheckingCalendar(false);
    }
  }

  async function loadTextdripSetupStatus() {
    setCheckingTextdrip(true);
    try {
      const res = await apiFetch("/api/onboarding/checklist", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Textdrip status failed (${res.status}): ${txt || "Unknown error"}`);
      }
      const body = (await res.json().catch(() => ({}))) as OnboardingChecklistResponse;
      const steps = Array.isArray(body?.checklist?.steps) ? body.checklist?.steps || [] : [];
      const byKey = new Map(steps.map((s) => [String(s?.key || ""), !!s?.done]));
      setTextdripSetup({
        textdripConnected: !!byKey.get("textdrip_connected"),
        webhookConfigured: !!byKey.get("webhook_configured"),
        webhookLive: !!byKey.get("webhook_live"),
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setCheckingTextdrip(false);
    }
  }

  async function createFaq() {
    const question = String(newFaqQuestion || "").trim();
    const answer = String(newFaqAnswer || "").trim();
    const priority = Math.max(1, Math.min(999, Math.floor(Number(newFaqPriority || "100") || 100)));
    if (!question || !answer) {
      throw new Error("Question and answer are required.");
    }
    setFaqSaving(true);
    try {
      const res = await apiFetch("/api/ai/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, priority, active: true }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`FAQ create failed (${res.status}): ${txt || "Unknown error"}`);
      }
      setNewFaqQuestion("");
      setNewFaqAnswer("");
      setNewFaqPriority("100");
      await loadFaqs();
      setSuccess("AI FAQ added.");
    } finally {
      setFaqSaving(false);
    }
  }

  async function toggleFaqActive(row: AiFaqRow) {
    setFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/ai/faqs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: row.active === 1 ? 0 : 1 }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`FAQ update failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadFaqs();
    } finally {
      setFaqBusyId(null);
    }
  }

  async function editFaq(row: AiFaqRow) {
    const nextQuestion = window.prompt("Question", row.question);
    if (nextQuestion === null) return;
    const nextAnswer = window.prompt("Answer", row.answer);
    if (nextAnswer === null) return;
    const nextPriority = window.prompt("Priority (1-999, lower is stronger)", String(row.priority || 100));
    if (nextPriority === null) return;
    const priority = Math.max(1, Math.min(999, Math.floor(Number(nextPriority || "100") || 100)));

    setFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/ai/faqs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: String(nextQuestion || "").trim(),
          answer: String(nextAnswer || "").trim(),
          priority,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`FAQ edit failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadFaqs();
    } finally {
      setFaqBusyId(null);
    }
  }

  async function removeFaq(row: AiFaqRow) {
    if (!window.confirm("Delete this FAQ?")) return;
    setFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/ai/faqs/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`FAQ delete failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadFaqs();
    } finally {
      setFaqBusyId(null);
    }
  }

  async function createAdminFaq() {
    const question = String(newAdminFaqQuestion || "").trim();
    const answer = String(newAdminFaqAnswer || "").trim();
    const priority = Math.max(1, Math.min(999, Math.floor(Number(newAdminFaqPriority || "100") || 100)));
    if (!question || !answer) {
      throw new Error("Question and answer are required.");
    }
    setAdminFaqSaving(true);
    try {
      const res = await apiFetch("/api/admin/ai/default-faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, priority, active: true }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Admin FAQ create failed (${res.status}): ${txt || "Unknown error"}`);
      }
      setNewAdminFaqQuestion("");
      setNewAdminFaqAnswer("");
      setNewAdminFaqPriority("100");
      await loadAdminFaqs();
      setSuccess("Administrative default guardrail added.");
    } finally {
      setAdminFaqSaving(false);
    }
  }

  async function toggleAdminFaqActive(row: AiFaqRow) {
    setAdminFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/admin/ai/default-faqs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: row.active === 1 ? 0 : 1 }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Admin FAQ update failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadAdminFaqs();
    } finally {
      setAdminFaqBusyId(null);
    }
  }

  async function editAdminFaq(row: AiFaqRow) {
    const nextQuestion = window.prompt("Question", row.question);
    if (nextQuestion === null) return;
    const nextAnswer = window.prompt("Answer", row.answer);
    if (nextAnswer === null) return;
    const nextPriority = window.prompt("Priority (1-999, lower is stronger)", String(row.priority || 100));
    if (nextPriority === null) return;
    const priority = Math.max(1, Math.min(999, Math.floor(Number(nextPriority || "100") || 100)));

    setAdminFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/admin/ai/default-faqs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: String(nextQuestion || "").trim(),
          answer: String(nextAnswer || "").trim(),
          priority,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Admin FAQ edit failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadAdminFaqs();
    } finally {
      setAdminFaqBusyId(null);
    }
  }

  async function removeAdminFaq(row: AiFaqRow) {
    if (!window.confirm("Delete this administrative default guardrail?")) return;
    setAdminFaqBusyId(row.id);
    try {
      const res = await apiFetch(`/api/admin/ai/default-faqs/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Admin FAQ delete failed (${res.status}): ${txt || "Unknown error"}`);
      }
      await loadAdminFaqs();
    } finally {
      setAdminFaqBusyId(null);
    }
  }

  async function runAiTestSend() {
    const text = String(aiTestInput || "").trim();
    if (!text || aiTestBusy) return;
    const userMsg: AiTestMsg = { role: "user", text, at: new Date().toISOString() };
    const nextThread = [...aiTestThread, userMsg];
    setAiTestThread(nextThread);
    setAiTestInput("");
    setAiTestBusy(true);
    try {
      const payloadThread = nextThread.map((m) => ({
        direction: m.role === "assistant" ? "out" : "in",
        text: m.text,
      }));
      const res = await apiFetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          thread: payloadThread,
          allow_quote: !!form.ai_allow_quote,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`AI test failed (${res.status}): ${txt || "Unknown error"}`);
      }
      const body = await res.json().catch(() => ({}));
      const reply = String(body?.reply || "").trim() || "No reply returned.";
      setAiTestThread((prev) => [...prev, { role: "assistant", text: reply, at: new Date().toISOString() }]);
    } catch (e: any) {
      setError(String(e?.message || "AI test failed"));
    } finally {
      setAiTestBusy(false);
    }
  }

  function applyMaxRepliesPreset(nextValue: number) {
    onField("ai_max_replies_per_5m", String(clampMaxReplies(String(nextValue))));
  }

  function toggleReminderOffset(offset: "15" | "30" | "60") {
    const current = Array.isArray(form.appointment_reminder_offsets)
      ? form.appointment_reminder_offsets
      : [];
    const has = current.includes(offset);
    const next = has
      ? current.filter((x) => x !== offset)
      : [...current, offset].sort((a, b) => Number(a) - Number(b));
    onField("appointment_reminder_offsets", next);
  }

  function buildSettingsPayload() {
    const payload: Record<string, unknown> = {
      textdrip_base_url: form.textdrip_base_url,
      ai_first_reply_mode: form.ai_first_reply_mode,
      ai_allow_quote: !!form.ai_allow_quote,
      ai_quiet_hours_enabled: form.ai_quiet_hours_enabled,
      ai_quiet_hours_start: form.ai_quiet_hours_start,
      ai_quiet_hours_end: form.ai_quiet_hours_end,
      ai_max_replies_per_5m: clampMaxReplies(form.ai_max_replies_per_5m),
      ai_reply_cooldown_minutes: Math.max(
        0,
        Math.min(120, Math.floor(Number(form.ai_reply_cooldown_minutes || "2") || 2))
      ),
      appointment_reminders_enabled: !!form.appointment_reminders_enabled,
      appointment_reminder_offsets: normalizeReminderOffsets(form.appointment_reminder_offsets).map((x) => Number(x)),
      google_calendar_id: form.google_calendar_id,
      google_client_id: form.google_client_id,
    };
    if (form.textdrip_api_token.trim()) payload.textdrip_api_token = form.textdrip_api_token;
    if (form.textdrip_webhook_secret.trim()) payload.textdrip_webhook_secret = form.textdrip_webhook_secret;
    if (form.google_client_secret.trim()) payload.google_client_secret = form.google_client_secret;
    if (form.google_refresh_token.trim()) payload.google_refresh_token = form.google_refresh_token;
    return payload;
  }

  async function saveSettingsPayload() {
    const payload = buildSettingsPayload();
    const res = await apiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Save failed (${res.status}): ${txt || "Unknown error"}`);
    }
    await loadSettings();
    await loadCalendarStatus().catch(() => {});
    await loadTextdripSetupStatus().catch(() => {});
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveSettingsPayload();
      setSuccess("Settings saved.");
    } catch (e: any) {
      setError(String(e?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function runTextdripConnectionCheck() {
    const syncRes = await apiFetch("/api/textdrip/templates/sync", { method: "POST" });
    if (!syncRes.ok) {
      const txt = await syncRes.text().catch(() => "");
      throw new Error(`Textdrip check failed (${syncRes.status}): ${txt || "Unknown error"}`);
    }
    const syncBody = await syncRes.json().catch(() => ({}));
    const synced = Number(syncBody?.synced || 0);
    setTextdripTemplateSource(String(syncBody?.source_url || ""));
    await loadTextdripSetupStatus().catch(() => {});
    return {
      synced,
      warning: String(syncBody?.warning || ""),
    };
  }

  async function onSaveTextdripConnect(runCheck = false) {
    setTextdripModalSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload: Record<string, unknown> = {
        textdrip_base_url: String(textdripDraft.baseUrl || "").trim(),
      };
      if (textdripDraft.apiToken.trim()) payload.textdrip_api_token = textdripDraft.apiToken.trim();
      if (textdripDraft.webhookSecret.trim()) payload.textdrip_webhook_secret = textdripDraft.webhookSecret.trim();

      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Textdrip save failed (${res.status}): ${txt || "Unknown error"}`);
      }

      await loadSettings();
      await loadTextdripSetupStatus().catch(() => {});

      if (runCheck) {
        const checked = await runTextdripConnectionCheck();
        const synced = Number(checked?.synced || 0);
        setSuccess(
          synced > 0
            ? `Textdrip connected and checked. Synced ${synced} template${synced === 1 ? "" : "s"}. If inbound test is still pending, send 1 inbound SMS then check again.`
            : "Textdrip connected and checked. SMS setup looks good. If inbound test is still pending, send 1 inbound SMS then check again."
        );
      } else {
        setSuccess("Textdrip connection details saved.");
      }
      setTextdripModalOpen(false);
    } catch (e: any) {
      setError(String(e?.message || "Textdrip save failed"));
    } finally {
      setTextdripModalSaving(false);
    }
  }

  async function onRunTextdripWizard() {
    setRunningTextdripWizard(true);
    setError("");
    setSuccess("");
    try {
      const checked = await runTextdripConnectionCheck();
      const synced = Number(checked?.synced || 0);
      setSuccess(
        synced > 0
          ? `Textdrip check passed. Synced ${synced} template${synced === 1 ? "" : "s"}. If inbound test is still pending, send 1 inbound SMS then check again.`
          : "Textdrip check passed. SMS setup looks good. If inbound test is still pending, send 1 inbound SMS then check again."
      );
    } catch (e: any) {
      setError(String(e?.message || "Textdrip setup check failed"));
    } finally {
      setRunningTextdripWizard(false);
    }
  }

  async function onConnectGoogle() {
    setError("");
    setSuccess("");
    setConnectingGoogle(true);
    try {
      const res = await apiFetch("/api/integrations/google/url", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Google connect failed (${res.status}): ${txt || "Unknown error"}`);
      }
      const data = await res.json();
      const url = String(data?.url || "");
      if (!url) throw new Error("Missing Google auth URL.");
      window.location.href = url;
    } catch (e: any) {
      setError(String(e?.message || "Google connect failed"));
      setConnectingGoogle(false);
    }
  }

  async function onRotateWebhookSecret() {
    setRotatingSecret(true);
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch("/api/settings/webhook-secret/rotate", { method: "POST" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Key regeneration failed (${res.status}): ${txt || "Unknown error"}`);
      }
      const data = (await res.json()) as SettingsResponse;
      const s = data?.settings || {};
      setWebhookUrl(String(data?.webhook_url || ""));
      setForm((prev) => ({ ...prev, textdrip_webhook_secret: String(s.textdrip_webhook_secret || "") }));
      setWebhookSecretSet(!!s.textdrip_webhook_secret_set);
      await loadTextdripSetupStatus().catch(() => {});
      setSuccess("Security key regenerated.");
    } catch (e: any) {
      setError(String(e?.message || "Key regeneration failed"));
    } finally {
      setRotatingSecret(false);
    }
  }

  async function onCopyWebhookUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setSuccess("Callback URL copied.");
    } catch {
      setError("Could not copy callback URL.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-border/70 bg-card/40 p-6 shadow-xl backdrop-blur-sm">
      <h1 className="text-2xl font-semibold text-foreground">User Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configure your own Textdrip and Google Calendar connections for this account.</p>

      {updatedAt ? (
        <p className="mt-2 text-xs text-muted-foreground">Last updated: {formatUpdatedAt(updatedAt)}</p>
      ) : null}

      {error ? <div className="mt-4 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div> : null}
      {success ? (
        <div className="mt-4 rounded border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>
      ) : null}
      {googleStatus === "connected" ? (
        <div className="mt-4 rounded border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          Google Calendar connected successfully.
        </div>
      ) : null}
      {googleStatus === "missing_refresh_token" ? (
        <div className="mt-4 rounded border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Google returned no refresh token. Try Connect again and approve all prompts.
        </div>
      ) : null}
      {googleStatus === "invalid_callback" || googleStatus === "error" ? (
        <div className="mt-4 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          Google connection failed. Please try again.
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-sm text-muted-foreground">Loading settings...</div>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSave}>
          <section className="rounded border border-border/70 bg-card/70 p-4">
            <h2 className="text-lg font-medium text-foreground">Textdrip</h2>
            <div className="mt-3 rounded border border-cyan-400/40 bg-cyan-500/10 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-cyan-100">Simple Setup</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openTextdripModal}
                    className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500/100"
                  >
                    Connect Textdrip
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunTextdripWizard()}
                    disabled={runningTextdripWizard || saving}
                    className="rounded border border-cyan-400/40 bg-card/70 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-60"
                  >
                    {runningTextdripWizard ? "Checking..." : "Run Health Check"}
                  </button>
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-cyan-100 md:grid-cols-3">
                <div className={textdripSetup.textdripConnected ? "font-medium" : ""}>
                  {textdripSetup.textdripConnected ? "OK" : "Pending"} 1) Connection details saved
                </div>
                <div className={textdripSetup.webhookConfigured ? "font-medium" : ""}>
                  {textdripSetup.webhookConfigured ? "OK" : "Pending"} 2) Inbound route secured
                </div>
                <div className={textdripSetup.webhookLive ? "font-medium" : ""}>
                  {textdripSetup.webhookLive ? "OK" : "Pending"} 3) Inbound test text received
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-cyan-200">
                {textdripSetup.checkedAt ? <span>Last check: {formatUpdatedAt(textdripSetup.checkedAt)}</span> : null}
                {checkingTextdrip ? <span>Refreshing setup status...</span> : null}
                {textdripTemplateSource ? <span>Template endpoint: {textdripTemplateSource}</span> : null}
              </div>
              <p className="mt-2 text-xs text-cyan-200">No calling features are connected here, SMS only.</p>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="block text-sm md:col-span-2 rounded border border-border/70 bg-muted/40 p-3">
                <div className="font-medium text-foreground">Connection Snapshot</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Account details: {tokenSet ? "saved" : "not set"} | Inbound security key: {webhookSecretSet ? "set" : "not set"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Use Connect Textdrip to add or replace details.</p>
              </div>

              <div className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Max AI Replies (per 5 min)</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.ai_max_replies_per_5m}
                    onChange={(e) => onField("ai_max_replies_per_5m", e.target.value)}
                    className="w-full rounded border border-border px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => applyMaxRepliesPreset(10)}
                    className="rounded border border-border px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    10
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMaxRepliesPreset(20)}
                    className="rounded border border-border px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    20
                  </button>
                  <button
                    type="button"
                    onClick={() => applyMaxRepliesPreset(40)}
                    className="rounded border border-border px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    40
                  </button>
                </div>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">AI Reply Cooldown (minutes)</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={form.ai_reply_cooldown_minutes}
                  onChange={(e) => onField("ai_reply_cooldown_minutes", e.target.value)}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Prevents immediate back-to-back AI auto replies for the same lead.
                </p>
              </label>

              <div className="block text-sm md:col-span-2 rounded border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="mb-1 block text-foreground font-medium">Auto-text Appointment Reminders</span>
                    <p className="text-xs text-muted-foreground">
                      Send reminder SMS before booked appointments. Choose one, all, or none.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onField("appointment_reminders_enabled", !form.appointment_reminders_enabled)}
                    className={`rounded px-3 py-2 text-sm ${
                      form.appointment_reminders_enabled
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "border border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {form.appointment_reminders_enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["15", "30", "60"] as const).map((offset) => {
                    const active = form.appointment_reminder_offsets.includes(offset);
                    return (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => toggleReminderOffset(offset)}
                        className={`rounded border px-3 py-1.5 text-xs ${
                          active
                            ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200"
                            : "bg-card/70 border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        {offset === "60" ? "1 hour before" : `${offset} min before`}
                      </button>
                    );
                  })}
                </div>
                {form.appointment_reminders_enabled && form.appointment_reminder_offsets.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-300">Select at least one reminder time.</p>
                ) : null}
              </div>

              <div className="block text-sm md:col-span-2 rounded border border-border/70 p-3">
                <div className="mb-3">
                  <span className="mb-1 block text-foreground font-medium">AI First Reply Mode</span>
                  <select
                    value={form.ai_first_reply_mode}
                    onChange={(e) =>
                      onField(
                        "ai_first_reply_mode",
                        e.target.value === "allow_first_reply" ? "allow_first_reply" : "require_prior_outbound"
                      )
                    }
                    className="w-full rounded border border-border px-3 py-2 text-sm"
                  >
                    <option value="require_prior_outbound">Require prior outbound (safer)</option>
                    <option value="allow_first_reply">Allow AI first reply on brand-new inbound</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Safer default keeps AI from initiating conversations unless your CRM has already texted first.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="mb-1 block text-foreground font-medium">Quiet Hours</span>
                    <p className="text-xs text-muted-foreground">AI will not auto-reply during this window.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onField("ai_quiet_hours_enabled", !form.ai_quiet_hours_enabled)}
                    className={`rounded px-3 py-2 text-sm ${
                      form.ai_quiet_hours_enabled
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "border border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {form.ai_quiet_hours_enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">Start</span>
                    <input
                      type="time"
                      value={form.ai_quiet_hours_start}
                      onChange={(e) => onField("ai_quiet_hours_start", e.target.value)}
                      className="w-full rounded border border-border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">End</span>
                    <input
                      type="time"
                      value={form.ai_quiet_hours_end}
                      onChange={(e) => onField("ai_quiet_hours_end", e.target.value)}
                      className="w-full rounded border border-border px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="block text-sm md:col-span-2">
                <span className="mb-1 block text-muted-foreground">Inbound Callback URL</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookUrl}
                    readOnly
                    className="w-full rounded border border-border bg-muted/40 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={onCopyWebhookUrl}
                    className="rounded border border-border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={onRotateWebhookSecret}
                    disabled={rotatingSecret}
                    className="rounded border border-border px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-60"
                  >
                    {rotatingSecret ? "Regenerating..." : "Regenerate Key"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste this URL into Textdrip inbound callback settings for this account.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded border border-border/70 bg-card/70 p-4">
            <h2 className="text-lg font-medium text-foreground">Google Account (Calendar + Gmail)</h2>
            <div className="mt-3">
              <button
                type="button"
                onClick={onConnectGoogle}
                disabled={connectingGoogle}
                className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500/100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connectingGoogle ? "Redirecting..." : "Connect Google Account"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                One connect powers appointment booking plus Gmail compose shortcuts.
              </p>
            </div>
            <div className="mt-3 rounded border border-border/70 bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-foreground">Connection Status</div>
                <button
                  type="button"
                  onClick={() => loadCalendarStatus().catch((e) => setError(String(e?.message || "Calendar check failed")))}
                  disabled={checkingCalendar}
                  className="rounded border border-border px-3 py-1.5 text-xs hover:bg-card/70 disabled:opacity-60"
                >
                  {checkingCalendar ? "Checking..." : "Check"}
                </button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Calendar: {calendarStatus?.connected ? "Connected" : calendarStatus?.configured ? "Configured but not connected" : "Not configured"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Gmail: {calendarStatus?.gmail_connected ? "Connected" : "Not connected"}
              </div>
              {calendarStatus?.account_email ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Connected Google account: {calendarStatus.account_email}
                </div>
              ) : null}
              {calendarStatus?.warning ? (
                <div className="mt-1 text-xs text-amber-300">Warning: {calendarStatus.warning}</div>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                Calendar: {calendarStatus?.calendar_id || form.google_calendar_id || "primary"}
              </div>
              {calendarStatus?.next_event_at ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Next event: {formatUpdatedAt(String(calendarStatus.next_event_at))}
                </div>
              ) : null}
              {calendarStatus?.checked_at ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last check: {formatUpdatedAt(String(calendarStatus.checked_at))}
                </div>
              ) : null}
              {calendarStatus?.detail ? (
                <div className="mt-1 text-xs text-rose-400 break-all">{calendarStatus.detail}</div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Calendar ID</span>
                <input
                  type="text"
                  value={form.google_calendar_id}
                  onChange={(e) => onField("google_calendar_id", e.target.value)}
                  placeholder="primary"
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Client ID</span>
                <input
                  type="text"
                  value={form.google_client_id}
                  onChange={(e) => onField("google_client_id", e.target.value)}
                  placeholder="Google OAuth Client ID"
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Client Secret</span>
                <input
                  type="password"
                  value={form.google_client_secret}
                  onChange={(e) => onField("google_client_secret", e.target.value)}
                  placeholder={googleClientSecretSet ? "Saved (enter to replace)" : "Google OAuth Client Secret"}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Refresh Token</span>
                <input
                  type="password"
                  value={form.google_refresh_token}
                  onChange={(e) => onField("google_refresh_token", e.target.value)}
                  placeholder={googleRefreshTokenSet ? "Saved (enter to replace)" : "Google refresh token"}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded border border-border/70 bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-foreground">AI FAQ Guardrails</h2>
              <button
                type="button"
                onClick={() => setAiTestOpen(true)}
                className="rounded border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                Open AI Test Console
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Add approved Q&A so AI uses your preferred responses for common lead questions.
            </p>

            <div className="mt-3 flex items-center justify-between gap-3 rounded border border-border/70 bg-muted/30 p-3">
              <div>
                <span className="mb-1 block text-foreground font-medium">Allow AI to Quote</span>
                <p className="text-xs text-muted-foreground">
                  When enabled, AI can give age-chart based quote ranges from your configured quote rules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onField("ai_allow_quote", !form.ai_allow_quote)}
                className={`rounded px-3 py-2 text-sm ${
                  form.ai_allow_quote
                    ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                    : "border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                }`}
              >
                {form.ai_allow_quote ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <input
                type="text"
                value={newFaqQuestion}
                onChange={(e) => setNewFaqQuestion(e.target.value)}
                placeholder="Question"
                className="rounded border border-border px-3 py-2 text-sm md:col-span-2"
              />
              <input
                type="number"
                min={1}
                max={999}
                value={newFaqPriority}
                onChange={(e) => setNewFaqPriority(e.target.value)}
                placeholder="Priority"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => createFaq().catch((e) => setError(String(e?.message || "FAQ create failed")))}
                disabled={faqSaving}
                className="rounded bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-500/100 disabled:opacity-60"
              >
                {faqSaving ? "Adding..." : "Add FAQ"}
              </button>
              <textarea
                value={newFaqAnswer}
                onChange={(e) => setNewFaqAnswer(e.target.value)}
                placeholder="Approved answer"
                rows={3}
                className="rounded border border-border px-3 py-2 text-sm md:col-span-4"
              />
            </div>

            <div className="mt-3 space-y-2">
              {faqs.length === 0 ? (
                <div className="text-xs text-muted-foreground">No FAQ guardrails yet.</div>
              ) : (
                faqs.map((row) => {
                  const busy = faqBusyId === row.id;
                  return (
                    <div key={row.id} className="rounded border border-border/70 p-3 text-sm">
                      <div className="font-medium text-foreground">{row.question}</div>
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{row.answer}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Priority {row.priority}</span>
                        <span>{row.active ? "Active" : "Disabled"}</span>
                        {row.updated_at ? <span>Updated {formatUpdatedAt(row.updated_at)}</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFaqActive(row).catch((e) => setError(String(e?.message || "FAQ update failed")))}
                          disabled={busy}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
                        >
                          {row.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => editFaq(row).catch((e) => setError(String(e?.message || "FAQ edit failed")))}
                          disabled={busy}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFaq(row).catch((e) => setError(String(e?.message || "FAQ delete failed")))}
                          disabled={busy}
                          className="rounded border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {isAdmin ? (
            <section className="rounded border border-cyan-400/30 bg-cyan-500/5 p-4">
              <h2 className="text-lg font-medium text-foreground">Administrative Default Guardrails</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                These apply to all users by default. Account-level guardrails can override them when conflicts exist.
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <input
                  type="text"
                  value={newAdminFaqQuestion}
                  onChange={(e) => setNewAdminFaqQuestion(e.target.value)}
                  placeholder="Default question"
                  className="rounded border border-border px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={newAdminFaqPriority}
                  onChange={(e) => setNewAdminFaqPriority(e.target.value)}
                  placeholder="Priority"
                  className="rounded border border-border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => createAdminFaq().catch((e) => setError(String(e?.message || "Admin FAQ create failed")))}
                  disabled={adminFaqSaving}
                  className="rounded bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-500/100 disabled:opacity-60"
                >
                  {adminFaqSaving ? "Adding..." : "Add Default"}
                </button>
                <textarea
                  value={newAdminFaqAnswer}
                  onChange={(e) => setNewAdminFaqAnswer(e.target.value)}
                  placeholder="Default approved answer"
                  rows={3}
                  className="rounded border border-border px-3 py-2 text-sm md:col-span-4"
                />
              </div>

              <div className="mt-3 space-y-2">
                {adminFaqs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No administrative default guardrails yet.</div>
                ) : (
                  adminFaqs.map((row) => {
                    const busy = adminFaqBusyId === row.id;
                    return (
                      <div key={row.id} className="rounded border border-border/70 p-3 text-sm">
                        <div className="font-medium text-foreground">{row.question}</div>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{row.answer}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Priority {row.priority}</span>
                          <span>{row.active ? "Active" : "Disabled"}</span>
                          {row.updated_at ? <span>Updated {formatUpdatedAt(row.updated_at)}</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleAdminFaqActive(row).catch((e) => setError(String(e?.message || "Admin FAQ update failed")))}
                            disabled={busy}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
                          >
                            {row.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => editAdminFaq(row).catch((e) => setError(String(e?.message || "Admin FAQ edit failed")))}
                            disabled={busy}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAdminFaq(row).catch((e) => setError(String(e?.message || "Admin FAQ delete failed")))}
                            disabled={busy}
                            className="rounded border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </form>
      )}

      {textdripModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-6 md:pt-10">
          <button
            type="button"
            aria-label="Close Textdrip modal"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!textdripModalSaving) setTextdripModalOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-xl rounded border border-border/70 bg-card/70 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-foreground">Connect Textdrip SMS</h3>
              <button
                type="button"
                onClick={() => {
                  if (!textdripModalSaving) setTextdripModalOpen(false);
                }}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Only texting is connected here. Most users only need the two steps below.</p>

            <div className="mt-4 grid gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Step 1: Access Key</span>
                <input
                  type="password"
                  value={textdripDraft.apiToken}
                  onChange={(e) => setTextdripDraft((prev) => ({ ...prev, apiToken: e.target.value }))}
                  placeholder={tokenSet ? "Saved (enter to replace)" : "Paste your Textdrip access key"}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">Found in your Textdrip account API settings.</p>
              </label>
              <div className="rounded border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-muted-foreground">Platform Endpoint</div>
                <div className="mt-1 break-all">{textdripBaseUrlEffective || "Using backend default endpoint from server env."}</div>
                <p className="mt-1 text-muted-foreground">You only need to change this in advanced options if support tells you to.</p>
              </div>

              <div className="rounded border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-muted-foreground">Step 2: Inbound Callback URL</div>
                <div className="mt-1 break-all">{webhookUrl || "Save credentials first to generate callback URL."}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onCopyWebhookUrl}
                    className="rounded border border-border bg-card/70 px-2 py-1 text-xs hover:bg-muted/40"
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    onClick={onRotateWebhookSecret}
                    disabled={rotatingSecret}
                    className="rounded border border-border bg-card/70 px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
                  >
                    {rotatingSecret ? "Regenerating..." : "Regenerate Security Key"}
                  </button>
                </div>
                <p className="mt-2 text-muted-foreground">
                  Regenerate Security Key creates a new private inbound key. If you regenerate it, copy this callback URL again in Textdrip.
                </p>
              </div>

              <div className="rounded border border-border/70 p-3 text-xs">
                <button
                  type="button"
                  onClick={() => setTextdripAdvancedOpen((v) => !v)}
                  className="font-medium text-muted-foreground underline decoration-dotted underline-offset-4"
                >
                  {textdripAdvancedOpen ? "Hide advanced options" : "Show advanced options"}
                </button>
                {textdripAdvancedOpen ? (
                  <div className="mt-2 space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block text-muted-foreground">Custom Endpoint URL (optional)</span>
                      <input
                        type="text"
                        value={textdripDraft.baseUrl}
                        onChange={(e) => setTextdripDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
                        placeholder={textdripBaseUrlEffective || "Leave blank to use platform default"}
                        className="w-full rounded border border-border px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-muted-foreground">Inbound Security Key (optional)</span>
                      <input
                        type="password"
                        value={textdripDraft.webhookSecret}
                        onChange={(e) => setTextdripDraft((prev) => ({ ...prev, webhookSecret: e.target.value }))}
                        placeholder={webhookSecretSet ? "Saved (enter to replace)" : "Optional key"}
                        className="w-full rounded border border-border px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => onSaveTextdripConnect(false)}
                disabled={textdripModalSaving}
                className="rounded border border-border px-3 py-2 text-xs hover:bg-muted/40 disabled:opacity-60"
              >
                {textdripModalSaving ? "Saving..." : "Save Credentials"}
              </button>
              <button
                type="button"
                onClick={() => onSaveTextdripConnect(true)}
                disabled={textdripModalSaving}
                className="rounded bg-cyan-600 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500/100 disabled:opacity-60"
              >
                {textdripModalSaving ? "Running..." : "Save + Run Check"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {aiTestOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-6 md:pt-10">
          <button
            type="button"
            aria-label="Close AI test modal"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!aiTestBusy) setAiTestOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-2xl rounded border border-border/70 bg-card/90 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-foreground">AI Test Console</h3>
              <button
                type="button"
                onClick={() => {
                  if (!aiTestBusy) setAiTestOpen(false);
                }}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/40"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Test AI replies safely here. No SMS is sent from this console.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Quote mode for this test: {form.ai_allow_quote ? "Enabled" : "Disabled"}.
            </p>

            <div className="mt-3 h-72 overflow-y-auto rounded border border-border/70 bg-muted/30 p-3">
              {aiTestThread.length === 0 ? (
                <p className="text-xs text-muted-foreground">Start typing to test how AI will respond.</p>
              ) : (
                <div className="space-y-2">
                  {aiTestThread.map((m, idx) => (
                    <div
                      key={`${m.at}-${idx}`}
                      className={`rounded p-2 text-sm ${
                        m.role === "assistant"
                          ? "border border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                          : "border border-border/70 bg-card/70 text-foreground"
                      }`}
                    >
                      <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                        {m.role === "assistant" ? "AI" : "You"}
                      </div>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={aiTestInput}
                onChange={(e) => setAiTestInput(e.target.value)}
                placeholder="Type a lead message to test..."
                rows={3}
                className="w-full rounded border border-border px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!aiTestBusy && String(aiTestInput || "").trim()) {
                      runAiTestSend().catch((err) => setError(String(err?.message || "AI test failed")));
                    }
                  }
                }}
              />
              <div className="flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAiTestThread([])}
                  disabled={aiTestBusy || aiTestThread.length === 0}
                  className="rounded border border-border px-3 py-2 text-xs hover:bg-muted/40 disabled:opacity-60"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => runAiTestSend().catch((e) => setError(String(e?.message || "AI test failed")))}
                  disabled={aiTestBusy || !String(aiTestInput || "").trim()}
                  className="rounded bg-cyan-600 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500/100 disabled:opacity-60"
                >
                  {aiTestBusy ? "Generating..." : "Send Test Message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
