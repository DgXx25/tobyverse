"use client";

import { AI_PROVIDER_OPTIONS, DEFAULT_AI_PROVIDER } from "@/lib/ai/catalog";

export function ParametersPanel() {
  return (
    <div className="space-y-1">
      <p className="px-0.5 pb-1 text-[12px] text-muted">Model</p>
      {AI_PROVIDER_OPTIONS.map((option) => {
        const selected = option.id === DEFAULT_AI_PROVIDER;
        const enabled = option.enabled;
        return (
          <div
            key={option.id}
            className={`flex h-10 items-center justify-between rounded-xl px-2.5 text-[14px] ${
              enabled ? "text-foreground" : "text-muted"
            } ${selected ? "bg-foreground/10" : ""}`}
          >
            <span>{option.name}</span>
            {selected ? <span className="text-[12px] text-muted">Active</span> : null}
            {!enabled ? <span className="text-[12px] text-muted">Soon</span> : null}
          </div>
        );
      })}
    </div>
  );
}
