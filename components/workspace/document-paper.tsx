import type { ReactNode } from "react";

export function DocumentPaper({
  children,
  html,
}: {
  children?: ReactNode;
  html?: string;
}) {
  return (
    <div className="h-full overflow-y-auto px-3 py-5">
      <article className="doc-paper">
        {html ? (
          <div className="doc-paper-body" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          children
        )}
      </article>
    </div>
  );
}
