import { createElement, type ReactNode } from "react";
import katex from "katex";
import { CATALOG_KINDS, type CatalogKind } from "@/types/visual";
import { CATALOG_ICON_IDS, UiIcon, resolveUiIconName, type UiIconName } from "@/components/workspace/ui-icon";
import { unwrapLatex } from "@/lib/visuals/math";
import { CATALOG_ELEMENT_IDS, lookupElement } from "@/lib/visuals/elements";

export { CATALOG_ICON_IDS, CATALOG_ELEMENT_IDS };

const LABEL_ICONS: Array<[RegExp, UiIconName]> = [
  [/prokaryot|პროკარიოტ|bacter|ბაქტერ/i, "bug"],
  [/eukaryot|ევკარიოტ/i, "brain"],
  [/virus|ვირუს/i, "virus"],
  [/dna|დნმ/i, "dna"],
  [/nucleus|ბირთვ/i, "atom"],
  [/cell|უჯრედ/i, "cell"],
  [/leaf|ფოთოლ|plant|მცენარ/i, "leaf"],
  [/heart|გულ/i, "heart"],
  [/lung|ფილტვ/i, "lungs"],
  [/atom|ატომ|molecule|მოლეკულ/i, "atom"],
  [/brain|ტვინ/i, "brain"],
  [/bone|ძვლ/i, "bone"],
  [/water|წყალ|membrane|მემბრან/i, "droplet"],
  [/flask|ლაბ|chem|ქიმ/i, "flask"],
  [/energy|ენერგ|zap|ელექტრ/i, "zap"],
  [/warning|საფრთხ/i, "warning"],
  [/shield|დაცვ|immune|იმუნ/i, "shield"],
];

/** Known catalog id, or null when the name is unknown (caller shows a generic mark). */
export function catalogIconId(name?: string | null, label?: string | null): UiIconName | null {
  const fromName = resolveUiIconName(name);
  if (fromName) return fromName;
  const hay = label?.trim() ?? "";
  if (!hay) return null;
  for (const [pattern, id] of LABEL_ICONS) {
    if (pattern.test(hay)) return id;
  }
  return null;
}

export function isCatalogKind(value: unknown): value is CatalogKind {
  return typeof value === "string" && (CATALOG_KINDS as readonly string[]).includes(value);
}

function flagEmoji(code: string): string {
  return [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function iconClass(className?: string) {
  return className ?? "h-5 w-5 shrink-0 text-muted";
}

export function renderFormula(source: string, display = false): ReactNode | null {
  const latex = unwrapLatex(source);
  if (!latex) return null;
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: display,
      output: "html",
      strict: false,
    });
    if (!html || html.includes("katex-error")) {
      return createElement("span", { className: "font-mono text-[15px] text-foreground" }, latex);
    }
    return createElement("span", {
      className: display ? "katex-display-host" : "katex-host",
      dangerouslySetInnerHTML: { __html: html },
    });
  } catch {
    return createElement("span", { className: "font-mono text-[15px] text-foreground" }, latex);
  }
}

/** Resolves a catalog id to a React node. Unknown id or kind → null (text only). New kinds: catalog entry + renderer. */
export function visualFromId(kind: string, id: string, className?: string): ReactNode | null {
  try {
    if (!kind || kind === "none" || !id.trim()) return null;
    if (kind === "icon") {
      const name = catalogIconId(id);
      if (!name) return null;
      return createElement(UiIcon, {
        name,
        size: 20,
        className: iconClass(className),
      });
    }
    if (kind === "flag") {
      const code = id.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) return null;
      return createElement(
        "span",
        {
          className: "inline-flex h-8 min-w-10 items-center justify-center rounded-md bg-surface-2 px-1.5 text-[22px] leading-none",
          title: code,
        },
        flagEmoji(code),
      );
    }
    if (kind === "element") {
      const element = lookupElement(id);
      if (!element) return null;
      return createElement(
        "span",
        {
          className:
            "inline-flex min-w-[2.4rem] items-center justify-center rounded-lg border border-border bg-surface-2 px-2 py-1 text-[13px] font-medium text-foreground",
        },
        element.symbol,
      );
    }
    if (kind === "formula") {
      return renderFormula(id, true);
    }
    return null;
  } catch {
    return null;
  }
}
