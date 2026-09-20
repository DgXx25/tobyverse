"use client";

import { StatusWait } from "@/components/workspace/status-wait";
import { MixedText } from "@/components/visuals/mixed-text";

export type ComposerAction = {
  id: string;
  label: string;
  primary?: boolean;
};

export function ComposerActions({
  text,
  wait,
  since,
  actions,
  disabled,
  tone = "muted",
  onAction,
}: {
  text: string;
  wait?: boolean;
  since?: number;
  actions: ComposerAction[];
  disabled?: boolean;
  tone?: "muted" | "ask";
  onAction: (id: string) => void;
}) {
  return (
    <div className={`mb-1 flex gap-2 border-b border-border px-1 pb-2 pt-0.5 ${tone === "ask" ? "items-start" : "items-center"}`}>
      {wait ? (
        <StatusWait label={text} since={since} timer className="min-w-0 flex-1 text-[13px]" />
      ) : text.trim() ? (
        <div
          className={`min-w-0 flex-1 text-[13px] leading-5 ${
            tone === "ask" ? "text-foreground" : "text-muted"
          }`}
        >
          <MixedText text={text} />
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {actions.length ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction(action.id)}
              className={
                action.primary
                  ? "rounded-full bg-foreground px-3 py-1 text-[12px] font-medium text-background disabled:opacity-40"
                  : "rounded-full px-3 py-1 text-[12px] text-muted hover:text-foreground disabled:opacity-40"
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
