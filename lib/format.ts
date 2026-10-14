export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (bytes < 1024 * 1024 * 1024) {
    return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 10 ? `${Math.round(gb)} GB` : `${Number.isInteger(gb) ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const sec = Math.round(delta / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return shortDate(iso);
}

export function dayGroup(iso: string | null): "Today" | "Yesterday" | "Earlier" {
  if (!iso) return "Earlier";
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "Earlier";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(then);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - day.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return "Earlier";
}

export function weekGroup(iso: string | null): string {
  if (!iso) return "Earlier";
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "Earlier";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(then);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((start.getTime() - day.getTime()) / 86400000);
  if (diff <= 6 && start.getDay() >= day.getDay() && diff < 7) return "This week";
  if (diff < 14) return "Last week";
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
