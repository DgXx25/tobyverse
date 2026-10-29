"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChatBlockState } from "@/components/workspace/chat-block-state";
import { renderFormula, catalogIconId, visualFromId } from "@/lib/visuals/catalog";
import { isLatexSource } from "@/lib/visuals/math";
import { expandWalkSlides } from "@/lib/visuals/arrows";
import { lookupElement } from "@/lib/visuals/elements";
import { compoundImageUrl, flagCode, flagImageUrl } from "@/lib/visuals/embeds";
import { BodyText, MixedText } from "@/components/visuals/mixed-text";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { EmbedKind, FromToEmbed, FromToSide, NoteBlock, TermCardFields, VisualBlock } from "@/types/visual";
import { SceneView } from "@/components/blocks/scenes/scene-view";

function hasKa(text: string): boolean {
  return /[\u10A0-\u10FF]/.test(text);
}

function FitWidth({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;

    const measure = () => {
      const available = host.clientWidth;
      const needed = inner.scrollWidth;
      const height = inner.offsetHeight;
      const scale = needed > available && available > 0 ? available / needed : 1;
      setFit((prev) =>
        Math.abs(prev.scale - scale) < 0.008 && Math.abs(prev.height - height * scale) < 1
          ? prev
          : { scale, height: height * scale },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={hostRef} className="w-full min-w-0 overflow-x-hidden">
      <div
        className="flex justify-center"
        style={fit.scale < 1 ? { height: Math.ceil(fit.height) + 8 } : undefined}
      >
        <div
          ref={innerRef}
          className="inline-block"
          style={
            fit.scale < 1
              ? { transform: `scale(${fit.scale})`, transformOrigin: "top center" }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`note-card ${padded ? "px-4 py-5" : ""} ${className}`}>
      {children}
    </section>
  );
}

function Heading({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`note-head ${className}`}>
      <MixedText text={text} />
    </p>
  );
}

function SplitCell({ item }: { item: TermCardFields }) {
  return (
    <div className="note-split-cell">
      <p className="note-subhead">
        <span className="inline-flex items-center gap-1.5">
          {item.emoji?.trim() ? <span className="text-[18px] leading-none">{item.emoji.trim()}</span> : null}
          <MixedText text={item.title} />
        </span>
      </p>
      {item.text ? (
        <BodyText text={item.text} className="text-[15px] leading-6 text-muted" />
      ) : null}
    </div>
  );
}

function SplitRow({ items }: { items: TermCardFields[] }) {
  const cols = items.length === 4 ? 2 : Math.min(Math.max(items.length, 1), 3);
  return (
    <div className="note-split" data-cols={cols}>
      {items.map((item, index) => (
        <SplitCell key={`${item.title}-${index}`} item={item} />
      ))}
    </div>
  );
}

function splitNumberedSteps(text: string): string[] {
  const source = text.trim();
  if (!/(?:^|\n)\s*\d+[.)]\s+/.test(source) && !/^\s*\d+[.)]\s+/.test(source)) return [];
  return source
    .split(/(?:^|\n)\s*\d+[.)]\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function workedExampleParts(text: string, steps?: string[]): { problem: string; steps: string[] } {
  if (steps && steps.length >= 2) return { problem: text.trim(), steps };
  const labeled = text.split(/\n*(?:ამოხსნა|Solution)\s*[:.]?\s*/i);
  if (labeled.length >= 2 && labeled[0].trim()) {
    const numbered = splitNumberedSteps(labeled.slice(1).join("\n").trim());
    if (numbered.length >= 2) return { problem: labeled[0].trim(), steps: numbered };
  }
  const numbered = splitNumberedSteps(text);
  if (numbered.length >= 2) {
    const lead = text.match(/^([\s\S]+?)(?:^|\n)\s*1[.)]\s+/);
    const problem = lead?.[1]?.trim();
    if (problem && problem.length > 12) return { problem, steps: numbered };
    return { problem: numbered[0], steps: numbered.slice(1) };
  }
  return { problem: text.trim(), steps: [] };
}

function QuietIcon({
  id,
  label,
  fallback = "none",
}: {
  id?: string;
  label?: string;
  fallback?: "none" | "mark";
}) {
  const resolved = catalogIconId(id, label);
  const node = resolved ? visualFromId("icon", resolved) : null;
  if (node) return <span className="mt-0.5 shrink-0 text-muted">{node}</span>;
  if (fallback === "mark" || (id && id.trim())) {
    return (
      <span
        className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-md border border-border"
        aria-hidden
      />
    );
  }
  return null;
}

