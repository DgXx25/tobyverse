import JSZip from "jszip";
import { mimeFromName } from "@/lib/materials/types";
import { MAX_SLIDE_IMAGES } from "@/lib/materials/limits";

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const IMAGE_REL = "/image";
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type ExtractedSlideImage = {
  page: number;
  mime: string;
  bytes: Uint8Array;
};

export type ExtractedPptx = {
  text: string;
  pageCount: number;
  images: ExtractedSlideImage[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textFromSlideXml(xml: string): string {
  const paragraphs: string[] = [];
  const paraPattern = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
  let para: RegExpExecArray | null;
  while ((para = paraPattern.exec(xml))) {
    const body = para[1].replace(/<a:br\b[^>]*\/?>/gi, "\n");
    const runs: string[] = [];
    const textPattern = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi;
    let node: RegExpExecArray | null;
    while ((node = textPattern.exec(body))) {
      runs.push(decodeEntities(node[1].replace(/<[^>]+>/g, "")));
    }
    const line = runs.join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
    if (line) paragraphs.push(line);
  }
  return paragraphs.join("\n").trim();
}

function slideNumber(name: string): number {
  const match = name.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : 0;
}

function zipJoin(fromFile: string, target: string): string {
  const base = fromFile.split("/").slice(0, -1);
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function imageRels(xml: string): string[] {
  const targets: string[] = [];
  const pattern = /<Relationship\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const tag = match[0];
    if (!tag.includes(IMAGE_REL)) continue;
    const target = tag.match(/Target="([^"]+)"/i)?.[1];
    if (target && !target.startsWith("http")) targets.push(decodeEntities(target));
  }
  return targets;
}

export async function extractPptx(
  buffer: Buffer,
  options?: { includeImages?: boolean },
): Promise<ExtractedPptx> {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(OLE_MAGIC)) {
    throw new Error("This is an old .ppt file. Save it as .pptx and try again.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("Could not read this PowerPoint file.");
  }

  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slides.length === 0) {
    throw new Error("This PowerPoint file has no slides.");
  }

  const includeImages = options?.includeImages !== false;
  const parts: string[] = [];
  const images: ExtractedSlideImage[] = [];

  for (const [index, name] of slides.entries()) {
    const page = index + 1;
    const file = zip.files[name];
    const xml = file ? await file.async("string") : "";
    const text = xml ? textFromSlideXml(xml) : "";
    parts.push(`Slide ${page}\n${text || "no text on this slide"}`);

    if (!includeImages || images.length >= MAX_SLIDE_IMAGES) continue;
    const relsName = name.replace(/slides\/(slide\d+\.xml)$/i, "slides/_rels/$1.rels");
    const relsFile = zip.files[relsName];
    if (!relsFile) continue;
    const rels = imageRels(await relsFile.async("string"));
    for (const target of rels) {
      if (images.length >= MAX_SLIDE_IMAGES) break;
      const mediaPath = zipJoin(relsName, target);
      const media = zip.files[mediaPath] ?? zip.files[target.replace(/^\.\.\//, "ppt/")];
      if (!media) continue;
      const mime = mimeFromName(mediaPath);
      if (!IMAGE_MIMES.has(mime)) continue;
      const bytes = new Uint8Array(await media.async("uint8array"));
      if (bytes.length < 32) continue;
      images.push({ page, mime, bytes });
    }
  }

  return {
    text: parts.join("\n\n").trim(),
    pageCount: slides.length,
    images,
  };
}

export async function extractPptxText(buffer: Buffer): Promise<string> {
  const result = await extractPptx(buffer, { includeImages: false });
  if (!result.text.trim()) {
    throw new Error("This PowerPoint file has no extractable text.");
  }
  return result.text;
}
