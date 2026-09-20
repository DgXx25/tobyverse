export const INLINE_MARK_HREF = "#toby-mark";

type MdNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
};

export function isInlineMarkHref(href?: string | null): boolean {
  if (!href) return false;
  if (href === INLINE_MARK_HREF) return true;
  try {
    return new URL(href, "https://toby.local").hash === INLINE_MARK_HREF;
  } catch {
    return href.endsWith(INLINE_MARK_HREF);
  }
}

function splitMarkText(value: string): MdNode[] {
  const out: MdNode[] = [];
  const token = /==((?:(?!==)[\s\S])+?)==/g;
  let last = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = token.exec(value))) {
    const inner = match[1] ?? "";
    if (/\n\s*\n/.test(inner) || inner.length > 800) continue;
    found = true;
    if (match.index > last) {
      out.push({ type: "text", value: value.slice(last, match.index) });
    }
    out.push({
      type: "link",
      url: INLINE_MARK_HREF,
      children: [{ type: "text", value: inner.trim() }],
    });
    last = match.index + match[0].length;
  }
  if (!found) return [{ type: "text", value }];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function transform(node: MdNode): void {
  const children = node.children;
  if (!children) return;
  if (node.type === "link" || node.type === "linkReference") {
    for (const child of children) transform(child);
    return;
  }
  const next: MdNode[] = [];
  for (const child of children) {
    if (child.type === "text" && child.value && child.value.includes("==")) {
      next.push(...splitMarkText(child.value));
    } else {
      transform(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** Turn `==highlight==` into a mark-link before markdown becomes React children. */
export function remarkInlineMarks() {
  return (tree: MdNode) => {
    transform(tree);
  };
}
