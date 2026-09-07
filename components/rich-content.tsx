"use client";

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

function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-6">{children}</p>,
        h1: ({ children }) => <h1 className="mb-3 text-lg font-medium tracking-tight">{children}</h1>,
        h2: ({ children }) => (
          <h2 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{children}</h2>
        ),
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-medium">{children}</h3>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-6">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l border-border pl-3 text-muted last:mb-0">{children}</blockquote>
        ),
        code: ({ className, children }) => {
          const inline = !className;
          if (inline) {
            return (
              <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px]">{children}</code>
            );
          }
          return (
            <code className="block overflow-x-auto font-mono text-[12px] leading-6">{children}</code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-3 last:mb-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-left text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="text-muted">{children}</thead>,
        th: ({ children }) => (
          <th className="border-b border-border px-2 py-1.5 font-medium">{children}</th>
        ),
        td: ({ children }) => <td className="border-b border-border/70 px-2 py-1.5 align-top">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} className="underline decoration-border underline-offset-2 hover:text-foreground">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function RichContent({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const segments = splitRichContent(text);

  return (
    <div className="chat-body text-foreground/90">
      {segments.map((segment, index) =>
        segment.kind === "md" ? (
          <MarkdownBody key={index} text={segment.text} />
        ) : (
          <div key={index} className="my-3">
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
