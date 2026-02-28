"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

type LeadStatus = "engaged" | "cold" | "booked" | "missed_appointment" | "sold" | "dead";

type Lead = {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lead_timezone?: string | null;
  status?: LeadStatus | string | null;
  ai_enabled?: number | null;
  ai_allow_quote_override?: number | null;
  ai_allow_aca_override?: number | null;
  auto_followup_enabled?: number | null;
  auto_followup_config?: string | null;
  appointment_reminders_enabled?: number | null;
  appointment_reminder_offsets?: string | null;
  ai_paused?: number | null;
  ai_cooldown_until?: string | null;
  ai_pause_reason?: string | null;
  notes?: string | null;
  hot?: number | null;
  archived?: number | null;
  dnc?: number | null;
};

type Msg = {
  id: number;
  lead_id: number;
  direction: "in" | "out";
  text: string;
  created_at?: string | null;
  ai_response_source?: string | null;
  ai_faq_id?: number | null;
  delivery_status?: string | null;
  delivery_status_at?: string | null;
  ai_feedback_positive?: number | null;
  ai_feedback_negative?: number | null;
};

type AutoFollowupRule = {
  enabled: boolean;
  delay_minutes: number;
  message: string;
};

type AutoFollowupConfig = {
  quote_missing_info: AutoFollowupRule;
  quoted_not_booked: AutoFollowupRule;
  no_response_hours: AutoFollowupRule;
  no_response_days: AutoFollowupRule;
  missed_appointment: AutoFollowupRule;
};

const DEFAULT_AUTO_FOLLOWUP_CONFIG: AutoFollowupConfig = {
  quote_missing_info: {
    enabled: true,
    delay_minutes: 60,
    message: "Checking in on your quote. Please share ages and genders so I can finish your estimate.",
  },
  quoted_not_booked: {
    enabled: true,
    delay_minutes: 180,
    message: "Quick follow-up on your quote range. Do you have time this morning, this afternoon, or this evening for a short call?",
  },
  no_response_hours: {
    enabled: false,
    delay_minutes: 180,
    message: "Checking in. Do you still want to continue with this?",
  },
  no_response_days: {
    enabled: false,
    delay_minutes: 1440,
    message: "Just following up. Reply when you are ready and we can keep this moving.",
  },
  missed_appointment: {
    enabled: true,
    delay_minutes: 30,
    message: "We missed you at your appointment time. Reply with a time window and I will get you rescheduled.",
  },
};

const AUTO_FOLLOWUP_RULE_META: Array<{
  key: keyof AutoFollowupConfig;
  title: string;
  description: string;
}> = [
  {
    key: "quote_missing_info",
    title: "Quote Agreed, Missing Info",
    description: "Engaged lead agreed to quote but has not shared family size/ages/genders.",
  },
  {
    key: "quoted_not_booked",
    title: "Quoted, No Appointment",
    description: "Lead received quote but has not booked an appointment.",
  },
  {
    key: "no_response_hours",
    title: "No Response (Hours)",
    description: "Lead has not replied within your selected hour-based timeline.",
  },
  {
    key: "no_response_days",
    title: "No Response (Days)",
    description: "Lead has not replied within your selected day-based timeline.",
  },
  {
    key: "missed_appointment",
    title: "Missed Appointment",
    description: "Lead missed a booked appointment and needs reschedule follow-up.",
  },
];

const AUTO_FOLLOWUP_DELAY_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
  { value: 2880, label: "48 hours" },
  { value: 4320, label: "3 days" },
  { value: 10080, label: "7 days" },
];

function normalizeReminderClockToken(input: string): string {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return "";

  const m24 = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m24) {
    const hh = String(Number(m24[1])).padStart(2, "0");
    const mm = String(m24[2]).padStart(2, "0");
    return `clock:${hh}:${mm}`;
  }

  const m12 = raw.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/);
  if (!m12) return "";
  let hour = Number(m12[1] || 0);
  const minute = Number(m12[2] || 0);
  const ampm = String(m12[3] || "");
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return "";
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `clock:${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeReminderEntryToken(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const explicitClock = raw.match(/^clock:([01]?\d|2[0-3]):([0-5]\d)$/i);
  if (explicitClock) {
    const hh = String(Number(explicitClock[1])).padStart(2, "0");
    const mm = String(explicitClock[2]).padStart(2, "0");
    return `clock:${hh}:${mm}`;
  }
  const explicitOffset = raw.match(/^offset:(\d+)$/i);
  if (explicitOffset) return `offset:${Math.floor(Number(explicitOffset[1]))}`;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return `offset:${Math.floor(numeric)}`;
  return normalizeReminderClockToken(raw);
}

function parseAppointmentReminderOffsets(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[,\s;]+/)
        .filter(Boolean);
  const out: string[] = [];
  for (const v of values) {
    const token = normalizeReminderEntryToken(v);
    if (token) out.push(token);
  }
  return Array.from(new Set(out)).sort();
}

function formatAppointmentReminderOffsetLabel(token: string) {
  const t = String(token || "").trim();
  const clock = t.match(/^clock:([01]\d|2[0-3]):([0-5]\d)$/i);
  if (clock) {
    const hh = Number(clock[1]);
    const mm = Number(clock[2]);
    const ampm = hh >= 12 ? "PM" : "AM";
    const hour12 = ((hh + 11) % 12) + 1;
    return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
  }
  const off = t.match(/^offset:(\d+)$/i);
  if (off) {
    const minutes = Math.max(1, Math.floor(Number(off[1])));
    if (minutes % (24 * 60) === 0) {
      const days = Math.floor(minutes / (24 * 60));
      return `${days} day${days === 1 ? "" : "s"} before (legacy)`;
    }
    if (minutes % 60 === 0) {
      const hours = Math.floor(minutes / 60);
      return `${hours} hour${hours === 1 ? "" : "s"} before (legacy)`;
    }
    return `${minutes} min before (legacy)`;
  }
  return t;
}

function formatTime(raw?: string | null) {
  if (!raw) return "";
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

function addMinutesToLocalInput(localValue: string, minutes: number) {
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + minutes);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

const STATUSES: LeadStatus[] = ["engaged", "cold", "booked", "missed_appointment", "sold", "dead"];

const STATUS_STYLE: Record<LeadStatus, string> = {
  engaged: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  cold: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  booked: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
  missed_appointment: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
  sold: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
  dead: "bg-rose-500/15 text-rose-300 border-rose-400/40",
};

const EMOJI_CHOICES = ["🙂", "👍", "✅", "📅", "⏰", "🙏", "🎉", "📲"];
const HISTORY_SYNC_INTERVAL_MS = 60 * 1000;

function normalizeStatus(s: any): LeadStatus {
  const v = String(s || "engaged").toLowerCase();
  if (v === "new" || v === "contacted" || v === "engaged") return "engaged";
  if (v === "cold" || v === "booked" || v === "missed_appointment" || v === "sold" || v === "dead") return v;
  return "engaged";
}

function normalizeOptionalBitToBool(value: any): boolean | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const v = String(value).trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

function clampDelayMinutes(value: any, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(7 * 24 * 60, Math.floor(n)));
}

function normalizeAutoFollowupConfig(input: any): AutoFollowupConfig {
  const src = input && typeof input === "object" ? input : {};
  const next: AutoFollowupConfig = {
    quote_missing_info: { ...DEFAULT_AUTO_FOLLOWUP_CONFIG.quote_missing_info },
    quoted_not_booked: { ...DEFAULT_AUTO_FOLLOWUP_CONFIG.quoted_not_booked },
    no_response_hours: { ...DEFAULT_AUTO_FOLLOWUP_CONFIG.no_response_hours },
    no_response_days: { ...DEFAULT_AUTO_FOLLOWUP_CONFIG.no_response_days },
    missed_appointment: { ...DEFAULT_AUTO_FOLLOWUP_CONFIG.missed_appointment },
  };
  (Object.keys(next) as Array<keyof AutoFollowupConfig>).forEach((key) => {
    const rule: any = src?.[key] || {};
    next[key] = {
      enabled: rule?.enabled === undefined ? next[key].enabled : !!rule.enabled,
      delay_minutes: clampDelayMinutes(rule?.delay_minutes, next[key].delay_minutes),
      message: String(rule?.message || next[key].message || "").slice(0, 480),
    };
  });
  return next;
}

function normalizeEmail(input: string) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

function buildGmailComposeUrl(to: string, subject?: string, authuser?: string) {
  const qs = new URLSearchParams();
  qs.set("view", "cm");
  qs.set("fs", "1");
  qs.set("to", to);
  if (authuser) qs.set("authuser", authuser);
  if (subject) qs.set("su", subject);
  return `https://mail.google.com/mail/?${qs.toString()}`;
}

