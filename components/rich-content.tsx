"use client";

import { Fragment, memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { StreamAnimRoot } from "@/components/workspace/stream-text";
import { ChatBlockStateScope } from "@/components/workspace/chat-block-state";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parsePartialObject } from "@/lib/ai/json-stream";
import { parseTobyFence } from "@/lib/blocks/registry";
import { TobyBlockView } from "@/components/blocks/toby-block";
import type { ParsedChatBlock } from "@/lib/blocks/types";
import { parseVisualBlock } from "@/lib/visuals/validate";
import { VisualBlockView } from "@/components/visuals/visual-block";
import { MixedText, TableCellRich, withInlineRich } from "@/components/visuals/mixed-text";
import { htmlToMarkdown } from "@/lib/visuals/html-rich";
import { ChatBlock } from "@/components/workspace/chat-block";
import { renderFormula } from "@/lib/visuals/catalog";
import { promoteEquationStepsToDisplayMath, protectInlineMath, restoreInlineMath, scrubLeakedMarkup, splitDisplayMath } from "@/lib/visuals/math";
import { CitationMark } from "@/components/workspace/citations";
import { linkCitations, sourceNumberFromHref } from "@/lib/rag/sources";
import { isInlineMarkHref, remarkInlineMarks } from "@/lib/visuals/markdown-marks";
import { layoutChatTable, prepareChatMarkdown, splitMarkdownTables } from "@/lib/visuals/markdown-table";
import type { VisualBlock } from "@/types/visual";
import type { ChatImageHit } from "@/types/chat";
import { layoutImageGalleries, type ImageGalleryPart } from "@/lib/images/galleries";
import { ImageGallery } from "@/components/workspace/image-gallery";
import { SearchSources } from "@/components/workspace/search-sources";
import { extractWebSearchSources, webSourceInsertionIndex } from "@/lib/rag/web-citations";

const HighlightedCode = dynamic(() => import("@/components/workspace/highlighted-code").then((mod) => mod.HighlightedCode), {
  loading: () => <code>…</code>,
  ssr: false,
});

type Segment =
  | { kind: "md"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "math"; value: string; note?: string; step?: boolean }
  | { kind: "code"; lang: string; text: string }
  | { kind: "visual"; block: VisualBlock }
  | { kind: "toby"; block: ParsedChatBlock }
  | ImageGalleryPart;

const LEADING_MARKDOWN_RULE = /^\s*(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})(?:\r?\n|$)/;

function removeLeadingRuleAfterBlock(text: string): string {
  return text.replace(LEADING_MARKDOWN_RULE, "");
}

