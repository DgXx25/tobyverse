"use client";

import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import { StreamAnimRoot } from "@/components/workspace/stream-text";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { parsePartialObject } from "@/lib/ai/json-stream";
import { parseTobyFence } from "@/lib/blocks/registry";
import { TobyBlockView } from "@/components/blocks/toby-block";
import type { ParsedChatBlock } from "@/lib/blocks/types";
import { parseVisualBlock } from "@/lib/visuals/validate";
import { VisualBlockView } from "@/components/visuals/visual-block";
import { MixedText, TableCellRich, withInlineRich } from "@/components/visuals/mixed-text";
import { htmlToMarkdown } from "@/lib/visuals/html-rich";
import { ChatBlock } from "@/components/workspace/chat-block";
import { HighlightedCode } from "@/components/workspace/highlighted-code";
import { renderFormula } from "@/lib/visuals/catalog";
import { protectInlineMath, restoreInlineMath, scrubLeakedMarkup, splitCodeFences, splitDisplayMath } from "@/lib/visuals/math";
import { CitationMark } from "@/components/workspace/citations";
import { linkCitations, sourceNumberFromHref } from "@/lib/rag/sources";
import { isInlineMarkHref, remarkInlineMarks } from "@/lib/visuals/markdown-marks";
import { layoutChatTable, prepareChatMarkdown, splitMarkdownTables } from "@/lib/visuals/markdown-table";
import type { VisualBlock } from "@/types/visual";

type Segment =
  | { kind: "md"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "math"; value: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "visual"; block: VisualBlock }
  | { kind: "toby"; block: ParsedChatBlock };

function splitRichContent(text: string): Segment[] {
  return splitCodeFences(prepareChatMarkdown(text)).flatMap((part): Segment[] => {
    if (part.kind === "md") {
      return splitMarkdownTables(htmlToMarkdown(part.text)).flatMap((piece): Segment[] => {
        if (piece.kind === "table") return [piece];
        return splitDisplayMath(piece.text).flatMap((item): Segment[] => {
          if (item.kind === "math") return item.value ? [{ kind: "math", value: item.value }] : [];
          return item.text.trim() ? [{ kind: "md", text: item.text }] : [];
        });
      });
    }
    if (part.lang === "math" || part.lang === "latex") {
      return part.text.trim() ? [{ kind: "math", value: part.text.trim() }] : [];
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
    <div className="chat-table">
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
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{rich(children)}</li>,
          br: () => <br />,
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
              <table>{children}</table>
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

function MathBlock({ value }: { value: string }) {
  return (
    <ChatBlock copyText={value} label="math" kind="math">
      <div className="chat-math">{renderFormula(value, true) ?? value}</div>
    </ChatBlock>
  );
}

function segmentKey(segment: Segment, index: number): string {
  if (segment.kind === "md") return `md-${index}`;
  if (segment.kind === "table") return `table-${index}`;
  if (segment.kind === "math") return `math-${index}`;
  if (segment.kind === "code") return `code-${index}-${segment.lang}`;
  if (segment.kind === "toby") return `toby-${index}-${segment.block.type}`;
  return `visual-${index}`;
}

export function RichContent({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const segments = splitRichContent(text);
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
          return <MarkdownBody key={key} text={segment.text} streaming={live && streaming} />;
        }
        if (segment.kind === "table") {
          return (
            <div key={key} className={wrap}>
              <ChatTable headers={segment.headers} rows={segment.rows} />
            </div>
          );
        }
        if (segment.kind === "math") {
          return (
            <div key={key} className={wrap}>
              <MathBlock value={segment.value} />
            </div>
          );
        }
        if (segment.kind === "code") {
          return (
            <div key={key} className={wrap}>
              <ChatBlock copyText={segment.text} label={segment.lang || "text"} kind="code">
                <HighlightedCode code={segment.text} lang={segment.lang} />
              </ChatBlock>
            </div>
          );
        }
        if (segment.kind === "toby") {
          const node = <TobyBlockView block={segment.block} streaming={live && streaming} />;
          return (
            <div key={key} className={wrap}>
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
          );
        }
        return (
          <div key={key} className={`my-5 first:mt-0 last:mb-0 ${wrap ?? ""}`}>
            <VisualBlockView block={segment.block} />
          </div>
        );
      })}
      {streaming && (
        <span className="streaming-caret ml-0.5 inline-block h-4 w-1.5 translate-y-px bg-foreground align-middle" />
      )}
    </div>
  );
}
