"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseVisualBlock } from "@/lib/visuals/validate";
import { VisualBlockView } from "@/components/visuals/visual-block";
import type { VisualBlock } from "@/types/visual";

type Segment =
  | { kind: "md"; text: string }
  | { kind: "visual"; block: VisualBlock };

function splitRichContent(text: string): Segment[] {
  const parts: Segment[] = [];
  const pattern = /```(?:visual|json)\s*([\s\S]*?)```/gi;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      parts.push({ kind: "md", text: text.slice(last, match.index) });
    }
    const parsed = parseVisualBlock(tryJson(match[1]));
    if (parsed) {
      parts.push({ kind: "visual", block: parsed });
    } else {
      parts.push({ kind: "md", text: match[0] });
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ kind: "md", text: text.slice(last) });
  }

  return parts.length ? parts : [{ kind: "md", text }];
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

function mdChunks(text: string): string[] {
  const parts = text.split(/\n\n/);
  return parts.length ? parts : [text];
}

const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{children}</p>,
        h1: ({ children }) => <h1>{children}</h1>,
        h2: ({ children }) => <h2>{children}</h2>,
        h3: ({ children }) => <h3>{children}</h3>,
        ul: ({ children }) => <ul>{children}</ul>,
        ol: ({ children }) => <ol>{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l border-border pl-3 text-muted">{children}</blockquote>
        ),
        code: ({ className, children }) => {
          const inline = !className;
          if (inline) {
            return <code>{children}</code>;
          }
          return <code className="block overflow-x-auto font-mono text-[12px] leading-5">{children}</code>;
        },
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="text-muted">{children}</thead>,
        th: ({ children }) => <th className="border-b border-border font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b border-border/70">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} className="underline decoration-border underline-offset-2 hover:text-foreground">
            {children}
          </a>
        ),
        strong: ({ children }) => <strong>{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

export function RichContent({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const segments = splitRichContent(text);

  return (
    <div className="chat-body text-foreground">
      {segments.map((segment, index) =>
        segment.kind === "md" ? (
          mdChunks(segment.text).map((chunk, chunkIndex, chunks) => (
            <MarkdownBody
              key={`${index}-${chunkIndex}`}
              text={chunkIndex < chunks.length - 1 ? `${chunk}\n\n` : chunk}
            />
          ))
        ) : (
          <div key={index} className="my-3 first:mt-0 last:mb-0">
            <VisualBlockView block={segment.block} />
          </div>
        ),
      )}
      {streaming && (
        <span className="streaming-caret ml-0.5 inline-block h-4 w-1.5 translate-y-px bg-foreground align-middle" />
      )}
    </div>
  );
}