function splitRichContent(parts: ReturnType<typeof layoutImageGalleries>["segments"]): Segment[] {
  return parts.flatMap((part): Segment[] => {
    if (part.kind === "gallery") return [part];
    if (part.kind === "md") {
      return splitMarkdownTables(htmlToMarkdown(part.text)).flatMap((piece): Segment[] => {
        if (piece.kind === "table") return [piece];
        return splitDisplayMath(promoteEquationStepsToDisplayMath(piece.text)).flatMap((item): Segment[] => {
          if (item.kind === "math") return item.value ? [{ kind: "math", value: item.value, note: item.note, step: item.step }] : [];
          return item.text.trim() ? [{ kind: "md", text: item.text }] : [];
        });
      });
    }
    if (part.lang === "math" || part.lang === "latex") {
      if (!part.text.trim()) return [];
      const parsed = splitDisplayMath(`$$${part.text.trim()}$$`).find((item) => item.kind === "math");
      return parsed?.kind === "math" ? [{ kind: "math", value: parsed.value, note: parsed.note, step: parsed.step }] : [];
    }
    if (part.lang === "toby" || part.lang.startsWith("toby-")) {
      const parsed = parseTobyFence(part.lang, part.text);
      return parsed ? [{ kind: "toby", block: parsed }] : [];
    }
    if (part.lang === "visual" || part.lang === "json") {
      const parsed = parseVisualBlock(tryJson(part.text) ?? parsePartialObject(part.text));
      if (parsed) return [{ kind: "visual", block: parsed }];
      if (part.lang === "visual") return [];
    }
    return [{ kind: "code", lang: part.lang, text: part.text }];
  });
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

function RichChildren({
  children,
  slots,
  streaming = false,
}: {
  children: ReactNode;
  slots: string[];
  streaming?: boolean;
}) {
  return <>{withInlineRich(children, slots, streaming)}</>;
}

function ChatTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const view = layoutChatTable(headers, rows);
  const even = view.compact.every((shrink) => !shrink);
  return (
    <div className="chat-table" style={{ "--chat-table-columns": view.compact.length } as CSSProperties}>
      <div className="chat-table-scroll">
        <table className={even ? "chat-table-even" : undefined}>
          <colgroup>
            {view.compact.map((shrink, index) => (
              <col key={index} className={shrink ? "chat-table-compact" : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {view.headers.map((cell, index) => (
                <th
                  key={index}
                  rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                  className={cell.className || undefined}
                >
                  <MixedText text={cell.text} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  if (!cell) return null;
                  const Tag = cell.header ? "th" : "td";
                  return (
                    <Tag
                      key={cellIndex}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={cell.className || undefined}
                    >
                      <TableCellRich text={cell.text} pair={cell.pair} />
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MarkdownBody = memo(function MarkdownBody({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const protectedMath = protectInlineMath(scrubLeakedMarkup(linkCitations(text)));
  const seenRef = useRef(0);
  const seen = seenRef.current;
  const rich = (children: ReactNode) => (
    <RichChildren slots={protectedMath.slots} streaming={streaming}>
      {children}
    </RichChildren>
  );

  return (
    <StreamAnimRoot
      active={streaming}
      seen={seen}
      onSeen={(next) => {
        seenRef.current = next;
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkInlineMarks]}
        components={{
          p: ({ children }) => <p>{rich(children)}</p>,
          h1: ({ children }) => <h1>{rich(children)}</h1>,
          h2: ({ children }) => <h2>{rich(children)}</h2>,
          h3: ({ children }) => <h3>{rich(children)}</h3>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children, start }) => <ol start={start}>{children}</ol>,
          li: ({ children }) => <li>{rich(children)}</li>,
          br: () => <br />,
          hr: () => null,
          blockquote: ({ children }) => <blockquote className="note-highlight my-5 px-3.5 py-2.5">{children}</blockquote>,
          code: ({ className, children }) => {
            const inline = !className;
            const raw = restoreInlineMath(String(children).replace(/\n$/, ""), protectedMath.slots);
            if (inline) {
              if (raw.startsWith("$") || /\\[a-zA-Z]/.test(raw)) {
                return <MixedText text={raw.includes("$") ? raw : `$${raw}$`} streaming={streaming} />;
              }
              return <span className="chat-inline-block">{raw}</span>;
            }
            const lang = className?.replace(/^language-/, "") || "text";
            return (
              <ChatBlock copyText={raw} label={lang} kind="code">
                <HighlightedCode code={raw} lang={lang} />
              </ChatBlock>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="chat-table">
              <div className="chat-table-scroll">
                <table>{children}</table>
              </div>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{rich(children)}</th>,
          td: ({ children }) => <td>{rich(children)}</td>,
          a: ({ href, children }) =>
            sourceNumberFromHref(href) != null ? (
              <CitationMark n={sourceNumberFromHref(href) as number} />
            ) : isInlineMarkHref(href) ? (
              <mark className="note-mark">{rich(children)}</mark>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
                {children}
              </a>
            ),
          mark: ({ children }) => <mark className="note-mark">{rich(children)}</mark>,
          strong: ({ children }) => <strong>{rich(children)}</strong>,
          em: ({ children }) => <em>{rich(children)}</em>,
        }}
      >
        {protectedMath.text}
      </ReactMarkdown>
    </StreamAnimRoot>
  );
});

function MathBlock({ value, note }: { value: string; note?: string }) {
  return (
    <ChatBlock copyText={value} label="math" kind="math">
      <div className="chat-math">{renderFormula(value, true) ?? value}</div>
      {note ? (
        <div className="mt-2 text-center text-[12px] font-semibold leading-4 text-muted">
          <MixedText text={note} />
        </div>
      ) : null}
    </ChatBlock>
  );
}

function MathStepsBlock({ steps }: { steps: Array<{ value: string; note?: string }> }) {
  const copyText = steps.map(({ value }) => value).join("\n");
  return (
    <ChatBlock copyText={copyText} label="math" kind="math">
      <div className="grid gap-4">
        {steps.map((step, index) => (
          <div key={`math-row-${index}`} className="grid gap-1.5">
            <div className="chat-math">{renderFormula(step.value, true) ?? step.value}</div>
            {step.note ? (
              <div className="text-center text-[12px] font-semibold leading-4 text-muted">
                <MixedText text={step.note} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ChatBlock>
  );
}

function segmentKey(segment: Segment, index: number): string {
  if (segment.kind === "md") return `md-${index}`;
  if (segment.kind === "table") return `table-${index}`;
  if (segment.kind === "math") return `math-${index}`;
  if (segment.kind === "code") return `code-${index}-${segment.lang}`;
  if (segment.kind === "toby") return `toby-${index}-${segment.block.type}`;
  if (segment.kind === "gallery") return `gallery-${segment.galleryId}`;
  return `visual-${index}`;
}

export const RichContent = memo(function RichContent({
  text,
  streaming = false,
  images = [],
  ka = false,
  onOpenImageUpload,
  allowNativeBlocks = true,
}: {
  text: string;
  streaming?: boolean;
  images?: ChatImageHit[];
  ka?: boolean;
  onOpenImageUpload?: (image: ChatImageHit) => void;
  allowNativeBlocks?: boolean;
}) {
  const { content: visibleText, sources: webSources } = useMemo(() => extractWebSearchSources(text), [text]);
  const layout = useMemo(() => layoutImageGalleries(prepareChatMarkdown(visibleText), images), [visibleText, images]);
  const segments = useMemo(() => splitRichContent(layout.segments), [layout]);
  const sourceIndex = useMemo(() => webSourceInsertionIndex(segments.map((segment) => ({
    kind: segment.kind,
    blockType: segment.kind === "toby" ? segment.block.type : undefined,
  }))), [segments]);
  const liveIndex = streaming ? segments.length - 1 : -1;
  const frozen = streaming ? Math.max(0, liveIndex) : segments.length;
  const seenFrozen = useRef(0);
  const seenToby = useRef(0);
  const appearFrom = seenFrozen.current;
  useLayoutEffect(() => {
    seenFrozen.current = streaming ? frozen : 0;
    if (!streaming) seenToby.current = 0;
  }, [streaming, frozen]);

  return (
    <div className={`chat-body text-foreground${streaming ? " chat-body-stream" : ""}`}>
      {segments.map((segment, index) => {
        const live = index === liveIndex;
        const appear = streaming && !live && index >= appearFrom && segment.kind !== "md";
        const wrap = appear ? "chat-stream-block" : undefined;
        const key = segmentKey(segment, index);
        if (segment.kind === "md") {
          const previous = segments[index - 1];
          const followsRichBlock = previous !== undefined && previous.kind !== "md";
          const markdown = followsRichBlock ? removeLeadingRuleAfterBlock(segment.text) : segment.text;
          return <Fragment key={key}>
            <MarkdownBody text={markdown} streaming={live && streaming} />
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
          </Fragment>;
        }
        if (segment.kind === "gallery") {
          return (
            <Fragment key={key}>
            <div className={`my-5 first:mt-0 last:mb-0 ${wrap ?? ""}`}>
              <ImageGallery images={segment.images} ka={ka} onOpenUpload={onOpenImageUpload} />
            </div>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        if (segment.kind === "table") {
          return (
            <Fragment key={key}>
            <div className={wrap}>
              <ChatTable headers={segment.headers} rows={segment.rows} />
            </div>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        if (segment.kind === "math" && segment.step) {
          const previous = segments[index - 1];
          if (previous?.kind === "math" && previous.step) return null;
          let end = index + 1;
          while (end < segments.length) {
            const candidate = segments[end];
            if (candidate?.kind !== "math" || !candidate.step) break;
            end += 1;
          }
          return (
            <Fragment key={`math-steps-${index}`}>
            <div className={wrap}>
              <MathStepsBlock steps={segments.slice(index, end).flatMap((step) =>
                step.kind === "math" ? [{ value: step.value, note: step.note }] : [],
              )} />
            </div>
            {!streaming && webSources.length > 0 && end - 1 === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        if (segment.kind === "math") {
          return (
            <Fragment key={key}>
            <div className={wrap}>
              <MathBlock value={segment.value} note={segment.note} />
            </div>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        if (segment.kind === "code") {
          return (
            <Fragment key={key}>
            <div className={wrap}>
              <ChatBlock copyText={segment.text} label={segment.lang || "text"} kind="code">
                <HighlightedCode code={segment.text} lang={segment.lang} />
              </ChatBlock>
            </div>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        if (segment.kind === "toby") {
          if (!allowNativeBlocks) return <Fragment key={key}>
            <ChatBlock copyText={JSON.stringify(segment.block.data, null, 2)} label={`toby ${segment.block.type}`} kind="code"><code>{JSON.stringify(segment.block.data, null, 2)}</code></ChatBlock>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
          </Fragment>;
          const node = <ChatBlockStateScope scope={key}><TobyBlockView block={segment.block} streaming={live && streaming} images={images} /></ChatBlockStateScope>;
          return (
            <Fragment key={key}>
            <div className={wrap}>
              {live && streaming ? (
                <StreamAnimRoot
                  active
                  seen={seenToby.current}
                  onSeen={(next) => {
                    seenToby.current = next;
                  }}
                >
                  {node}
                </StreamAnimRoot>
              ) : (
                node
              )}
            </div>
            {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
            </Fragment>
          );
        }
        return (
          <Fragment key={key}>
          <div className={`my-5 first:mt-0 last:mb-0 ${wrap ?? ""}`}>
            <ChatBlockStateScope scope={key}><VisualBlockView block={segment.block} /></ChatBlockStateScope>
          </div>
          {!streaming && webSources.length > 0 && index === sourceIndex ? <SearchSources sources={webSources} /> : null}
          </Fragment>
        );
      })}
      {!streaming && webSources.length > 0 && sourceIndex < 0 ? <SearchSources sources={webSources} /> : null}
      {!streaming && layout.remaining.length > 0 ? (
        <div className="my-5 first:mt-0 last:mb-0">
          <ImageGallery images={layout.remaining} ka={ka} onOpenUpload={onOpenImageUpload} />
        </div>
      ) : null}
      {streaming && (
        <span className="streaming-caret ml-0.5 inline-block h-4 w-1.5 translate-y-px bg-foreground align-middle" />
      )}
    </div>
  );
});
