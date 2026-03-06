"use client";

import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  at: string;
};

type SettingsResponse = {
  settings?: {
    ai_allow_quote?: boolean;
    ai_allow_aca?: boolean;
    ai_quote_ask_plan_type_prompt?: boolean;
    ai_quote_attempt_set_appointment_in_quote?: boolean;
    ai_quote_deviation_single?: number;
    ai_quote_deviation_couple?: number;
    ai_quote_deviation_per_dependent?: number;
    ai_schedule_time_mode?: "offer_two_times" | "accept_client_time";
  };
  ai_allow_quote?: boolean;
  ai_allow_aca?: boolean;
  ai_quote_ask_plan_type_prompt?: boolean;
  ai_quote_attempt_set_appointment_in_quote?: boolean;
  ai_quote_deviation_single?: number;
  ai_quote_deviation_couple?: number;
  ai_quote_deviation_per_dependent?: number;
  ai_schedule_time_mode?: "offer_two_times" | "accept_client_time";
};

function clampInt(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message || "").trim();
    if (msg) return msg;
  }
  return fallback;
}

export default function SandboxChatPage() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [thread, setThread] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [allowQuote, setAllowQuote] = React.useState(true);
  const [allowAca, setAllowAca] = React.useState(true);
  const [quoteAskPlanTypePrompt, setQuoteAskPlanTypePrompt] = React.useState(true);
  const [quoteAttemptSetAppointmentInQuote, setQuoteAttemptSetAppointmentInQuote] = React.useState(false);
  const [scheduleTimeMode, setScheduleTimeMode] = React.useState<"offer_two_times" | "accept_client_time">(
    "offer_two_times"
  );
  const [quoteDeviationSingle, setQuoteDeviationSingle] = React.useState(100);
  const [quoteDeviationCouple, setQuoteDeviationCouple] = React.useState(150);
  const [quoteDeviationPerDependent, setQuoteDeviationPerDependent] = React.useState(25);
  const [leadTimeZone, setLeadTimeZone] = React.useState("America/New_York");
  const [lastReplySource, setLastReplySource] = React.useState("");
  const [lastStateAction, setLastStateAction] = React.useState("");
  const [lastStateStrict, setLastStateStrict] = React.useState(false);
  const tailRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, busy]);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load settings");
        const body = (await res.json().catch(() => ({}))) as SettingsResponse;
        if (dead) return;
        const effective = (body?.settings && typeof body.settings === "object")
          ? body.settings
          : body;
        setAllowQuote(Boolean(effective?.ai_allow_quote));
        setAllowAca(
          typeof effective?.ai_allow_aca === "boolean"
            ? Boolean(effective.ai_allow_aca)
            : true
        );
        setQuoteAskPlanTypePrompt(
          typeof effective?.ai_quote_ask_plan_type_prompt === "boolean"
            ? Boolean(effective.ai_quote_ask_plan_type_prompt)
            : true
        );
        setQuoteAttemptSetAppointmentInQuote(
          typeof effective?.ai_quote_attempt_set_appointment_in_quote === "boolean"
            ? Boolean(effective.ai_quote_attempt_set_appointment_in_quote)
            : false
        );
        setScheduleTimeMode(
          effective?.ai_schedule_time_mode === "accept_client_time"
            ? "accept_client_time"
            : "offer_two_times"
        );
        setQuoteDeviationSingle(clampInt(effective?.ai_quote_deviation_single, 100, 0, 5000));
        setQuoteDeviationCouple(clampInt(effective?.ai_quote_deviation_couple, 150, 0, 5000));
        setQuoteDeviationPerDependent(clampInt(effective?.ai_quote_deviation_per_dependent, 25, 0, 1000));
      } catch (e: unknown) {
        if (!dead) setError(errorMessage(e, "Failed to load sandbox settings"));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  async function sendTurn() {
    const text = String(input || "").trim();
    if (!text || busy) return;

    setError("");
    setBusy(true);
    setInput("");

    const nextThread: ChatMsg[] = [...thread, { role: "user", text, at: new Date().toISOString() }];
    setThread(nextThread);

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
          allow_quote: allowQuote,
          allow_aca: allowAca,
          quote_ask_plan_type_prompt: quoteAskPlanTypePrompt,
          quote_attempt_set_appointment_in_quote: quoteAttemptSetAppointmentInQuote,
          quote_deviation_single: quoteDeviationSingle,
          quote_deviation_couple: quoteDeviationCouple,
          quote_deviation_per_dependent: quoteDeviationPerDependent,
          schedule_time_mode: scheduleTimeMode,
          lead_timezone: leadTimeZone,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = String(body?.detail || body?.error || "");
        throw new Error(detail || `AI test failed (${res.status})`);
      }

      const reply = String(body?.reply || "").trim() || "No reply returned.";
      setLastReplySource(String(body?.reply_source || ""));
      setLastStateAction(String(body?.state_machine?.next_action || ""));
      setLastStateStrict(Boolean(body?.state_machine?.strict_enabled));
      setThread((prev) => [...prev, { role: "assistant", text: reply, at: new Date().toISOString() }]);
    } catch (e: unknown) {
      setError(errorMessage(e, "Sandbox send failed"));
    } finally {
      setBusy(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTurn().catch(() => {});
    }
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border border-cyan-400/25 bg-slate-900/75 p-4 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
        <h1 className="text-2xl font-semibold text-foreground">Sandbox Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uses the same AI/state-machine reply pipeline as the app, without sending any real SMS.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <section className="space-y-3 rounded-2xl border border-cyan-400/25 bg-slate-900/75 p-4">
          <div className="text-sm font-semibold text-cyan-100">Sandbox Controls</div>

          <label className="flex items-center justify-between rounded border border-cyan-500/25 px-3 py-2">
            <span className="text-sm text-cyan-100">$ Quote Mode</span>
            <button
              type="button"
              onClick={() => setAllowQuote((v) => !v)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                allowQuote
                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-red-400/40 bg-red-500/20 text-red-200"
              }`}
            >
              {allowQuote ? "Enabled" : "Disabled"}
            </button>
          </label>

          <label className="flex items-center justify-between rounded border border-cyan-500/25 px-3 py-2">
            <span className="text-sm text-cyan-100">ACA Branch</span>
            <button
              type="button"
              onClick={() => setAllowAca((v) => !v)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                allowAca
                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-red-400/40 bg-red-500/20 text-red-200"
              }`}
            >
              {allowAca ? "Enabled" : "Disabled"}
            </button>
          </label>

          <label className="flex items-center justify-between rounded border border-cyan-500/25 px-3 py-2">
            <span className="text-sm text-cyan-100">Ask Individual/Family First</span>
            <button
              type="button"
              onClick={() => setQuoteAskPlanTypePrompt((v) => !v)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                quoteAskPlanTypePrompt
                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-red-400/40 bg-red-500/20 text-red-200"
              }`}
            >
              {quoteAskPlanTypePrompt ? "Enabled" : "Disabled"}
            </button>
          </label>

          <label className="flex items-center justify-between rounded border border-cyan-500/25 px-3 py-2">
            <span className="text-sm text-cyan-100">Attempt Appointment In Quote</span>
            <button
              type="button"
              onClick={() => setQuoteAttemptSetAppointmentInQuote((v) => !v)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                quoteAttemptSetAppointmentInQuote
                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-red-400/40 bg-red-500/20 text-red-200"
              }`}
            >
              {quoteAttemptSetAppointmentInQuote ? "Enabled" : "Disabled"}
            </button>
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-cyan-200">Schedule Time Mode</div>
            <select
              value={scheduleTimeMode}
              onChange={(e) =>
                setScheduleTimeMode(
                  e.target.value === "accept_client_time" ? "accept_client_time" : "offer_two_times"
                )
              }
              className="w-full rounded border border-cyan-500/25 bg-slate-950 px-2 py-2 text-sm text-cyan-100"
            >
              <option value="offer_two_times">Offer Two Times</option>
              <option value="accept_client_time">Accept Client Time</option>
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-cyan-200">Lead Timezone</div>
            <input
              value={leadTimeZone}
              onChange={(e) => setLeadTimeZone(String(e.target.value || "").trim())}
              className="w-full rounded border border-cyan-500/25 bg-slate-950 px-2 py-2 text-sm text-cyan-100"
              placeholder="America/New_York"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <div className="mb-1 text-[11px] text-cyan-200">Single ±</div>
              <input
                type="number"
                value={quoteDeviationSingle}
                onChange={(e) => setQuoteDeviationSingle(clampInt(e.target.value, 100, 0, 5000))}
                className="w-full rounded border border-cyan-500/25 bg-slate-950 px-2 py-2 text-sm text-cyan-100"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] text-cyan-200">Couple ±</div>
              <input
                type="number"
                value={quoteDeviationCouple}
                onChange={(e) => setQuoteDeviationCouple(clampInt(e.target.value, 150, 0, 5000))}
                className="w-full rounded border border-cyan-500/25 bg-slate-950 px-2 py-2 text-sm text-cyan-100"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] text-cyan-200">Dependent ±</div>
              <input
                type="number"
                value={quoteDeviationPerDependent}
                onChange={(e) => setQuoteDeviationPerDependent(clampInt(e.target.value, 25, 0, 1000))}
                className="w-full rounded border border-cyan-500/25 bg-slate-950 px-2 py-2 text-sm text-cyan-100"
              />
            </label>
          </div>

          <div className="rounded border border-cyan-500/20 bg-slate-950/60 p-2 text-xs text-cyan-200">
            <div>
              Last reply source: <span className="font-semibold">{lastReplySource || "-"}</span>
            </div>
            <div>
              Next state action: <span className="font-semibold">{lastStateAction || "-"}</span>
            </div>
            <div>
              Strict mode: <span className="font-semibold">{lastStateStrict ? "true" : "false"}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setThread([]);
              setError("");
              setLastReplySource("");
              setLastStateAction("");
              setLastStateStrict(false);
            }}
            className="rounded border border-cyan-500/40 bg-slate-900 px-3 py-2 text-sm text-cyan-100 hover:bg-slate-800"
          >
            Clear Conversation
          </button>
        </section>

        <section className="rounded-2xl border border-cyan-400/25 bg-slate-900/75 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-cyan-100">Conversation</div>
            {loading ? <div className="text-xs text-cyan-300/80">Loading defaults…</div> : null}
          </div>

          <div className="max-h-[60vh] min-h-[360px] space-y-2 overflow-y-auto rounded border border-cyan-500/20 bg-slate-950/50 p-3">
            {thread.length === 0 ? (
              <div className="text-sm text-slate-300">Start by typing an inbound customer message below.</div>
            ) : (
              thread.map((m, i) => (
                <div
                  key={`${m.at}-${i}`}
                  className={`rounded border px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "border-slate-600 bg-slate-800 text-slate-100"
                      : "border-cyan-500/45 bg-cyan-500/15 text-cyan-100"
                  }`}
                >
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-300">
                    {m.role === "user" ? "You" : "AI"}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                </div>
              ))
            )}
            {busy ? (
              <div className="rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
                AI is thinking…
              </div>
            ) : null}
            <div ref={tailRef} />
          </div>

          <div className="mt-3 grid gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              rows={4}
              placeholder="Type a customer message... (Enter to send, Shift+Enter for newline)"
              className="w-full rounded border border-cyan-500/35 bg-slate-950 px-3 py-2 text-sm text-cyan-100 placeholder:text-slate-400"
            />
            <div className="flex items-center justify-between">
              {error ? <div className="text-sm text-rose-300">{error}</div> : <div />}
              <button
                type="button"
                disabled={busy || !String(input || "").trim()}
                onClick={() => sendTurn().catch(() => {})}
                className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