type AiSignal = {
  tone: "green" | "yellow" | "red";
  label: string;
  className: string;
};

function formatCooldownCountdown(remainingMs: number) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function getAiSignal(lead: Lead | null, nowMs = Date.now()): AiSignal {
  const aiEnabled = Number(lead?.ai_enabled ?? 1) === 1;
  const aiPaused = Number(lead?.ai_paused ?? 0) === 1;
  const cooldownAt = String(lead?.ai_cooldown_until || "").trim();
  const cooldownUntil = cooldownAt ? new Date(cooldownAt) : null;
  const cooldownUntilMs = !!cooldownUntil && !Number.isNaN(cooldownUntil.getTime())
    ? cooldownUntil.getTime()
    : 0;
  const inCooldown = cooldownUntilMs > nowMs;

  if (!aiEnabled || aiPaused) {
    return {
      tone: "red",
      label: "AI Stopped",
      className: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    };
  }
  if (inCooldown) {
    return {
      tone: "yellow",
      label: `AI Cooldown ${formatCooldownCountdown(cooldownUntilMs - nowMs)}`,
      className: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    tone: "green",
    label: "AI Active",
    className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  };
}

export default function LeadThreadPage() {
  const params = useParams();
  const idParam = params?.id;
  const leadId = Array.isArray(idParam) ? idParam[0] : idParam;

  const API_BASE =
    (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
    "https://infinitedrip-backend.onrender.com";

  const [lead, setLead] = React.useState<Lead | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [error, setError] = React.useState("");
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  const [newMessage, setNewMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [showEmoji, setShowEmoji] = React.useState(false);

  const [q, setQ] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [updatingAi, setUpdatingAi] = React.useState(false);
  const [resumingAi, setResumingAi] = React.useState(false);
  const [updatingLeadQuote, setUpdatingLeadQuote] = React.useState(false);
  const [updatingLeadAca, setUpdatingLeadAca] = React.useState(false);
  const [updatingAutoFollowup, setUpdatingAutoFollowup] = React.useState(false);
  const [updatingAppointmentReminders, setUpdatingAppointmentReminders] = React.useState(false);
  const [showAutoFollowupModal, setShowAutoFollowupModal] = React.useState(false);
  const [autoFollowupDraftDirty, setAutoFollowupDraftDirty] = React.useState(false);
  const [autoFollowupDraft, setAutoFollowupDraft] = React.useState<AutoFollowupConfig | null>(null);
  const [appointmentRemindersEnabled, setAppointmentRemindersEnabled] = React.useState(false);
  const [appointmentReminderOffsets, setAppointmentReminderOffsets] = React.useState<string[]>([]);
  const [appointmentReminderValue, setAppointmentReminderValue] = React.useState("8:45AM");
  const [showAutoFollowupDefaultsSetup, setShowAutoFollowupDefaultsSetup] = React.useState(false);
  const [autoFollowupDefaultsDraft, setAutoFollowupDefaultsDraft] = React.useState<AutoFollowupConfig>(DEFAULT_AUTO_FOLLOWUP_CONFIG);
  const [loadingAutoFollowupDefaults, setLoadingAutoFollowupDefaults] = React.useState(false);
  const [savingAutoFollowupDefaults, setSavingAutoFollowupDefaults] = React.useState(false);
  const [updatingHot, setUpdatingHot] = React.useState(false);
  const [updatingArchive, setUpdatingArchive] = React.useState(false);
  const [updatingDnc, setUpdatingDnc] = React.useState(false);
  const [feedbackBusyKey, setFeedbackBusyKey] = React.useState<string | null>(null);
  const [contactEmail, setContactEmail] = React.useState("");
  const [googleConnectedEmail, setGoogleConnectedEmail] = React.useState("");
  const [googleGmailConnected, setGoogleGmailConnected] = React.useState(false);
  const [globalAllowQuote, setGlobalAllowQuote] = React.useState(false);
  const [autoFollowupEnabled, setAutoFollowupEnabled] = React.useState(false);
  const [autoFollowupConfig, setAutoFollowupConfig] = React.useState<AutoFollowupConfig>(DEFAULT_AUTO_FOLLOWUP_CONFIG);

  const [notesDraft, setNotesDraft] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  const [bookingStart, setBookingStart] = React.useState("");
  const [bookingEnd, setBookingEnd] = React.useState("");
  const [bookingTitle, setBookingTitle] = React.useState("");
  const [bookingDescription, setBookingDescription] = React.useState("");
  const [bookingBusy, setBookingBusy] = React.useState(false);

  const threadScrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const autoFollowupModalOpenRef = React.useRef(false);
  const autoFollowupDraftDirtyRef = React.useRef(false);
  const lastHistorySyncAtRef = React.useRef(0);
  const historySyncInFlightRef = React.useRef(false);
  const threadLoadInFlightRef = React.useRef(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function loadThread() {
    if (!leadId) return;

    const lr = await apiFetch(`${API_BASE}/api/leads?include_archived=1`, { cache: "no-store" });
    const ldata = await lr.json();
    const list: Lead[] = Array.isArray(ldata) ? ldata : ldata?.leads ?? [];
    const found = list.find((x) => String(x.id) === String(leadId)) || null;

    setLead(found);
    if (found) {
      if (!autoFollowupModalOpenRef.current || !autoFollowupDraftDirtyRef.current) {
        setAutoFollowupEnabled(Number(found.auto_followup_enabled || 0) === 1);
        try {
          const parsed = JSON.parse(String(found.auto_followup_config || "{}"));
          setAutoFollowupConfig(normalizeAutoFollowupConfig(parsed));
        } catch {
          setAutoFollowupConfig(normalizeAutoFollowupConfig({}));
        }
      }
      if (!autoFollowupModalOpenRef.current) {
        setAppointmentRemindersEnabled(Number(found.appointment_reminders_enabled || 0) === 1);
        setAppointmentReminderOffsets(parseAppointmentReminderOffsets(found.appointment_reminder_offsets));
      }
    }

    if (found && typeof found.notes === "string") {
      setNotesDraft((prev) => (prev === "" ? found.notes || "" : prev));
    }

    const mr = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages`, { cache: "no-store" });
    const mdata = await mr.json();
    const msgs: Msg[] = Array.isArray(mdata) ? mdata : mdata?.messages ?? [];
    setMessages(msgs);
  }

  async function syncThreadHistory() {
    if (!leadId || historySyncInFlightRef.current) return;
    historySyncInFlightRef.current = true;
    try {
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages/sync`, {
        method: "POST",
      });
      lastHistorySyncAtRef.current = Date.now();
      if (r.ok) {
        await loadThread();
      }
    } catch {
      lastHistorySyncAtRef.current = Date.now();
    } finally {
      historySyncInFlightRef.current = false;
    }
  }

  React.useEffect(() => {
    autoFollowupModalOpenRef.current = showAutoFollowupModal;
  }, [showAutoFollowupModal]);

  React.useEffect(() => {
    autoFollowupDraftDirtyRef.current = autoFollowupDraftDirty;
  }, [autoFollowupDraftDirty]);

  React.useEffect(() => {
    if (!leadId) return;
    lastHistorySyncAtRef.current = 0;
    historySyncInFlightRef.current = false;
    threadLoadInFlightRef.current = false;
    try {
      const stored = window.localStorage.getItem(`lead_email_${String(leadId)}`) || "";
      const normalized = normalizeEmail(stored);
      if (normalized) setContactEmail(normalized);
    } catch {}

    let dead = false;

    async function tick() {
      if (threadLoadInFlightRef.current) return;
      threadLoadInFlightRef.current = true;
      try {
        await loadThread();
        const shouldSyncHistory = (
          lastHistorySyncAtRef.current === 0 ||
          (Date.now() - lastHistorySyncAtRef.current) >= HISTORY_SYNC_INTERVAL_MS
        );
        if (shouldSyncHistory) {
          void syncThreadHistory();
        }
        if (!dead) setError("");
      } catch {
        if (!dead) setError("Load failed");
      } finally {
        threadLoadInFlightRef.current = false;
      }
    }

    tick();
    const t = setInterval(tick, 1000);

    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [leadId, API_BASE]);

  React.useEffect(() => {
    const emailFromLead = normalizeEmail(String(lead?.email || ""));
    if (!emailFromLead) return;
    setContactEmail((prev) => prev || emailFromLead);
  }, [lead?.email]);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/api/integrations/google/status`, { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json().catch(() => ({}));
        const status = body?.status || {};
        if (dead) return;
        setGoogleGmailConnected(!!status?.gmail_connected);
        setGoogleConnectedEmail(normalizeEmail(String(status?.account_email || "")));
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, [API_BASE]);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/api/settings`, { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json().catch(() => ({}));
        const settings = body?.settings || {};
        if (dead) return;
        setGlobalAllowQuote(!!settings?.ai_allow_quote);
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, [API_BASE]);

  React.useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, leadId]);

  function insertEmoji(value: string) {
    setNewMessage((prev) => `${prev}${value}`);
    setShowEmoji(false);
  }

  function openImagePicker() {
    fileInputRef.current?.click();
  }

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("image", file);

      const r = await apiFetch(`${API_BASE}/api/uploads/image`, {
        method: "POST",
        body,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) {
        throw new Error(String(data?.error || "upload_failed"));
      }
      setMediaUrl(String(data.url));
    } catch (err: any) {
      alert(`Image upload failed: ${String(err?.message || err)}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSend() {
    if ((!newMessage.trim() && !mediaUrl) || !leadId) return;
    if (Number(lead?.dnc ?? 0) === 1) {
      alert("DNC is enabled for this lead. Sending is disabled.");
      return;
    }

    try {
      setSending(true);

      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage, media_url: mediaUrl || undefined }),
      });

      if (!r.ok) throw new Error("Send failed");

      setNewMessage("");
      setMediaUrl("");
      await loadThread();
    } catch (e: any) {
      const msg = e?.message || "unknown error";
      alert("Send failed: " + msg);
    } finally {
      setSending(false);
    }
  }

  async function handleAiFeedbackToggle(msg: Msg, feedbackType: "positive" | "negative") {
    if (!leadId) return;
    if (String(msg?.direction || "").toLowerCase() !== "out") return;
    const nextActive = feedbackType === "positive"
      ? Number(msg?.ai_feedback_positive || 0) !== 1
      : Number(msg?.ai_feedback_negative || 0) !== 1;
    const busyKey = `${Number(msg.id)}:${feedbackType}`;
    try {
      setFeedbackBusyKey(busyKey);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages/${msg.id}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_type: feedbackType,
          active: nextActive,
        }),
      });
      if (!r.ok) throw new Error("Feedback save failed");
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(msg.id)
            ? {
                ...m,
                ai_feedback_positive:
                  feedbackType === "positive"
                    ? (nextActive ? 1 : 0)
                    : Number(m.ai_feedback_positive || 0),
                ai_feedback_negative:
                  feedbackType === "negative"
                    ? (nextActive ? 1 : 0)
                    : Number(m.ai_feedback_negative || 0),
              }
            : m
        )
      );
    } catch {
      alert("Could not save AI feedback");
    } finally {
      setFeedbackBusyKey(null);
    }
  }

  async function handleBookAppointment() {
    if (!leadId) return;
    if (!bookingStart) {
      alert("Please pick a start date/time.");
      return;
    }

    const resolvedEnd = bookingEnd || addMinutesToLocalInput(bookingStart, 30);
    if (!resolvedEnd) {
      alert("Please provide a valid end date/time.");
      return;
    }

    const start = new Date(bookingStart);
    const end = new Date(resolvedEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      alert("End time must be after start time.");
      return;
    }

    try {
      setBookingBusy(true);
      const r = await apiFetch(`${API_BASE}/api/appointments/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: Number(leadId),
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          summary: bookingTitle.trim() || `Appointment - ${lead?.name || lead?.phone || "Lead"}`,
          description: bookingDescription.trim(),
          timeZone:
            String(lead?.lead_timezone || "").trim() ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "America/New_York",
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        throw new Error(String(data?.error || "booking_failed"));
      }

      setBookingEnd(resolvedEnd);
      alert("Appointment created. Lead status updated to booked.");
      await loadThread();
    } catch (e: any) {
      alert(`Booking failed: ${String(e?.message || e)}`);
    } finally {
      setBookingBusy(false);
    }
  }

  async function handleStatusChange(next: LeadStatus) {
    if (!leadId) return;

    try {
      setUpdatingStatus(true);

      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!r.ok) throw new Error("Status update failed");

      await loadThread();
    } catch {
      alert("Status update failed");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAiToggle(enabled: boolean) {
    if (!leadId) return;

    try {
      setUpdatingAi(true);

      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });

      if (!r.ok) throw new Error("AI toggle failed");

      await loadThread();
    } catch {
      alert("AI toggle failed");
    } finally {
      setUpdatingAi(false);
    }
  }

  async function handleResumeAi() {
    if (!leadId) return;
    try {
      setResumingAi(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/ai/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivate: true }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body?.ok) throw new Error(String(body?.error || "AI resume failed"));

      const reason = String(body?.result?.reason || "");
      if (reason === "replied") {
        alert("AI resumed and sent a reply.");
      } else if (body?.queued) {
        alert("AI resume queued. It will continue automatically.");
      } else if (reason === "no_pending_inbound") {
        alert("AI resumed. There is no pending inbound message right now.");
      } else {
        alert(`AI resume completed: ${reason || "ok"}`);
      }
      await loadThread();
    } catch {
      alert("AI resume failed");
    } finally {
      setResumingAi(false);
    }
  }

  async function handleLeadQuoteToggle() {
    if (!leadId) return;
    const override = normalizeOptionalBitToBool(lead?.ai_allow_quote_override);
    const effective = override === null ? globalAllowQuote : override;
    try {
      setUpdatingLeadQuote(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/quote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !effective }),
      });
      if (!r.ok) throw new Error("Quote toggle failed");
      const updated = await r.json().catch(() => ({}));
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch {
      alert("Quote toggle failed");
    } finally {
      setUpdatingLeadQuote(false);
    }
  }

  async function handleLeadAcaToggle() {
    if (!leadId) return;
    const override = normalizeOptionalBitToBool(lead?.ai_allow_aca_override);
    const effective = override === null ? true : override;
    try {
      setUpdatingLeadAca(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/aca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !effective }),
      });
      if (!r.ok) throw new Error("ACA toggle failed");
      const updated = await r.json().catch(() => ({}));
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch {
      alert("ACA toggle failed");
    } finally {
      setUpdatingLeadAca(false);
    }
  }

  async function handleAutoFollowupToggle(nextEnabled: boolean) {
    if (!leadId) return;
    try {
      setUpdatingAutoFollowup(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/auto-followup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!r.ok) throw new Error("Automatic follow-up toggle failed");
      const body = await r.json().catch(() => ({}));
      setAutoFollowupEnabled(!!body?.enabled);
      setAutoFollowupConfig(normalizeAutoFollowupConfig(body?.config || autoFollowupConfig));
      setLead((prev) =>
        prev
          ? {
              ...prev,
              auto_followup_enabled: body?.enabled ? 1 : 0,
              auto_followup_config: JSON.stringify(normalizeAutoFollowupConfig(body?.config || autoFollowupConfig)),
            }
          : prev
      );
      setAutoFollowupDraft(null);
      autoFollowupDraftDirtyRef.current = false;
      setAutoFollowupDraftDirty(false);
    } catch {
      alert("Automatic follow-up toggle failed");
    } finally {
      setUpdatingAutoFollowup(false);
    }
  }

  async function saveAutoFollowupConfig() {
    if (!leadId) return;
    try {
      setUpdatingAutoFollowup(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/auto-followup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoFollowupEnabled,
          config: autoFollowupDraft || autoFollowupConfig,
        }),
      });
      if (!r.ok) throw new Error("Automatic follow-up save failed");
      const body = await r.json().catch(() => ({}));
      setAutoFollowupEnabled(!!body?.enabled);
      setAutoFollowupConfig(normalizeAutoFollowupConfig(body?.config || autoFollowupConfig));
      setLead((prev) =>
        prev
          ? {
              ...prev,
              auto_followup_enabled: body?.enabled ? 1 : 0,
              auto_followup_config: JSON.stringify(normalizeAutoFollowupConfig(body?.config || autoFollowupConfig)),
            }
          : prev
      );
      setAutoFollowupDraft(null);
      autoFollowupDraftDirtyRef.current = false;
      setAutoFollowupDraftDirty(false);
      setShowAutoFollowupModal(false);
    } catch {
      alert("Automatic follow-up save failed");
    } finally {
      setUpdatingAutoFollowup(false);
    }
  }

  function addAppointmentReminderOffset() {
    const token = normalizeReminderEntryToken(appointmentReminderValue);
    if (!token) return;
    setAppointmentReminderOffsets((prev) => Array.from(new Set([...prev, token])).sort());
    setAppointmentReminderValue("");
  }

  function removeAppointmentReminderOffset(token: string) {
    const normalized = normalizeReminderEntryToken(token);
    if (!normalized) return;
    setAppointmentReminderOffsets((prev) => prev.filter((x) => x !== normalized));
  }

  async function openAutoFollowupDefaultsSetup() {
    try {
      setLoadingAutoFollowupDefaults(true);
      const r = await apiFetch(`${API_BASE}/api/auto-followup/defaults`, { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        setAutoFollowupDefaultsDraft(normalizeAutoFollowupConfig(body?.config || {}));
      }
      setShowAutoFollowupDefaultsSetup(true);
    } catch {
      setAutoFollowupDefaultsDraft(normalizeAutoFollowupConfig({}));
      setShowAutoFollowupDefaultsSetup(true);
    } finally {
      setLoadingAutoFollowupDefaults(false);
    }
  }

  function updateAutoFollowupDefaultRule(
    key: keyof AutoFollowupConfig,
    patch: Partial<AutoFollowupRule>
  ) {
    setAutoFollowupDefaultsDraft((prev) => {
      const base = normalizeAutoFollowupConfig(prev);
      const nextRule = {
        ...base[key],
        ...patch,
      };
      if (patch.delay_minutes !== undefined) {
        nextRule.delay_minutes = clampDelayMinutes(patch.delay_minutes, base[key].delay_minutes);
      }
      if (patch.message !== undefined) {
        nextRule.message = String(patch.message || "").slice(0, 480);
      }
      return {
        ...base,
        [key]: nextRule,
      };
    });
  }

  async function saveAutoFollowupDefaultsSetup() {
    try {
      setSavingAutoFollowupDefaults(true);
      const r = await apiFetch(`${API_BASE}/api/auto-followup/defaults`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: autoFollowupDefaultsDraft,
          apply_to_all: true,
        }),
      });
      if (!r.ok) throw new Error("Save failed");
      const body = await r.json().catch(() => ({}));
      const normalized = normalizeAutoFollowupConfig(body?.config || autoFollowupDefaultsDraft);
      setAutoFollowupDefaultsDraft(normalized);
      setAutoFollowupConfig(normalized);
      setAutoFollowupDraft(normalizeAutoFollowupConfig(normalized));
      setLead((prev) =>
        prev
          ? {
              ...prev,
              auto_followup_config: JSON.stringify(normalized),
            }
          : prev
      );
      setShowAutoFollowupDefaultsSetup(false);
    } catch {
      alert("Automatic follow-up defaults save failed");
    } finally {
      setSavingAutoFollowupDefaults(false);
    }
  }

  async function saveAppointmentReminders() {
    if (!leadId) return;
    try {
      setUpdatingAppointmentReminders(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/appointment-reminders`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: appointmentRemindersEnabled,
          times: appointmentReminderOffsets,
        }),
      });
      if (!r.ok) throw new Error("Appointment reminders save failed");
      const body = await r.json().catch(() => ({}));
      const enabled = !!body?.enabled;
      const offsets = parseAppointmentReminderOffsets(body?.offsets);
      setAppointmentRemindersEnabled(enabled);
      setAppointmentReminderOffsets(offsets);
      setLead((prev) =>
        prev
          ? {
              ...prev,
              appointment_reminders_enabled: enabled ? 1 : 0,
              appointment_reminder_offsets: offsets.join(","),
            }
          : prev
      );
    } catch {
      alert("Appointment reminders save failed");
    } finally {
      setUpdatingAppointmentReminders(false);
    }
  }

  async function handleHotToggle(nextHot: boolean) {
    if (!leadId) return;
    try {
      setUpdatingHot(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/hot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hot: nextHot }),
      });
      if (!r.ok) throw new Error("Hot toggle failed");
      await loadThread();
    } catch {
      alert("Hot toggle failed");
    } finally {
      setUpdatingHot(false);
    }
  }

  async function handleArchiveToggle(nextArchived: boolean) {
    if (!leadId) return;
    try {
      setUpdatingArchive(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/archive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      if (!r.ok) throw new Error("Archive toggle failed");
      await loadThread();
    } catch {
      alert("Archive toggle failed");
    } finally {
      setUpdatingArchive(false);
    }
  }

  async function handleDncToggle(nextDnc: boolean) {
    if (!leadId) return;
    try {
      setUpdatingDnc(true);
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/dnc`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextDnc }),
      });
      if (!r.ok) throw new Error("DNC toggle failed");
      await loadThread();
    } catch {
      alert("DNC toggle failed");
    } finally {
      setUpdatingDnc(false);
    }
  }

  async function saveNotes() {
    if (!leadId) return;

    try {
      setSavingNotes(true);

      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });

      if (!r.ok) throw new Error("Notes save failed");

      await loadThread();
    } catch {
      alert("Notes save failed");
    } finally {
      setSavingNotes(false);
    }
  }

  function saveContactEmail(value: string) {
    const normalized = normalizeEmail(value);
    if (!normalized) return false;
    setContactEmail(normalized);
    if (leadId) {
      try {
        window.localStorage.setItem(`lead_email_${String(leadId)}`, normalized);
      } catch {}
    }
    return true;
  }

  function openGmailCompose() {
    let to = normalizeEmail(contactEmail || String(lead?.email || ""));
    if (!to) {
      const typed = window.prompt("Enter lead email address");
      to = normalizeEmail(String(typed || ""));
      if (!to) {
        alert("Please enter a valid email address.");
        return;
      }
      saveContactEmail(to);
    }
    const subject = `InfiniteDrip - ${String(lead?.name || lead?.phone || "Lead")}`;
    const url = buildGmailComposeUrl(to, subject, googleConnectedEmail || undefined);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(term));
  }, [messages, q]);

  const currentStatus = normalizeStatus(lead?.status);
  const statusStyle = STATUS_STYLE[currentStatus];
  const aiOn = (lead?.ai_enabled ?? 1) === 1;
  const aiSignal = React.useMemo(() => getAiSignal(lead, nowMs), [lead, nowMs]);
  const aiCooldownCountdown = aiSignal.tone === "yellow"
    ? String(aiSignal.label || "").replace(/^AI Cooldown\s*/, "")
    : "";
  const quoteOverride = normalizeOptionalBitToBool(lead?.ai_allow_quote_override);
  const quoteEffective = quoteOverride === null ? globalAllowQuote : quoteOverride;
  const acaOverride = normalizeOptionalBitToBool(lead?.ai_allow_aca_override);
  const acaEffective = acaOverride === null ? true : acaOverride;
  const autoFollowupOn = !!autoFollowupEnabled;
  const hot = Number(lead?.hot ?? 0) === 1;
  const archived = Number(lead?.archived ?? 0) === 1;
  const dnc = Number(lead?.dnc ?? 0) === 1;
  const leadCity = String(lead?.city || "").trim();
  const leadState = String(lead?.state || "").trim();
  const leadZip = String(lead?.zip || "").trim();
  const leadTz = String(lead?.lead_timezone || "").trim();
  const leadLocation = [[leadCity, leadState].filter(Boolean).join(", "), leadZip].filter(Boolean).join(" ").trim();
  const leadLocationLine = [leadLocation, leadTz ? `(${leadTz})` : ""].filter(Boolean).join(" ");
  const autoFollowupModalConfig = autoFollowupDraft || autoFollowupConfig;

  function updateAutoFollowupRule(
    key: keyof AutoFollowupConfig,
    patch: Partial<AutoFollowupRule>
  ) {
    autoFollowupDraftDirtyRef.current = true;
    setAutoFollowupDraftDirty(true);
    setAutoFollowupDraft((prev) => {
      const base = prev || autoFollowupConfig;
      return {
        ...base,
        [key]: {
          ...base[key],
          ...patch,
        },
      };
    });
  }

  return (
    <div className="mx-auto flex h-[88vh] w-full max-w-[1560px] flex-col rounded-2xl border border-border/70 bg-card/40 p-4 shadow-xl backdrop-blur-sm md:p-6">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/leads" className="text-cyan-400 underline decoration-cyan-500/40">
          ← Back
        </Link>

        <div className="text-sm text-muted-foreground">Lead #{leadId}</div>

        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold leading-tight">{lead?.name || lead?.phone || "Lead"}</div>
            {archived ? (
              <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-300">
                Archived
              </span>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">{lead?.phone}</div>
          <div className="text-xs text-muted-foreground">{leadLocationLine}</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              onBlur={(e) => {
                const value = String(e.target.value || "").trim();
                if (!value) return;
                if (!saveContactEmail(value)) {
                  alert("Invalid email format.");
                }
              }}
              placeholder="lead@email.com"
              className="w-64 max-w-full border rounded px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const value = String(contactEmail || "").trim();
                if (value && !saveContactEmail(value)) {
                  alert("Invalid email format.");
                  return;
                }
                openGmailCompose();
              }}
              className="rounded border border-border bg-card/70 px-2 py-1.5 text-sm hover:bg-muted/40"
              title="Open Gmail compose"
            >
              Email via Gmail
            </button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {googleGmailConnected
              ? `Connected Google account: ${googleConnectedEmail || "connected"}`
              : "Tip: Connect Google in Settings to align Gmail + Calendar on one account."}
          </div>
        </div>

        <div className="flex max-w-[440px] flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleHotToggle(!hot)}
            disabled={updatingHot}
            className={`rounded border px-2 py-1 text-sm ${
              hot ? "border-orange-400/40 bg-orange-500/15 text-orange-200" : "bg-card/70 border-border text-muted-foreground"
            }`}
            title={hot ? "Unset hot" : "Set hot"}
          >
            🔥 {hot ? "Hot" : "Not hot"}
          </button>
          <button
            type="button"
            onClick={() => handleArchiveToggle(!archived)}
            disabled={updatingArchive}
            className={`rounded border px-2 py-1 text-sm ${
              archived ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300" : "bg-card/70 border-border text-muted-foreground"
            }`}
            title={archived ? "Unarchive lead" : "Archive lead"}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3">
        <aside className="order-2 lg:order-2 min-h-0 overflow-y-auto pr-1 space-y-3">
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-rose-200">Do Not Contact</div>
              <button
                type="button"
                onClick={() => handleDncToggle(!dnc)}
                disabled={updatingDnc}
                className={`rounded border px-3 py-1 text-xs ${
                  dnc
                    ? "border-rose-400/50 bg-rose-600/25 text-rose-100"
                    : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                }`}
              >
                {updatingDnc ? "Saving..." : dnc ? "DNC ENABLED" : "DNC DISABLED"}
              </button>
            </div>
            <div className="text-xs text-rose-200/90">
              When enabled, message sending is locked for this lead.
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-card/70 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Notes</div>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="border rounded px-3 py-1 text-sm"
              >
                {savingNotes ? "Saving..." : "Save"}
              </button>
            </div>

            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add notes about this lead..."
              className="w-full border rounded p-2 text-sm h-28"
            />
          </div>

          <div className="rounded-lg border border-border/70 bg-card/70 p-3 shadow-sm">
            <div className="text-sm font-medium mb-2">Book Appointment</div>
            <div className="mb-2 text-xs text-muted-foreground">
              Lead timezone: {leadTz || "Not detected (using your browser timezone)"}
            </div>
            <div className="grid gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Start</span>
                <input
                  type="datetime-local"
                  value={bookingStart}
                  onChange={(e) => setBookingStart(e.target.value)}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">End</span>
                <input
                  type="datetime-local"
                  value={bookingEnd}
                  onChange={(e) => setBookingEnd(e.target.value)}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Title</span>
                <input
                  type="text"
                  value={bookingTitle}
                  onChange={(e) => setBookingTitle(e.target.value)}
                  placeholder={`Appointment - ${lead?.name || lead?.phone || "Lead"}`}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Description (optional)</span>
                <textarea
                  value={bookingDescription}
                  onChange={(e) => setBookingDescription(e.target.value)}
                  className="w-full border rounded px-2 py-2 h-20"
                />
              </label>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleBookAppointment}
                disabled={bookingBusy}
                className="rounded bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-500"
              >
                {bookingBusy ? "Booking..." : "Book + Mark Booked"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-card/70 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Automatic Followup</div>
              <button
                type="button"
                onClick={() => handleAutoFollowupToggle(!autoFollowupOn)}
                disabled={updatingAutoFollowup}
                className={`rounded border px-3 py-1 text-xs ${
                  autoFollowupOn
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-200"
                }`}
              >
                {updatingAutoFollowup ? "Saving..." : autoFollowupOn ? "Enabled" : "Disabled"}
              </button>
            </div>
            <div className="mb-2 text-xs text-muted-foreground">
              Configure per-lead timing and message for quote followups and missed appointments.
            </div>
            <button
              type="button"
              onClick={() => {
                setAutoFollowupDraft(normalizeAutoFollowupConfig(autoFollowupConfig));
                autoFollowupDraftDirtyRef.current = false;
                setAutoFollowupDraftDirty(false);
                setShowAutoFollowupDefaultsSetup(false);
                setShowAutoFollowupModal(true);
              }}
              disabled={updatingAutoFollowup}
              className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/25"
            >
              Configure Automatic Followup
            </button>
          </div>
        </aside>

        <section className="order-1 lg:order-1 min-h-0 flex flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="text-sm text-muted-foreground">Status</div>
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={updatingStatus}
              className={`border rounded px-2 py-1.5 text-sm ${statusStyle}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleAiToggle(!aiOn)}
              disabled={updatingAi}
              className={`rounded border px-3 py-1.5 text-sm ${
                aiOn
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/15 text-rose-200"
              }`}
            >
              {updatingAi
                ? "Saving..."
                : aiOn
                  ? (aiCooldownCountdown ? `AI Enabled (${aiCooldownCountdown})` : "AI Enabled")
                  : "AI Disabled"}
            </button>
            <button
              type="button"
              onClick={handleResumeAi}
              disabled={resumingAi}
              className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-200"
              title="Re-activate AI and continue from pending inbound"
            >
              {resumingAi ? "Resuming..." : "Resume AI"}
            </button>
            <button
              type="button"
              onClick={handleLeadQuoteToggle}
              disabled={updatingLeadQuote}
              className={`rounded border px-3 py-1.5 text-sm ${
                quoteEffective
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/15 text-rose-200"
              }`}
              title="Enable/disable quote mode for this lead"
            >
              {updatingLeadQuote ? "Saving..." : `$ QUOTE ${quoteEffective ? "ENABLED" : "DISABLED"}`}
            </button>
            <button
              type="button"
              onClick={handleLeadAcaToggle}
              disabled={updatingLeadAca}
              className={`rounded border px-3 py-1.5 text-sm ${
                acaEffective
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/15 text-rose-200"
              }`}
              title="Enable/disable ACA subsidy branch for this lead"
            >
              {updatingLeadAca ? "Saving..." : `ACA ${acaEffective ? "ENABLED" : "DISABLED"}`}
            </button>
            <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${aiSignal.className}`}>
              <span aria-hidden="true">
                {aiSignal.tone === "green" ? "🟢" : aiSignal.tone === "yellow" ? "🟡" : "🔴"}
              </span>
              {aiSignal.label}
            </span>
          </div>

          <div className="mb-2 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search this conversation…"
              className="flex-1 border rounded px-3 py-2"
            />
            {q ? (
              <button onClick={() => setQ("")} className="border rounded px-3 py-2">
                Clear
              </button>
            ) : null}
          </div>

          <div ref={threadScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 mb-3 pr-1">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground">{q.trim() ? "No matches." : "No messages yet."}</div>
            ) : (
              filtered.map((m) => {
                const isFaqGuardrail = String(m.ai_response_source || "").toLowerCase() === "faq_guardrail";
                return (
                  <div
                    key={m.id}
                    className={`border rounded-lg p-3 shadow-sm ${m.direction === "out" ? "bg-cyan-500/10 ml-8" : "bg-card/70 mr-8"}`}
                  >
                  <div className="flex justify-between mb-1 text-xs">
                    <div className="font-medium flex items-center gap-2">
                      <span>{m.direction === "in" ? "Inbound" : "Outbound"}</span>
                      {m.direction === "out" && isFaqGuardrail ? (
                        <span className="rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200">
                          FAQ Guardrail
                        </span>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground">{formatTime(m.created_at)}</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {m.direction === "out" && m.delivery_status ? (
                        <div className="mb-1 text-[11px] text-muted-foreground">
                          Delivery: {String(m.delivery_status)}
                          {m.delivery_status_at ? ` (${formatTime(m.delivery_status_at)})` : ""}
                        </div>
                      ) : null}
                      <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                    </div>
                    {m.direction === "out" ? (
                      <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleAiFeedbackToggle(m, "positive")}
                          disabled={feedbackBusyKey === `${Number(m.id)}:positive`}
                          className={`rounded border px-2 py-0.5 text-[10px] leading-tight ${
                            Number(m.ai_feedback_positive || 0) === 1
                              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                              : "border-border bg-card/70 text-muted-foreground hover:bg-muted/40"
                          } disabled:opacity-60`}
                          title={isFaqGuardrail ? "Mark this FAQ guardrail reply as great" : "Mark this AI reply as great"}
                        >
                          {feedbackBusyKey === `${Number(m.id)}:positive`
                            ? "Saving..."
                            : Number(m.ai_feedback_positive || 0) === 1
                              ? (isFaqGuardrail ? "👍 FAQ Great Saved" : "👍 Great Saved")
                              : (isFaqGuardrail ? "👍 FAQ Great" : "👍 Great Reply")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAiFeedbackToggle(m, "negative")}
                          disabled={feedbackBusyKey === `${Number(m.id)}:negative`}
                          className={`rounded border px-2 py-0.5 text-[10px] leading-tight ${
                            Number(m.ai_feedback_negative || 0) === 1
                              ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                              : "border-border bg-card/70 text-muted-foreground hover:bg-muted/40"
                          } disabled:opacity-60`}
                          title={isFaqGuardrail ? "Mark this FAQ guardrail reply as poor for review" : "Mark this AI reply as poor for review"}
                        >
                          {feedbackBusyKey === `${Number(m.id)}:negative`
                            ? "Saving..."
                            : Number(m.ai_feedback_negative || 0) === 1
                              ? (isFaqGuardrail ? "💩 FAQ Shit Saved" : "💩 Shit Saved")
                              : (isFaqGuardrail ? "💩 FAQ Shit" : "💩 Shit Reply")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t pt-3">
            {mediaUrl ? (
              <div className="mb-2 rounded border border-border/70 p-2 flex items-center justify-between gap-3">
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm text-cyan-400 underline truncate">
                  Attached image
                </a>
                <button
                  type="button"
                  onClick={() => setMediaUrl("")}
                  className="text-xs border rounded px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ) : null}

            {showEmoji ? (
              <div className="mb-2 rounded border border-border/70 p-2 flex flex-wrap gap-2 bg-card/70">
                {EMOJI_CHOICES.map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    onClick={() => insertEmoji(emo)}
                    className="border rounded px-2 py-1 text-lg leading-none hover:bg-muted/40"
                  >
                    {emo}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={dnc ? "DNC enabled - messaging disabled" : (mediaUrl ? "Optional caption..." : "Type a message...")}
                rows={2}
                disabled={dnc}
                className={`flex-1 border rounded px-3 py-2 resize-y ${
                  dnc
                    ? "border-rose-400/60 bg-rose-500/10 text-rose-100 placeholder:text-rose-200/70"
                    : ""
                }`}
                onKeyDown={(e) => {
                  if (dnc) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sending) handleSend();
                  }
                }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleImageSelected}
                className="hidden"
              />

              <button
                type="button"
                onClick={openImagePicker}
                disabled={dnc || uploadingImage || sending}
                className="border px-3 py-2 rounded"
                title="Upload image"
              >
                {uploadingImage ? "Uploading..." : "📷"}
              </button>

              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                disabled={dnc || sending}
                className="border px-3 py-2 rounded"
                title="Emoji"
              >
                😊
              </button>

              <button
                onClick={handleSend}
                disabled={dnc || sending || (!newMessage.trim() && !mediaUrl)}
                className={`px-4 py-2 rounded text-white ${
                  dnc ? "bg-rose-700/70 cursor-not-allowed" : "bg-cyan-600"
                }`}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {showAutoFollowupModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border/80 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold">Automatic Followup</div>
                <button
                  type="button"
                  onClick={openAutoFollowupDefaultsSetup}
                  disabled={loadingAutoFollowupDefaults}
                  className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-200"
                  title="Set default automatic follow-up rules for all leads"
                >
                  {loadingAutoFollowupDefaults ? "Loading..." : "Setup"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAutoFollowupDraft(null);
                  autoFollowupDraftDirtyRef.current = false;
                  setAutoFollowupDraftDirty(false);
                  setShowAutoFollowupModal(false);
                  setShowAutoFollowupDefaultsSetup(false);
                }}
                className="rounded border border-border px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>
            <div className="mb-3 text-xs text-muted-foreground">
              Set follow-up message type and delay for each scenario. Messages send exactly as written.
              Countdown tracking is internal and resets when the lead replies.
            </div>

            {showAutoFollowupDefaultsSetup ? (
              <div className="mb-3 rounded border border-cyan-400/40 bg-cyan-500/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-cyan-100">Default for All Leads</div>
                    <div className="text-xs text-cyan-200/80">
                      Save once to apply as your account-wide baseline. Per-lead edits can still override.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={saveAutoFollowupDefaultsSetup}
                    disabled={savingAutoFollowupDefaults}
                    className="rounded border border-emerald-400/40 bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-70"
                  >
                    {savingAutoFollowupDefaults ? "Saving..." : "Save Defaults"}
                  </button>
                </div>
                <div className="space-y-3">
                  {AUTO_FOLLOWUP_RULE_META.map(({ key, title }) => {
                    const rule = autoFollowupDefaultsDraft[key];
                    return (
                      <div key={`defaults_${key}`} className="rounded border border-cyan-300/20 bg-slate-900/40 p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-cyan-100">{title}</div>
                          <button
                            type="button"
                            onClick={() => updateAutoFollowupDefaultRule(key, { enabled: !rule.enabled })}
                            className={`rounded border px-2 py-0.5 text-[11px] ${
                              rule.enabled
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                                : "border-rose-400/40 bg-rose-500/15 text-rose-200"
                            }`}
                          >
                            {rule.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[170px_1fr]">
                          <select
                            value={rule.delay_minutes}
                            onChange={(e) =>
                              updateAutoFollowupDefaultRule(key, {
                                delay_minutes: clampDelayMinutes(e.target.value, rule.delay_minutes),
                              })
                            }
                            className="rounded border px-2 py-1.5 text-xs"
                          >
                            {AUTO_FOLLOWUP_DELAY_OPTIONS.map((opt) => (
                              <option key={`def_${key}_${opt.value}`} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={rule.message}
                            onChange={(e) =>
                              updateAutoFollowupDefaultRule(key, {
                                message: String(e.target.value || "").slice(0, 480),
                              })
                            }
                            className="rounded border px-2 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mb-3 rounded border border-border/70 bg-card/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Auto-text Appointment Reminders</div>
                  <div className="text-xs text-muted-foreground">
                    Independent from Automatic Followup. Add specific reminder times like 8:45AM.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAppointmentRemindersEnabled((v) => !v)}
                  className={`rounded border px-3 py-1 text-xs ${
                    appointmentRemindersEnabled
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-rose-400/40 bg-rose-500/15 text-rose-200"
                  }`}
                >
                  {appointmentRemindersEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="mb-2 flex flex-wrap gap-2">
                {appointmentReminderOffsets.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No active reminder times.</span>
                ) : (
                  appointmentReminderOffsets.map((offset) => (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => removeAppointmentReminderOffset(offset)}
                      className="rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200"
                      title="Remove time"
                    >
                      {formatAppointmentReminderOffsetLabel(offset)} ×
                    </button>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={appointmentReminderValue}
                  onChange={(e) => setAppointmentReminderValue(e.target.value)}
                  placeholder="8:45AM"
                  className="w-24 rounded border px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={addAppointmentReminderOffset}
                  className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-200"
                >
                  Add Time
                </button>
                <button
                  type="button"
                  onClick={saveAppointmentReminders}
                  disabled={updatingAppointmentReminders}
                  className="rounded border border-emerald-400/40 bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-70"
                >
                  {updatingAppointmentReminders ? "Saving..." : "Save Reminder Settings"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {AUTO_FOLLOWUP_RULE_META.map(({ key, title, description }) => {
                const rule = autoFollowupModalConfig[key];
                return (
                  <div key={key} className="rounded border border-border/70 bg-card/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{title}</div>
                        <div className="text-xs text-muted-foreground">{description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateAutoFollowupRule(key, { enabled: !rule.enabled })}
                        className={`rounded border px-3 py-1 text-xs ${
                          rule.enabled
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                            : "border-rose-400/40 bg-rose-500/15 text-rose-200"
                        }`}
                      >
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>

                    <div className="mb-2">
                      <label className="mb-1 block text-xs text-muted-foreground">Delay</label>
                      <select
                        value={rule.delay_minutes}
                        onChange={(e) =>
                          updateAutoFollowupRule(key, {
                            delay_minutes: clampDelayMinutes(e.target.value, rule.delay_minutes),
                          })
                        }
                        className="w-full rounded border px-2 py-2 text-sm"
                      >
                        {AUTO_FOLLOWUP_DELAY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Message</label>
                      <textarea
                        value={rule.message}
                        onChange={(e) =>
                          updateAutoFollowupRule(key, { message: String(e.target.value || "").slice(0, 480) })
                        }
                        rows={3}
                        className="w-full rounded border px-2 py-2 text-sm"
                        placeholder="Type the exact follow-up message for this scenario"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAutoFollowupDraft(null);
                  autoFollowupDraftDirtyRef.current = false;
                  setAutoFollowupDraftDirty(false);
                  setShowAutoFollowupModal(false);
                }}
                className="rounded border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAutoFollowupConfig}
                disabled={updatingAutoFollowup}
                className="rounded border border-cyan-400/40 bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-500 disabled:opacity-70"
              >
                {updatingAutoFollowup ? "Saving..." : "Save Followup Settings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
