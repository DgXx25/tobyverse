"use client";

import { formatBytes } from "@/lib/format";
import { FREE_CAPS, STORAGE_CAP_LABEL, usageRatio } from "@/lib/account/plan";
import type { UserUsage } from "@/types/user";

export function UsageMeters({ usage }: { usage: UserUsage }) {
  const week = formatWeek(usage.weekStart);

  return (
    <div>
      <p className="text-[13px] text-muted">{week ? `Week of ${week}` : "This week"}</p>
      <div className="mt-6 space-y-6">
        <Meter label="Chat turns" used={usage.chatTurns} cap={FREE_CAPS.chatTurns} />
        <Meter label="Quiz" used={usage.practiceGenerated} cap={FREE_CAPS.practiceGenerated} />
        <Meter label="Notes" used={usage.notesGenerated} cap={FREE_CAPS.notesGenerated} />
        <Meter
          label="Storage"
          used={usage.storageBytes}
          cap={FREE_CAPS.storageBytes}
          display={`${formatBytes(usage.storageBytes) || "0 B"} / ${STORAGE_CAP_LABEL}`}
        />
      </div>
      <p className="mt-8 text-[13px] leading-6 text-muted">
        Storage is capped at {STORAGE_CAP_LABEL} for materials, including during beta. Chat, practice, and notes
        totals are shown for this week and not enforced yet.
      </p>
    </div>
  );
}

function Meter({
  label,
  used,
  cap,
  display,
}: {
  label: string;
  used: number;
  cap: number;
  display?: string;
}) {
  const ratio = usageRatio(used, cap);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-foreground">{label}</p>
        <p className="text-[13px] text-muted">{display ?? `${used} / ${cap}`}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-foreground/80" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function formatWeek(weekStart: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return "";
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