function TermCard({ item }: { item: TermCardFields }) {
  return (
    <Card>
      <p className="note-head">
        <span className="inline-flex items-center gap-1.5">
          {item.emoji?.trim() ? <span className="text-[18px] leading-none">{item.emoji.trim()}</span> : null}
          <MixedText text={item.title} />
        </span>
      </p>
      <BodyText text={item.text} className="text-[15px] leading-6 text-muted" />
      {item.from_to ? <FromToShift shift={item.from_to} /> : null}
    </Card>
  );
}

function CompareSide({ item }: { item: TermCardFields }) {
  return (
    <div className="min-w-0">
      <p className="note-subhead">
        <MixedText text={item.title} />
      </p>
      <BodyText text={item.text} className="text-[15px] leading-6 text-muted" />
    </div>
  );
}

function SectionBlock({ block }: { block: Extract<VisualBlock, { type: "section" }> }) {
  return (
    <Card>
      {block.title ? <Heading text={block.title} /> : null}
      <div className="note-quote">
        <BodyText text={block.text} className="text-[15px] leading-7 text-foreground" />
      </div>
      {block.from_to ? <FromToShift shift={block.from_to} /> : null}
    </Card>
  );
}

function splitFlowItems(text: string): string[] {
  return text
    .split(/\s*(?:->|→|⇒|▶|➜|\n+|•)\s*/)
    .map((item) => item.replace(/^[|\v\s]+|[|\v\s]+$/g, "").trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .slice(0, 6);
}

function DiagramBlock({ block }: { block: Extract<VisualBlock, { type: "diagram" }> }) {
  if (isLatexSource(block.text)) {
    return <FormulaCard block={{ type: "formula_card", title: block.title, formula: block.text }} />;
  }
  const items = splitFlowItems(block.text);
  if (items.length >= 2) {
    return <FlowBlock block={{ type: "flow", title: block.title, items }} />;
  }
  return <SectionBlock block={{ type: "section", title: block.title, text: block.text }} />;
}

function graphSamples(block: Extract<VisualBlock, { type: "graph" }>): Array<{ x: number; y: number }> {
  const xMin = -3;
  const xMax = 3;
  if (typeof block.slope === "number") {
    const intercept = block.intercept ?? 0;
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 24; i += 1) {
      const x = xMin + (i / 24) * (xMax - xMin);
      out.push({ x, y: block.slope * x + intercept });
    }
    return out;
  }
  const points = block.points ?? [];
  if (points.length < 2) return [];
  return points.map((y, index) => ({
    x: xMin + (index / (points.length - 1)) * (xMax - xMin),
    y,
  }));
}

