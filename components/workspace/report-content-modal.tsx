"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "@/components/workspace/ui-icon";

const CONTENT_REASONS = [
  "Child abuse or safety",
  "Non-consensual intimate imagery of a real person",
  "Violence, terrorism, self-harm, suicide, or drugs",
  "Scams, fraud, hacking, phishing, or spam",
  "Privacy, doxxing, stalking, or harassment",
  "Copyright or intellectual property",
  "Other inappropriate content",
] as const;

const FEEDBACK_REASONS = ["General feedback", "Report a bug"] as const;

export function ReportContentModal({
  snippet,
  busy = false,
  onClose,
  onSubmit,
}: {
  snippet: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const quote = snippet.length > 200 ? `${snippet.slice(0, 200)}…` : snippet;
  if (typeof document === "undefined") return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay/70 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-content-title"
        className="flex max-h-[min(90vh,760px)] w-full max-w-[560px] flex-col rounded-[24px] border border-border bg-surface p-5 text-foreground shadow-2xl max-sm:p-4"
      >
        <header className="flex items-center justify-between gap-4">
          <h2 id="report-content-title" className="text-[18px] font-semibold tracking-tight">Report content</h2>
          <button
            type="button"
            aria-label="Close report"
            disabled={busy}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            <UiIcon name="close" size={16} />
          </button>
        </header>

        <div className="mt-5 min-h-0 space-y-4 overflow-y-auto">
          <div className="rounded-2xl border border-border px-3.5 py-3">
            <p className="mb-1 text-[12px] text-muted">Reported response</p>
            <p className="line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-5">{quote}</p>
          </div>

          <div>
            <label htmlFor="report-content-reason" className="mb-2 block text-[13px] font-semibold">Reason</label>
            <select
              id="report-content-reason"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[13px] text-foreground outline-none focus:border-accent"
            >
              <option value="">Select a reason</option>
              <optgroup label="Report this content">
                {CONTENT_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </optgroup>
              <optgroup label="Feedback">
                {FEEDBACK_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </optgroup>
            </select>
          </div>

          <textarea
            aria-label="Tell us what is wrong"
            value={note}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            placeholder="Tell us what is wrong"
            rows={5}
            className="min-h-32 w-full resize-y rounded-2xl border border-border bg-transparent px-3.5 py-3 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted focus:border-accent"
          />
        </div>

        <footer className="flex justify-end pt-4">
          <button
            type="button"
            disabled={!reason || busy}
            onClick={() => void onSubmit(reason, note.trim().slice(0, 500))}
            className="min-w-20 rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </footer>
      </section>
    </div>
  ), document.body);
}
