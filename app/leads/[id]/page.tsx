"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

type LeadStatus = "engaged" | "cold" | "booked" | "sold" | "dead";

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
  notes?: string | null;
  hot?: number | null;
  archived?: number | null;
};

type Msg = {
  id: number;
  lead_id: number;
  direction: "in" | "out";
  text: string;
  created_at?: string | null;
  delivery_status?: string | null;
  delivery_status_at?: string | null;
  ai_feedback_positive?: number | null;
};

type TextdripTemplate = {
  template_id: string;
  name?: string | null;
  body?: string | null;
  category?: string | null;
  is_active?: number | null;
};

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

const STATUSES: LeadStatus[] = ["engaged", "cold", "booked", "sold", "dead"];

const STATUS_STYLE: Record<LeadStatus, string> = {
  engaged: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  cold: "border-cyan-400/40 bg-cyan-500/15 text-cyan-300",
  booked: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
  sold: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
  dead: "bg-rose-500/15 text-rose-300 border-rose-400/40",
};

const EMOJI_CHOICES = ["🙂", "👍", "✅", "📅", "⏰", "🙏", "🎉", "📲"];
const HISTORY_SYNC_INTERVAL_MS = 60 * 1000;

function normalizeStatus(s: any): LeadStatus {
  const v = String(s || "engaged").toLowerCase();
  if (v === "new" || v === "contacted" || v === "engaged") return "engaged";
  if (v === "cold" || v === "booked" || v === "sold" || v === "dead") return v;
  return "engaged";
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

  const [newMessage, setNewMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [templates, setTemplates] = React.useState<TextdripTemplate[]>([]);
  const [templateChoice, setTemplateChoice] = React.useState("");
  const [syncingTemplates, setSyncingTemplates] = React.useState(false);

  const [q, setQ] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [updatingAi, setUpdatingAi] = React.useState(false);
  const [updatingHot, setUpdatingHot] = React.useState(false);
  const [updatingArchive, setUpdatingArchive] = React.useState(false);
  const [feedbackBusyId, setFeedbackBusyId] = React.useState<number | null>(null);
  const [contactEmail, setContactEmail] = React.useState("");
  const [googleConnectedEmail, setGoogleConnectedEmail] = React.useState("");
  const [googleGmailConnected, setGoogleGmailConnected] = React.useState(false);

  const [notesDraft, setNotesDraft] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  const [bookingStart, setBookingStart] = React.useState("");
  const [bookingEnd, setBookingEnd] = React.useState("");
  const [bookingTitle, setBookingTitle] = React.useState("");
  const [bookingDescription, setBookingDescription] = React.useState("");
  const [bookingBusy, setBookingBusy] = React.useState(false);

  const threadScrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const lastHistorySyncAtRef = React.useRef(0);

  async function loadTemplates() {
    const r = await apiFetch(`${API_BASE}/api/textdrip/templates`, { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json().catch(() => ({}));
    const list = Array.isArray(data?.templates) ? data.templates : [];
    setTemplates(list);
  }

  async function loadThread({ syncHistory = false }: { syncHistory?: boolean } = {}) {
    if (!leadId) return;

    const lr = await apiFetch(`${API_BASE}/api/leads?include_archived=1`, { cache: "no-store" });
    const ldata = await lr.json();
    const list: Lead[] = Array.isArray(ldata) ? ldata : ldata?.leads ?? [];
    const found = list.find((x) => String(x.id) === String(leadId)) || null;

    setLead(found);

    if (found && typeof found.notes === "string") {
      setNotesDraft((prev) => (prev === "" ? found.notes || "" : prev));
    }

    const query = syncHistory ? "?sync=1" : "";
    const mr = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages${query}`, { cache: "no-store" });
    const mdata = await mr.json();
    const msgs: Msg[] = Array.isArray(mdata) ? mdata : mdata?.messages ?? [];
    setMessages(msgs);
    if (syncHistory) lastHistorySyncAtRef.current = Date.now();
  }

  React.useEffect(() => {
    if (!leadId) return;
    lastHistorySyncAtRef.current = 0;
    try {
      const stored = window.localStorage.getItem(`lead_email_${String(leadId)}`) || "";
      const normalized = normalizeEmail(stored);
      if (normalized) setContactEmail(normalized);
    } catch {}

    let dead = false;

    async function tick() {
      try {
        const shouldSyncHistory =
          lastHistorySyncAtRef.current === 0 ||
          (Date.now() - lastHistorySyncAtRef.current) >= HISTORY_SYNC_INTERVAL_MS;
        await loadThread({ syncHistory: shouldSyncHistory });
        if (!dead) setError("");
      } catch {
        if (!dead) setError("Load failed");
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
    loadTemplates().catch(() => {});
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

  function applySelectedTemplate() {
    const t = templates.find((x) => String(x.template_id) === templateChoice);
    if (!t) return;
    setNewMessage(String(t.body || ""));
  }

  async function syncTemplates() {
    try {
      setSyncingTemplates(true);
      const r = await apiFetch(`${API_BASE}/api/textdrip/templates/sync`, { method: "POST" });
      if (!r.ok) throw new Error("Template sync failed");
      await loadTemplates();
    } catch {
      alert("Template sync failed");
    } finally {
      setSyncingTemplates(false);
    }
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

  async function handleAiFeedbackToggle(msg: Msg) {
    if (!leadId) return;
    if (String(msg?.direction || "").toLowerCase() !== "out") return;
    const nextPositive = Number(msg?.ai_feedback_positive || 0) !== 1;
    try {
      setFeedbackBusyId(Number(msg.id));
      const r = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages/${msg.id}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positive: nextPositive }),
      });
      if (!r.ok) throw new Error("Feedback save failed");
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(msg.id)
            ? { ...m, ai_feedback_positive: nextPositive ? 1 : 0 }
            : m
        )
      );
    } catch {
      alert("Could not save AI feedback");
    } finally {
      setFeedbackBusyId(null);
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
  const hot = Number(lead?.hot ?? 0) === 1;
  const archived = Number(lead?.archived ?? 0) === 1;
  const leadCity = String(lead?.city || "").trim();
  const leadState = String(lead?.state || "").trim();
  const leadZip = String(lead?.zip || "").trim();
  const leadTz = String(lead?.lead_timezone || "").trim();
  const leadLocation = [[leadCity, leadState].filter(Boolean).join(", "), leadZip].filter(Boolean).join(" ").trim();
  const leadLocationLine = [leadLocation, leadTz ? `(${leadTz})` : ""].filter(Boolean).join(" ");

  return (
    <div className="mx-auto flex h-[85vh] max-w-[1280px] flex-col rounded-2xl border border-border/70 bg-card/40 p-4 shadow-xl backdrop-blur-sm md:p-6">
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

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">Status</div>
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              disabled={updatingStatus}
              className={`border rounded px-2 py-1.5 text-sm ${statusStyle}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiOn}
              disabled={updatingAi}
              onChange={(e) => handleAiToggle(e.target.checked)}
            />
            <span className="text-muted-foreground">AI {aiOn ? "On" : "Off"}</span>
          </label>
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

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <aside className="order-2 lg:order-2 min-h-0 overflow-y-auto pr-1 space-y-3">
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
        </aside>

        <section className="order-1 lg:order-1 min-h-0 flex flex-col">
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
              filtered.map((m) => (
                <div
                  key={m.id}
                  className={`border rounded-lg p-3 shadow-sm ${m.direction === "out" ? "bg-cyan-500/10 ml-8" : "bg-card/70 mr-8"}`}
                >
                  <div className="flex justify-between mb-1 text-xs">
                    <div className="font-medium">{m.direction === "in" ? "Inbound" : "Outbound"}</div>
                    <div className="text-muted-foreground">{formatTime(m.created_at)}</div>
                  </div>
                  {m.direction === "out" ? (
                    <div className="mb-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAiFeedbackToggle(m)}
                        disabled={feedbackBusyId === Number(m.id)}
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                          Number(m.ai_feedback_positive || 0) === 1
                            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                            : "border-border bg-card/70 text-muted-foreground hover:bg-muted/40"
                        } disabled:opacity-60`}
                        title="Mark this AI reply as great"
                      >
                        {feedbackBusyId === Number(m.id)
                          ? "Saving..."
                          : Number(m.ai_feedback_positive || 0) === 1
                            ? "👍 Great Reply Saved"
                            : "👍 Great Reply"}
                      </button>
                    </div>
                  ) : null}
                  {m.direction === "out" && m.delivery_status ? (
                    <div className="mb-1 text-[11px] text-muted-foreground">
                      Delivery: {String(m.delivery_status)}
                      {m.delivery_status_at ? ` (${formatTime(m.delivery_status_at)})` : ""}
                    </div>
                  ) : null}
                  <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={templateChoice}
                onChange={(e) => setTemplateChoice(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">Textdrip templates...</option>
                {templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {t.name || t.template_id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applySelectedTemplate}
                disabled={!templateChoice}
                className="border rounded px-2 py-1 text-xs"
              >
                Use Template
              </button>
              <button
                type="button"
                onClick={() => syncTemplates().catch(() => {})}
                disabled={syncingTemplates}
                className="border rounded px-2 py-1 text-xs"
              >
                {syncingTemplates ? "Syncing..." : "Sync Templates"}
              </button>
            </div>
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
                placeholder={mediaUrl ? "Optional caption..." : "Type a message..."}
                rows={2}
                className="flex-1 border rounded px-3 py-2 resize-y"
                onKeyDown={(e) => {
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
                disabled={uploadingImage || sending}
                className="border px-3 py-2 rounded"
                title="Upload image"
              >
                {uploadingImage ? "Uploading..." : "📷"}
              </button>

              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                disabled={sending}
                className="border px-3 py-2 rounded"
                title="Emoji"
              >
                😊
              </button>

              <button onClick={handleSend} disabled={sending || (!newMessage.trim() && !mediaUrl)} className="bg-cyan-600 text-white px-4 py-2 rounded">
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
