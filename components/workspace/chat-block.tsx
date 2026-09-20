"use client";

import { useState, type ReactNode } from "react";
import { UiIcon } from "@/components/workspace/ui-icon";

export function ChatBlock({
  copyText,
  label,
  kind,
  children,
}: {
  copyText: string;
  label?: string;
  kind?: "code" | "math";
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="chat-block" data-kind={kind || undefined}>
      <div className="chat-block-bar">
        <span className="chat-block-label">{label || "\u00a0"}</span>
        <button type="button" className="chat-block-copy" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy"}>
          <UiIcon name={copied ? "check" : "copy"} size={14} />
        </button>
      </div>
      <div className="chat-block-body">{children}</div>
    </div>
  );
}
