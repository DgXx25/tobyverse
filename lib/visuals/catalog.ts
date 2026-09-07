import { createElement, type ReactNode } from "react";
import katex from "katex";
import {
  Activity,
  Apple,
  ArrowRight,
  Atom,
  Bone,
  BookOpen,
  Brain,
  Bug,
  Check,
  Dna,
  Droplet,
  Flag,
  Flame,
  FlaskConical,
  Globe,
  Heart,
  Leaf,
  Moon,
  Mountain,
  Pill,
  Shield,
  Star,
  Sun,
  TriangleAlert,
  User,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { CATALOG_KINDS, type CatalogKind } from "@/types/visual";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  apple: Apple,
  arrow: ArrowRight,
  atom: Atom,
  bone: Bone,
  book: BookOpen,
  brain: Brain,
  bug: Bug,
  cell: Activity,
  check: Check,
  dna: Dna,
  droplet: Droplet,
  flag: Flag,
  flame: Flame,
  flask: FlaskConical,
  globe: Globe,
  heart: Heart,
  leaf: Leaf,
  lungs: Wind,
  moon: Moon,
  mountain: Mountain,
  pill: Pill,
  shield: Shield,
  star: Star,
  sun: Sun,
  virus: Bug,
  warning: TriangleAlert,
  user: User,
  wind: Wind,
  x: X,
  zap: Zap,
};

const ELEMENT_LIST = [
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Fe",
  "Cu",
  "Zn",
  "Ag",
  "Au",
  "Hg",
  "Pb",
  "U",
  "H2O",
  "CO2",
  "O2",
  "N2",
  "NaCl",
  "CH4",
  "NH3",
  "HCl",
  "NaOH",
  "H2SO4",
  "Fe2O3",
  "C6H12O6",
];

const ELEMENTS = new Map(ELEMENT_LIST.map((item) => [item.toUpperCase(), item]));

export const CATALOG_ICON_IDS = Object.keys(ICONS);
export const CATALOG_ELEMENT_IDS = ELEMENT_LIST;

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
  const latex = source.trim();
  if (!latex) return null;
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: display,
      output: "html",
    });
    if (!html) return null;
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
      const Icon = ICONS[id.trim().toLowerCase()];
      if (!Icon) return null;
      return createElement(Icon, {
        className: iconClass(className),
        strokeWidth: 1.6,
        "aria-hidden": true,
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
      const symbol = ELEMENTS.get(id.trim().toUpperCase().replace(/[^A-Z0-9]/gi, ""));
      if (!symbol) return null;
      return createElement(
        "span",
        {
          className:
            "inline-flex min-w-[2.4rem] items-center justify-center rounded-lg border border-border bg-surface-2 px-2 py-1 text-[13px] font-medium text-foreground",
        },
        symbol,
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
