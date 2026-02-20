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
  engaged: "bg-yellow-100 text-yellow-800 border-yellow-300",
  cold: "bg-cyan-100 text-cyan-800 border-cyan-300",
  booked: "bg-green-100 text-green-800 border-green-300",
  sold: "bg-indigo-100 text-indigo-800 border-indigo-300",
  dead: "bg-red-100 text-red-700 border-red-300",
};

const EMOJI_CHOICES = ["🙂", "👍", "✅", "📅", "⏰", "🙏", "🎉", "📲"];

function normalizeStatus(s: any): LeadStatus {
  const v = String(s || "engaged").toLowerCase();
  if (v === "new" || v === "contacted" || v === "engaged") return "engaged";
  if (v === "cold" || v === "booked" || v === "sold" || v === "dead") return v;
  return "engaged";
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

  const [q, setQ] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [updatingAi, setUpdatingAi] = React.useState(false);
  const [updatingHot, setUpdatingHot] = React.useState(false);
  const [updatingArchive, setUpdatingArchive] = React.useState(false);

  const [notesDraft, setNotesDraft] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  const [bookingStart, setBookingStart] = React.useState("");
  const [bookingEnd, setBookingEnd] = React.useState("");
  const [bookingTitle, setBookingTitle] = React.useState("");
  const [bookingDescription, setBookingDescription] = React.useState("");
  const [bookingBusy, setBookingBusy] = React.useState(false);

  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  async function loadThread() {
    if (!leadId) return;

    const lr = await apiFetch(`${API_BASE}/api/leads?include_archived=1`, { cache: "no-store" });
    const ldata = await lr.json();
    const list: Lead[] = Array.isArray(ldata) ? ldata : ldata?.leads ?? [];
    const found = list.find((x) => String(x.id) === String(leadId)) || null;

    setLead(found);

    if (found && typeof found.notes === "string") {
      setNotesDraft((prev) => (prev === "" ? found.notes || "" : prev));
    }

    const mr = await apiFetch(`${API_BASE}/api/leads/${leadId}/messages`, { cache: "no-store" });
    const mdata = await mr.json();
    const msgs: Msg[] = Array.isArray(mdata) ? mdata : mdata?.messages ?? [];
    setMessages(msgs);
  }

  React.useEffect(() => {
    if (!leadId) return;

    let dead = false;

    async function tick() {
      try {
        await loadThread();
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
    if (q.trim()) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, q]);

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
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
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

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(term));
  }, [messages, q]);

  const currentStatus = normalizeStatus(lead?.status);
  const statusStyle = STATUS_STYLE[currentStatus];
  const aiOn = (lead?.ai_enabled ?? 1) === 1;
  const hot = Number(lead?.hot ?? 0) === 1 || currentStatus === "engaged";
  const archived = Number(lead?.archived ?? 0) === 1;

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto h-[85vh] flex flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/leads" className="text-blue-600 underline">
          ← Back
        </Link>

        <div className="text-sm text-gray-500">Lead #{leadId}</div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold leading-tight">{lead?.name || lead?.phone || "Lead"}</div>
          <div className="text-sm text-gray-500">{lead?.phone}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-600">Status</div>
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
            <span className="text-gray-700">AI {aiOn ? "On" : "Off"}</span>
          </label>
          <button
            type="button"
            onClick={() => handleHotToggle(!hot)}
            disabled={updatingHot}
            className={`rounded border px-2 py-1 text-sm ${
              hot ? "bg-orange-100 border-orange-300 text-orange-800" : "bg-white border-gray-300 text-gray-600"
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
              archived ? "bg-cyan-100 border-cyan-300 text-cyan-800" : "bg-white border-gray-300 text-gray-600"
            }`}
            title={archived ? "Unarchive lead" : "Archive lead"}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <aside className="order-2 lg:order-2 min-h-0 overflow-y-auto pr-1 space-y-3">
          <div className="border rounded-lg p-3 bg-white shadow-sm">
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

          <div className="border rounded-lg p-3 bg-white shadow-sm">
            <div className="text-sm font-medium mb-2">Book Appointment</div>
            <div className="grid gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Start</span>
                <input
                  type="datetime-local"
                  value={bookingStart}
                  onChange={(e) => setBookingStart(e.target.value)}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">End</span>
                <input
                  type="datetime-local"
                  value={bookingEnd}
                  onChange={(e) => setBookingEnd(e.target.value)}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Title</span>
                <input
                  type="text"
                  value={bookingTitle}
                  onChange={(e) => setBookingTitle(e.target.value)}
                  placeholder={`Appointment - ${lead?.name || lead?.phone || "Lead"}`}
                  className="w-full border rounded px-2 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Description (optional)</span>
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
                className="bg-green-600 text-white px-3 py-2 rounded"
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

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 mb-3 pr-1">
            {filtered.length === 0 ? (
              <div className="text-gray-500">{q.trim() ? "No matches." : "No messages yet."}</div>
            ) : (
              filtered.map((m) => (
                <div
                  key={m.id}
                  className={`border rounded-lg p-3 shadow-sm ${m.direction === "out" ? "bg-blue-50 ml-8" : "bg-white mr-8"}`}
                >
                  <div className="flex justify-between mb-1 text-xs">
                    <div className="font-medium">{m.direction === "in" ? "Inbound" : "Outbound"}</div>
                    <div className="text-gray-500">{formatTime(m.created_at)}</div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                </div>
              ))
            )}

            <div ref={bottomRef} />
          </div>

          <div className="border-t pt-3">
            {mediaUrl ? (
              <div className="mb-2 rounded border border-gray-200 p-2 flex items-center justify-between gap-3">
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline truncate">
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
              <div className="mb-2 rounded border border-gray-200 p-2 flex flex-wrap gap-2 bg-white">
                {EMOJI_CHOICES.map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    onClick={() => insertEmoji(emo)}
                    className="border rounded px-2 py-1 text-lg leading-none hover:bg-gray-50"
                  >
                    {emo}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={mediaUrl ? "Optional caption..." : "Type a message..."}
                className="flex-1 border rounded px-3 py-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
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

              <button onClick={handleSend} disabled={sending || (!newMessage.trim() && !mediaUrl)} className="bg-blue-600 text-white px-4 py-2 rounded">
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
