"use client";

import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import { renderFormula } from "@/lib/visuals/catalog";
import { splitRichParts } from "@/lib/visuals/math";

export function MixedText({ text }: { text: string }) {
  const parts = splitRichParts(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "latex") {
          if (part.display) {
            return (
              <div key={index} className="my-3 w-full overflow-x-auto">
                {renderFormula(part.value, true) ?? part.value}
              </div>
            );
          }
          return (
            <span key={index} className="mx-0.5 inline-block align-middle">
              {renderFormula(part.value, false) ?? part.value}
            </span>
          );
        }
        if (part.kind === "mark") {
          return (
            <mark key={index} className="note-mark">
              {part.value}
            </mark>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </>
  );
}

export function BodyText({ text, className = "" }: { text: string; className?: string }) {
  const paras = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    <div className={className}>
      {paras.map((para, index) => (
        <div key={index} className={index ? "mt-2 whitespace-pre-wrap" : "whitespace-pre-wrap"}>
          <MixedText text={para} />
        </div>
      ))}
    </div>
  );
}

export function withInlineRich(children: ReactNode): ReactNode {
  if (typeof children === "string" || typeof children === "number") {
    return <MixedText text={String(children)} />;
  }
  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === "string" || typeof child === "number") {
        return <MixedText key={index} text={String(child)} />;
      }
      return child;
    });
  }
  return children;
}