function GraphBlock({ block }: { block: Extract<VisualBlock, { type: "graph" }> }) {
  const samples = graphSamples(block);
  const width = 240;
  const height = 148;
  const pad = 22;
  const ys = samples.map((item) => item.y);
  const yAbs = Math.max(2, ...ys.map((value) => Math.abs(value)));
  const xMin = -3;
  const xMax = 3;
  const toX = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (width - pad * 2);
  const toY = (y: number) => height - pad - ((y + yAbs) / (2 * yAbs)) * (height - pad * 2);
  const axisY = toY(0);
  const axisX = toX(0);
  const coords = samples.map((item) => `${toX(item.x)},${toY(item.y)}`).join(" ");
  const intercept = typeof block.intercept === "number" ? block.intercept : typeof block.slope === "number" ? 0 : null;

  return (
    <Card padded={false} className="px-4 py-5">
      {block.title ? (
        <Heading text={block.title} className="text-center" />
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full text-foreground" aria-hidden>
        <line x1={pad} y1={axisY} x2={width - pad} y2={axisY} stroke="currentColor" className="text-muted" strokeWidth="1.2" />
        <line x1={axisX} y1={pad} x2={axisX} y2={height - pad} stroke="currentColor" className="text-muted" strokeWidth="1.2" />
        {coords ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={coords}
          />
        ) : null}
        {intercept != null ? (
          <circle cx={toX(0)} cy={toY(intercept)} r="4" fill="currentColor" />
        ) : null}
      </svg>
      {block.caption ? (
        <p className="mt-1 text-center text-[12px] text-muted">
          <MixedText text={block.caption} />
        </p>
      ) : null}
    </Card>
  );
}

function HighlightBlock({ block }: { block: Extract<VisualBlock, { type: "highlight" }> }) {
  return (
    <Card>
      <div className="note-quote">
        <p className="text-[15px] leading-7 text-foreground">
          <MixedText text={block.text} />
        </p>
      </div>
      {block.from_to ? <FromToShift shift={block.from_to} /> : null}
    </Card>
  );
}

function ConceptRow({ block }: { block: Extract<VisualBlock, { type: "concept_row" }> }) {
  return (
    <Card>
      <SplitRow items={block.items} />
    </Card>
  );
}

function CompareVs({ block }: { block: Extract<VisualBlock, { type: "compare_vs" }> }) {
  return (
    <Card padded={false} className="overflow-hidden px-4 py-5">
      {block.title ? <Heading text={block.title} /> : null}
      <div className="note-split" data-cols={2}>
        <div className="note-split-cell">
          <CompareSide item={block.left} />
        </div>
        <div className="note-split-cell">
          <CompareSide item={block.right} />
        </div>
      </div>
    </Card>
  );
}

function FormulaCard({ block }: { block: Extract<VisualBlock, { type: "formula_card" }> }) {
  return (
    <Card className="text-center">
      {block.title ? <Heading text={block.title} /> : null}
      {block.text ? (
        <BodyText text={block.text} className="mb-3 text-left text-[15px] leading-6 text-foreground" />
      ) : null}
      <div className="overflow-x-auto text-[1.2rem] text-foreground">{renderFormula(block.formula, true) ?? block.formula}</div>
      {block.caption ? (
        <BodyText text={block.caption} className="mt-2 text-center text-[13px] leading-5 text-muted" />
      ) : null}
    </Card>
  );
}

function TableBlock({ block }: { block: Extract<VisualBlock, { type: "table" }> }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[15px] leading-6">
          <thead>
            <tr className="text-muted">
              {block.headers.map((header) => (
                <th key={header} className="px-4 py-2.5 font-medium">
                  <MixedText text={header} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 text-foreground">
                  <MixedText text={cell} />
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
      <ol className="space-y-5">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-0.5 w-5 shrink-0 text-[14px] text-muted">{index + 1}</span>
            <div className="min-w-0 flex-1 text-[15px] leading-7 text-foreground">
              <MixedText text={item} />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Example({ block }: { block: Extract<VisualBlock, { type: "example" }> }) {
  const { problem, steps } = workedExampleParts(block.text, block.steps);
  const georgian = hasKa(problem);
  return (
    <Card>
      <Heading text={georgian ? "მაგალითი" : "Example"} />
      <BodyText text={problem} className="text-[15px] leading-7 text-foreground" />
      {block.from_to ? <FromToShift shift={block.from_to} /> : null}
      {steps.length > 0 ? (
        <>
          <Heading text={georgian ? "ამოხსნა" : "Solution"} className="mt-5" />
          <ol className="space-y-5">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-0.5 w-5 shrink-0 text-[14px] text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1 text-[15px] leading-7 text-foreground">
                  <MixedText text={step} />
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </Card>
  );
}

function Pitfall({ block }: { block: Extract<VisualBlock, { type: "pitfall" }> }) {
  return (
    <Card>
      <div className="flex gap-3">
        <QuietIcon id="warning" />
        <div className="min-w-0">
          <Heading text={hasKa(block.text) ? "სად ეშლება" : "Pitfall"} />
          <BodyText text={block.text} className="mt-1 text-[15px] leading-6 text-foreground" />
          {block.from_to ? <FromToShift shift={block.from_to} /> : null}
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
      <svg viewBox="0 0 120 32" className="mt-2 h-10 w-full text-foreground" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" points={coords} />
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
    if (!path.startsWith("users/") || !path.includes("/materials/") || isMissingMaterialFile(path)) return;
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
    <Card padded={false} className="overflow-hidden">
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

function FlowBlock({ block }: { block: Extract<VisualBlock, { type: "flow" }> }) {
  return (
    <Card>
      {block.title ? <Heading text={block.title} /> : null}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {block.items.map((item, index) => (
          <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
            {index > 0 ? <span className="text-[13px] text-muted">→</span> : null}
            <span className="note-chip">
              <MixedText text={item} />
            </span>
          </span>
        ))}
      </div>
    </Card>
  );
}

function WalkBlock({ block }: { block: Extract<VisualBlock, { type: "walk" }> }) {
  const slides = useMemo(() => expandWalkSlides(block.slides), [block.slides]);
  const [index, setIndex] = useChatBlockState("slide", 0);
  const startX = useRef<number | null>(null);
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;

  const go = (next: number) => {
    if (slides.length < 2) return;
    setIndex((next + slides.length) % slides.length);
  };

  return (
    <Card>
      {block.title ? <Heading text={block.title} /> : null}
      <div
        className="note-walk outline-none"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(index - 1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(index + 1);
          }
        }}
        onPointerDown={(event) => {
          startX.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (startX.current == null) return;
          const dx = event.clientX - startX.current;
          startX.current = null;
          if (dx > 48) go(index - 1);
          if (dx < -48) go(index + 1);
        }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-muted hover:text-foreground"
            onClick={() => go(index - 1)}
          >
            <UiIcon name="prev" size={16} />
          </button>
          <div className="note-walk-stage min-w-0 flex-1">
            {slide.title ? (
              <p className="mb-2 text-center text-[13px] text-muted">
                <MixedText text={slide.title} />
              </p>
            ) : null}
            {slide.from_to ? (
              <FromToShift shift={slide.from_to} nested={false} />
            ) : slide.formula ? (
              <FitWidth>
                <div className="text-center text-[1.15rem] text-foreground">
                  {renderFormula(slide.formula, true) ?? slide.formula}
                </div>
              </FitWidth>
            ) : (
              <BodyText text={slide.text ?? ""} className="text-center text-[15px] leading-7 text-foreground" />
            )}
          </div>
          <button
            type="button"
            aria-label="Next"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-muted hover:text-foreground"
            onClick={() => go(index + 1)}
          >
            <UiIcon name="forward" size={16} />
          </button>
        </div>
        {slide.text && (slide.formula || slide.from_to) ? (
          <BodyText text={slide.text} className="mt-3 text-center text-[14px] leading-6 text-muted" />
        ) : null}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {slides.map((_, dot) => (
            <button
              key={dot}
              type="button"
              aria-label={`Slide ${dot + 1}`}
              aria-current={dot === index}
              className="note-walk-dot"
              data-active={dot === index}
              onClick={() => setIndex(dot)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function ViaCaption({ text }: { text: string }) {
  const math = isLatexSource(text) || /\\/.test(text);
  return (
    <p className="note-from-to-via">
      {math ? (renderFormula(text, false) ?? text) : <MixedText text={text} />}
    </p>
  );
}

function sideHasContent(side: FromToSide): boolean {
  return Boolean(side.formula || side.text || side.embed);
}

function FromToShift({ shift, nested = true }: { shift: FromToEmbed; nested?: boolean }) {
  if (!sideHasContent(shift.left) || !sideHasContent(shift.right)) return null;
  return (
    <div className={nested ? "note-from-to-nested" : undefined}>
      <div className="note-from-to">
        <FromToPane side={shift.left} />
        <div className="note-from-to-arrow" aria-hidden>
          <UiIcon name="arrow" size={18} className="note-from-to-chevron text-muted" />
        </div>
        <FromToPane side={shift.right} />
      </div>
      {shift.via ? <ViaCaption text={shift.via} /> : null}
    </div>
  );
}

function FromToEmbedMark({ embed }: { embed: NonNullable<FromToSide["embed"]> }) {
  const kind = embed.kind;
  const code = kind === "flag" ? flagCode(embed.id) : null;
  return (
    <div className="flex flex-col items-center">
      {kind === "flag" && code ? <FlagMark code={code} /> : null}
      {kind === "element" ? <ElementTile symbol={embed.id} /> : null}
      {kind === "compound" ? <CompoundMark id={embed.id} label={embed.label} /> : null}
      {kind === "emoji" ? <span className="text-[40px] leading-none">{embed.id}</span> : null}
      {kind === "icon" ? <span className="text-muted">{visualFromId("icon", embed.id)}</span> : null}
      {embed.label ? <p className="mt-1.5 text-center text-[13px] text-muted">{embed.label}</p> : null}
    </div>
  );
}

function FromToPane({ side }: { side: FromToSide }) {
  const visual = side.embed ? (
    <FromToEmbedMark embed={side.embed} />
  ) : side.formula ? (
    <FitWidth>
      <div className="text-center text-[1.05rem] text-foreground">
        {renderFormula(side.formula, true) ?? side.formula}
      </div>
    </FitWidth>
  ) : side.text ? (
    <BodyText text={side.text} className="text-center text-[15px] leading-7 text-foreground" />
  ) : null;
  const caption = side.embed || side.formula ? side.text : null;

  return (
    <div className="note-from-to-pane">
      {visual}
      {caption ? (
        <BodyText text={caption} className="mt-2 text-center text-[14px] leading-6 text-muted" />
      ) : null}
    </div>
  );
}

function FromToBlock({ block }: { block: Extract<VisualBlock, { type: "from_to" }> }) {
  return (
    <Card>
      {block.title ? <Heading text={block.title} /> : null}
      <FromToShift shift={block} />
    </Card>
  );
}

function ClusterBlock({ block }: { block: Extract<VisualBlock, { type: "cluster" }> }) {
  return (
    <Card>
      <Heading text={block.center} />
      <SplitRow
        items={block.items.map((item) => ({
          title: item.title,
          text: item.text ?? "",
          emoji: item.emoji,
          icon: item.icon,
        }))}
      />
    </Card>
  );
}

function ElementTile({ symbol }: { symbol: string }) {
  const element = lookupElement(symbol);
  if (!element) return <span className="note-chip">{symbol}</span>;
  return (
    <span className="note-element">
      <span className="text-[10px] text-muted">{element.number}</span>
      <span className="text-[22px] font-medium leading-none tracking-tight text-foreground">{element.symbol}</span>
      <span className="text-[10px] text-muted">{element.name}</span>
    </span>
  );
}

function FlagMark({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-[32px] leading-none">{visualFromId("flag", code)}</span>;
  }
  return (
    <img
      src={flagImageUrl(code)}
      alt={code}
      width={80}
      height={54}
      className="h-12 w-auto rounded-md border border-border"
      onError={() => setFailed(true)}
    />
  );
}

function CompoundMark({ id, label }: { id: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="text-[1.15rem] text-foreground">{renderFormula(id, true) ?? id}</div>;
  }
  return (
    <img
      src={compoundImageUrl(id)}
      alt={label || id}
      width={240}
      height={180}
      className="mx-auto max-h-36 w-auto object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function EmbedBlock({ block }: { block: Extract<VisualBlock, { type: "embed" }> }) {
  const kind = block.kind as EmbedKind;
  const code = kind === "flag" ? flagCode(block.id) : null;

  return (
    <Card className="text-center">
      <div className="flex justify-center">
        {kind === "flag" && code ? <FlagMark code={code} /> : null}
        {kind === "element" ? <ElementTile symbol={block.id} /> : null}
        {kind === "compound" ? <CompoundMark id={block.id} label={block.label} /> : null}
        {kind === "emoji" ? <span className="text-[40px] leading-none">{block.id}</span> : null}
        {kind === "icon" ? <span className="text-muted">{visualFromId("icon", block.id)}</span> : null}
      </div>
      {block.label ? <Heading text={block.label} className="mt-3" /> : null}
      {block.text ? (
        <BodyText text={block.text} className="mt-1 text-[13px] leading-5 text-muted" />
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
      case "scene":
        return <SceneView block={block} />;
      case "section":
        return <SectionBlock block={block} />;
      case "term_card":
        return <TermCard item={block} />;
      case "concept_row":
        return <ConceptRow block={block} />;
      case "compare_vs":
        return <CompareVs block={block} />;
      case "formula_card":
        return <FormulaCard block={block} />;
      case "diagram":
        return <DiagramBlock block={block} />;
      case "graph":
        return <GraphBlock block={block} />;
      case "highlight":
        return <HighlightBlock block={block} />;
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
      case "embed":
        return <EmbedBlock block={block} />;
      case "cluster":
        return <ClusterBlock block={block} />;
      case "flow":
        return <FlowBlock block={block} />;
      case "walk":
        return <WalkBlock block={block} />;
      case "from_to":
        return <FromToBlock block={block} />;
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

export function VisualList({
  blocks,
  appear,
}: {
  blocks: Array<VisualBlock | NoteBlock>;
  appear?: boolean;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => (
        <div key={`${block.type}-${index}`} className={appear ? "note-block-in" : undefined}>
          <VisualBlockView block={block} />
        </div>
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
