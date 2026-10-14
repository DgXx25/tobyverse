"use client";

import { CHAT_MODE_LABELS } from "@/lib/core/constants";
import { SLASH_MODES, type SlashItem } from "@/lib/composer/slash";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { ChatMode } from "@/types/chat";

export function SlashMenu({
  items,
  active,
  onPick,
  onActive,
  allowSkills,
}: {
  items: SlashItem[];
  active: number;
  onPick: (item: SlashItem) => void;
  onActive: (index: number) => void;
  allowSkills: boolean;
}) {
  const modes = items.filter((item) => item.kind === "mode");
  const skills = allowSkills ? items.filter((item) => item.kind === "skill") : [];
  let index = -1;

  function renderGroup(title: string, group: SlashItem[]) {
    if (group.length === 0) return null;
    return (
      <div>
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-muted">{title}</p>
        {group.map((item) => {
          index += 1;
          const selected = index === active;
          const current = index;
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              id={`slash-item-${current}`}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => onActive(current)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(item)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? "bg-foreground/10 text-foreground" : "text-foreground hover:bg-foreground/10"
              }`}
            >
              <UiIcon name={item.icon} size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 text-[12px] text-muted">{item.hint}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-3 py-2 text-[13px] text-muted">No matching command</div>
    );
  }

  return (
    <div role="listbox" aria-label="Commands" className="flex flex-col gap-1 p-1.5">
      {renderGroup("Modes", modes)}
      {renderGroup("Tools", skills)}
    </div>
  );
}

export function ChatModeMenu({
  mode,
  onPick,
}: {
  mode: ChatMode;
  onPick: (mode: ChatMode) => void;
}) {
  return (
    <div role="listbox" aria-label="Reply style">
      {SLASH_MODES.map((item) => {
        const selected = item.id === mode;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onPick(item.id as ChatMode)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected ? "bg-foreground/10 text-foreground" : "text-foreground hover:bg-foreground/10"
            }`}
          >
            <UiIcon name={item.icon} size={16} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block">{item.label}</span>
              <span className="block text-[12px] text-muted">{item.hint}</span>
            </span>
            {selected ? <UiIcon name="check" size={14} className="text-foreground" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function chatModeLabel(mode: ChatMode): string {
  return CHAT_MODE_LABELS[mode];
}
