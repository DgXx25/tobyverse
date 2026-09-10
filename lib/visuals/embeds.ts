import { lookupElement } from "@/lib/visuals/elements";
import type { EmbedKind } from "@/types/visual";

export function isEmbedKind(value: unknown): value is EmbedKind {
  return value === "icon" || value === "flag" || value === "element" || value === "compound" || value === "emoji";
}

export function flagCode(id: string): string | null {
  const code = id.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function flagImageUrl(code: string): string {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

export function compoundImageUrl(id: string): string {
  const query = id.trim();
  const looksFormula = /^[A-Z][A-Za-z0-9()]{0,24}$/.test(query);
  const path = looksFormula
    ? `compound/formula/${encodeURIComponent(query)}`
    : `compound/name/${encodeURIComponent(query)}`;
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${path}/PNG?image_size=240x180`;
}

export function embedKindFromId(kind: string | undefined, id: string): EmbedKind {
  if (kind === "flag" || kind === "element" || kind === "compound" || kind === "icon" || kind === "emoji") {
    return kind;
  }
  if (flagCode(id)) return "flag";
  if (lookupElement(id)) return "element";
  if (/\p{Extended_Pictographic}/u.test(id)) return "emoji";
  if (/^[A-Z][A-Za-z0-9()]{1,18}$/.test(id.trim())) return "compound";
  return "icon";
}
