"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";
import { ChevronDown, Globe } from "lucide-react";
import type { WebSearchSource } from "@/lib/rag/web-citations";

const BRAND_NAMES: Record<string, string> = {
  "metoffice.gov.uk": "Met Office",
  "amindi.net": "Amindi",
  "accuweather.com": "AccuWeather",
  "meteoblue.com": "meteoblue",
  "weatherbug.com": "WeatherBug",
  "theweathernetwork.com": "The Weather Network",
};

function sourceBrand(source: WebSearchSource): string {
  const alias = Object.entries(BRAND_NAMES).find(([domain]) => source.hostname === domain || source.hostname.endsWith(`.${domain}`));
  if (alias) return alias[1];
  const parts = source.hostname.split(".");
  const publicSuffix = parts.slice(-2).join(".");
  const base = ["co.uk", "gov.uk", "org.uk", "com.au", "co.nz", "com.br"].includes(publicSuffix)
    ? parts.at(-3)
    : parts.at(-2);
  return (base || source.hostname).replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function faviconUrl(source: WebSearchSource): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.hostname)}&sz=32`;
}

function SiteIcon({ source, small = false }: { source: WebSearchSource; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = small ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${size}`}>
      {failed ? <Globe aria-hidden="true" className="h-3 w-3 text-muted" /> : (
        // Search-result icons are external site favicons; the visible label remains usable if one fails.
        <img
          src={faviconUrl(source)}
          alt=""
          width={small ? 16 : 18}
          height={small ? 16 : 18}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function SearchSources({ sources }: { sources: WebSearchSource[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const first = sources[0]!;
  const brand = sourceBrand(first);

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div
      className="relative my-1 inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label={`${brand}${sources.length > 1 ? ` and ${sources.length - 1} more sites` : " source"}`}
        aria-expanded={open}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onClick={() => setOpen((value) => !value)}
        className="source-citation-pill inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border border-transparent bg-white/[0.08] px-2 text-[11px] leading-none text-muted transition-colors hover:bg-white/[0.14] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="flex shrink-0 -space-x-1.5">
          {sources.slice(0, 2).map((source) => (
            <span key={source.url} className="rounded-full ring-2 ring-surface"><SiteIcon source={source} small /></span>
          ))}
        </span>
        <span className="truncate">{brand}</span>
        {sources.length > 1 ? <span className="shrink-0 text-muted">+{sources.length - 1}</span> : null}
        <ChevronDown aria-hidden="true" className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 w-[min(320px,calc(100vw-2rem))] pt-2">
          <div role="list" className="source-citation-popover max-h-[min(360px,calc(100dvh-2rem))] overflow-y-auto rounded-xl border border-[var(--panel-border)] bg-surface p-1.5 text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          {sources.map((source) => (
            <a
              key={source.url}
              role="listitem"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 no-underline transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <SiteIcon source={source} />
              <span className="min-w-0 flex-1">
                <span className="source-citation-title block truncate text-[12px] font-medium text-foreground">{source.title}</span>
                <span className="block truncate text-[10px] text-muted">{source.hostname}</span>
              </span>
            </a>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
