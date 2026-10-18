"use client";

import { Children, Fragment, isValidElement, type CSSProperties, type ReactNode } from "react";
import "katex/dist/katex.min.css";
import { renderFormula } from "@/lib/visuals/catalog";
import { restoreInlineMath, scrubLeakedMarkup, splitRichParts } from "@/lib/visuals/math";
import { htmlToMarkdown, scrubInlineHtml } from "@/lib/visuals/html-rich";
import { peelCellGloss, splitMarkdownTables, splitTableCellContent } from "@/lib/visuals/markdown-table";
import { StreamWords } from "@/components/workspace/stream-text";

export function MixedText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const parts = splitRichParts(scrubLeakedMarkup(scrubInlineHtml(text)));
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "latex") {
          if (part.display) {
            return (
              <div key={index} className="my-5 w-full overflow-x-auto">
                {renderFormula(part.value, true) ?? part.value}
              </div>
            );
          }
          return (
            <span key={index} className="chat-inline-math">
              {renderFormula(part.value, false) ?? part.value}
            </span>
          );
        }
        if (part.kind === "mark") {
          return (
            <mark key={index} className="note-mark">
              <MixedText text={part.value} streaming={streaming} />
            </mark>
          );
        }
        if (part.kind === "strong") {
          return (
            <strong key={index}>
              <MixedText text={part.value} streaming={streaming} />
            </strong>
          );
        }
        if (part.kind === "em") {
          return (
            <em key={index}>
              <MixedText text={part.value} streaming={streaming} />
            </em>
          );
        }
        if (part.kind === "break") {
          return <br key={index} />;
        }
        return <span key={index}>{streaming ? <StreamWords text={part.value} /> : part.value}</span>;
      })}
    </>
  );
}

export function BodyText({ text, className = "" }: { text: string; className?: string }) {
  const pieces = splitMarkdownTables(htmlToMarkdown(text));
  return (
    <div className={className}>
      {pieces.map((piece, index) => {
        if (piece.kind === "table") {
          return <PlainTable key={index} headers={piece.headers} rows={piece.rows} />;
        }
        const paras = piece.text
          .split(/\n{2,}/)
          .map((item) => item.trim())
          .filter(Boolean);
        return paras.map((para, paraIndex) => (
          <div
            key={`${index}-${paraIndex}`}
            className={index || paraIndex ? "mt-2 whitespace-pre-wrap" : "whitespace-pre-wrap"}
          >
            <MixedText text={para} />
          </div>
        ));
      })}
    </div>
  );
}

export function TableCellRich({ text, pair }: { text: string; pair?: boolean }) {
  const parts = splitTableCellContent(text);
  if (parts.some((part) => part.kind === "code")) {
    return (
      <span className="chat-table-stack">
        {parts.map((part, index) => {
          if (part.kind === "code") {
            return (
              <pre key={index} className="chat-table-code">
                <code>{part.text}</code>
              </pre>
            );
          }
          const afterCode = parts.slice(0, index).some((item) => item.kind === "code");
          return (
            <span key={index} className={afterCode || (pair && index > 0) ? "chat-table-gloss" : "chat-table-lead"}>
              <MixedText text={part.text} />
            </span>
          );
        })}
      </span>
    );
  }
  const lines = pair ? peelCellGloss(text) : [text];
  if (lines.length <= 1) return <MixedText text={text} />;
  return (
    <span className="chat-table-stack">
      {lines.map((line, index) => (
        <span key={index} className={index === 0 ? "chat-table-lead" : "chat-table-gloss"}>
          <MixedText text={line} />
        </span>
      ))}
    </span>
  );
}

function PlainTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="chat-table my-5" style={{ "--chat-table-columns": headers.length } as CSSProperties}>
      <div className="chat-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((cell, index) => (
                <th key={index}>
                  <MixedText text={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={splitTableCellContent(cell).some((part) => part.kind === "code") ? "chat-table-has-code" : undefined}>
                    <TableCellRich text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function flattenInline(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (isValidElement(child) && child.type === Fragment) {
      out.push(...flattenInline((child.props as { children?: ReactNode }).children));
      return;
    }
    out.push(child);
  });
  return out;
}

function isBreakNode(child: ReactNode): boolean {
  return isValidElement(child) && child.type === "br";
}

export function withInlineRich(children: ReactNode, slots?: string[], streaming = false): ReactNode {
  const textOf = (value: string) => (slots?.length ? restoreInlineMath(value, slots) : value);
  const nodes = flattenInline(children);
  const merged: ReactNode[] = [];
  let buf = "";
  const flush = (key: string) => {
    if (!buf) return;
    merged.push(<MixedText key={key} text={textOf(buf)} streaming={streaming} />);
    buf = "";
  };
  nodes.forEach((child, index) => {
    if (typeof child === "string" || typeof child === "number") {
      buf += String(child);
      return;
    }
    if (isBreakNode(child)) {
      buf += "<br>";
      return;
    }
    flush(`t${index}`);
    merged.push(child);
  });
  flush("t-end");
  if (merged.length === 0) return null;
  if (merged.length === 1) return merged[0];
  return merged;
}
