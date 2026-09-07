"use client";

import { useEffect, useState, type ReactNode } from "react";
import "katex/dist/katex.min.css";
import { renderFormula, visualFromId } from "@/lib/visuals/catalog";
import { storageDownloadUrl } from "@/lib/materials/storage";
import type { NoteBlock, TermCardFields, VisualBlock } from "@/types/visual";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface px-4 py-3 ${className}`}>{children}</section>
  );
}

function QuietIcon({ id }: { id?: string }) {
  const node = id ? visualFromId("icon", id) : null;
  if (!node) return null;
  return <span className="mt-0.5 shrink-0 text-muted">{node}</span>;
}

function TermCard({ item }: { item: TermCardFields }) {
  return (
    <Card>
      <div className="flex gap-3">
        <QuietIcon id={item.icon} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium tracking-tight text-foreground">{item.title}</p>
          <p className="mt-1 text-[15px] leading-6 text-muted">{item.text}</p>
        </div>
      </div>
    </Card>
  );
}

function ConceptRow({ block }: { block: Extract<VisualBlock, { type: "concept_row" }> }) {
  const cols = block.items.length === 4 ? "min-[520px]:grid-cols-2" : "min-[420px]:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 gap-2 ${cols}`}>
      {block.items.map((item, index) => (
        <TermCard key={`${item.title}-${index}`} item={item} />
      ))}
    </div>
  );
}

function CompareVs({ block }: { block: Extract<VisualBlock, { type: "compare_vs" }> }) {
  return (
    <div>
      {block.title ? <p className="mb-2 text-[12px] text-muted">{block.title}</p> : null}
      <div className="flex flex-col gap-2 min-[440px]:grid min-[440px]:grid-cols-[1fr_auto_1fr] min-[440px]:items-stretch">
        <TermCard item={block.left} />
        <div className="flex items-center justify-center">
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] tracking-wide text-muted">VS</span>
        </div>
        <TermCard item={block.right} />
      </div>
    </div>
  );
}

function FormulaCard({ block }: { block: Extract<VisualBlock, { type: "formula_card" }> }) {
  return (
    <Card className="px-4 py-6 text-center">
      {block.title ? <p className="mb-3 text-[12px] text-muted">{block.title}</p> : null}
      <div className="overflow-x-auto text-[1.15rem] text-foreground">{renderFormula(block.formula, true) ?? block.formula}</div>
    </Card>
  );
}

function TableBlock({ block }: { block: Extract<VisualBlock, { type: "table" }> }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[15px] leading-6">
          <thead>
            <tr className="text-muted">
              {block.headers.map((header) => (
                <th key={header} className="px-4 py-2.5 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-2.5 text-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Steps({ block }: { block: Extract<VisualBlock, { type: "steps" }> }) {
  return (
    <Card>
      <ol className="space-y-3">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-0.5 w-5 shrink-0 text-[13px] text-muted">{index + 1}</span>
            <p className="text-[15px] leading-6 text-foreground">{item}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Example({ block }: { block: Extract<VisualBlock, { type: "example" }> }) {
  return (
    <Card className="bg-surface-2">
      <p className="text-[11px] tracking-wide text-muted">Example</p>
      <p className="mt-1.5 text-[15px] leading-6 text-foreground">{block.text}</p>
    </Card>
  );
}

function Pitfall({ block }: { block: Extract<VisualBlock, { type: "pitfall" }> }) {
  return (
    <Card>
      <div className="flex gap-3">
        <QuietIcon id="warning" />
        <div>
          <p className="text-[11px] tracking-wide text-muted">Pitfall</p>
          <p className="mt-1 text-[15px] leading-6 text-foreground">{block.text}</p>
        </div>
      </div>
    </Card>
  );
}

function Sparkline({ block }: { block: Extract<VisualBlock, { type: "sparkline" }> }) {
  const min = Math.min(...block.points);
  const max = Math.max(...block.points);
  const span = max - min || 1;
  const coords = block.points
    .map((point, index) => {
      const x = block.points.length === 1 ? 60 : (index / (block.points.length - 1)) * 120;
      const y = 28 - ((point - min) / span) * 24;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card>
      {block.title ? <p className="text-[12px] text-muted">{block.title}</p> : null}
      <svg viewBox="0 0 120 32" className="mt-2 h-10 w-full text-accent" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" points={coords} />
      </svg>
      {block.caption ? <p className="mt-1 text-[12px] text-muted">{block.caption}</p> : null}
    </Card>
  );
}

function SourceImage({
  path,
  slide,
  caption,
}: {
  path: string;
  slide?: number;
  caption?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path.startsWith("users/") || !path.includes("/materials/")) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    storageDownloadUrl(path)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <Card className="overflow-hidden p-0">
      {url ? (
        <img src={url} alt={caption || (slide ? `Slide ${slide}` : "Source slide")} className="max-h-72 w-full object-contain bg-surface-2" />
      ) : (
        <p className="px-4 py-6 text-center text-[12px] text-muted">{caption || (slide ? `Slide ${slide}` : "Source image")}</p>
      )}
      {(caption || slide) && url ? (
        <p className="px-4 py-2 text-[12px] text-muted">{caption || `Slide ${slide}`}</p>
      ) : null}
    </Card>
  );
}

function InvalidChip({ message }: { message: string }) {
  return (
    <p className="inline-flex rounded-full border border-border px-3 py-1 text-[12px] text-muted">{message}</p>
  );
}

export function VisualBlockView({ block }: { block: VisualBlock | NoteBlock }) {
  try {
    switch (block.type) {
      case "term_card":
        return <TermCard item={block} />;
      case "concept_row":
        return <ConceptRow block={block} />;
      case "compare_vs":
        return <CompareVs block={block} />;
      case "formula_card":
        return <FormulaCard block={block} />;
      case "table":
        return <TableBlock block={block} />;
      case "steps":
        return <Steps block={block} />;
      case "example":
        return <Example block={block} />;
      case "pitfall":
        return <Pitfall block={block} />;
      case "sparkline":
        return <Sparkline block={block} />;
      case "source_image":
        return <SourceImage path={block.path} slide={block.slide} caption={block.caption} />;
      case "invalid":
        return <InvalidChip message={block.message} />;
      default: {
        return null;
      }
    }
  } catch {
    return <InvalidChip message="Couldn’t render this block." />;
  }
}

export function VisualList({ blocks }: { blocks: Array<VisualBlock | NoteBlock> }) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => (
        <VisualBlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}

export function CatalogVisual({
  kind,
  id,
  className,
}: {
  kind?: string;
  id?: string;
  className?: string;
}) {
  if (!kind || !id) return null;
  if (kind === "slide") {
    return (
      <div className={className}>
        <SourceImage path={id} />
      </div>
    );
  }
  const node = visualFromId(kind, id);
  if (!node) return null;
  return <div className={className}>{node}</div>;
}
