import { PREVIEW_HTML_MAX, PREVIEW_IMAGE_MAX_BYTES } from "@/lib/materials/limits";

const ALLOWED_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "STRONG",
  "EM",
  "B",
  "I",
  "U",
  "BR",
  "SPAN",
  "A",
  "IMG",
  "BLOCKQUOTE",
  "HR",
  "SUP",
  "SUB",
  "DIV",
]);

function allowedHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  return null;
}

function allowedImgSrc(value: string): string | null {
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value) && value.length < PREVIEW_IMAGE_MAX_BYTES * 1.4) {
    return value;
  }
  return null;
}

export function sanitizePreviewHtml(html: string): string {
  if (typeof window === "undefined" || !html.trim()) return "";
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return "";
  cleanNode(root);
  return root.innerHTML.slice(0, PREVIEW_HTML_MAX);
}

function cleanNode(node: Node): void {
  const children = [...node.childNodes];
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName;
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcset") {
        el.removeAttribute(attr.name);
        continue;
      }
      if (tag === "A" && name === "href") {
        const href = allowedHref(attr.value);
        if (href) el.setAttribute("href", href);
        else el.removeAttribute("href");
        continue;
      }
      if (tag === "IMG" && name === "src") {
        const src = allowedImgSrc(attr.value);
        if (src) el.setAttribute("src", src);
        else el.remove();
        continue;
      }
      if (tag === "IMG" && (name === "alt" || name === "width" || name === "height")) continue;
      if ((tag === "TD" || tag === "TH") && (name === "colspan" || name === "rowspan")) continue;
      el.removeAttribute(attr.name);
    }
    if (tag === "A") el.setAttribute("rel", "noopener noreferrer");
    if (tag === "IMG" && !el.getAttribute("src")) {
      el.remove();
      continue;
    }
    cleanNode(el);
  }
}

export async function docxBytesToHtml(bytes: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { arrayBuffer: bytes },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.readAsBase64String();
        const bytesApprox = Math.floor((data.length * 3) / 4);
        if (bytesApprox > PREVIEW_IMAGE_MAX_BYTES) return { src: "" };
        return { src: `data:${image.contentType};base64,${data}` };
      }),
    },
  );
  return sanitizePreviewHtml(result.value);
}
