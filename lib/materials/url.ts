import { lookup } from "node:dns/promises";
import { EXTRACT_MAX_CHARS, clipText } from "@/lib/materials/limits";
import { MaterialExtractError } from "@/lib/materials/extract";

const MAX_HTML_BYTES = 1_500_000;
const MAX_HOPS = 5;

function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "::1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  const match = ip.match(/^172\.(\d+)\./);
  if (match) {
    const octet = Number(match[1]);
    return octet >= 16 && octet <= 31;
  }
  return false;
}

function assertPublicHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MaterialExtractError("That URL is not valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MaterialExtractError("Only http and https URLs are supported.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    isPrivateIp(host)
  ) {
    throw new MaterialExtractError("That URL cannot be fetched.");
  }

  return parsed;
}

async function assertPublicHost(url: URL): Promise<void> {
  try {
    const result = await lookup(url.hostname, { all: true });
    if (result.some((item) => isPrivateIp(item.address))) {
      throw new MaterialExtractError("That URL cannot be fetched.");
    }
  } catch (error) {
    if (error instanceof MaterialExtractError) throw error;
    throw new MaterialExtractError("Could not resolve that URL.");
  }
}

function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return { title: decodeEntities(title.replace(/\s+/g, " ").trim()), text: cleaned };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

async function fetchHop(url: URL, hops: number): Promise<{ title: string; text: string }> {
  if (hops > MAX_HOPS) {
    throw new MaterialExtractError("Too many redirects.");
  }

  await assertPublicHost(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "TobyVerseBot/1.0" },
    });
  } catch (error) {
    if (error instanceof MaterialExtractError) throw error;
    throw new MaterialExtractError("Could not fetch that page.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new MaterialExtractError("The short link did not resolve.");
    const next = assertPublicHttpUrl(new URL(location, url).toString());
    return fetchHop(next, hops + 1);
  }

  if (!response.ok) {
    throw new MaterialExtractError("That page could not be read.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new MaterialExtractError("That URL is not a readable page.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_HTML_BYTES) {
    throw new MaterialExtractError("That page is too large to ingest.");
  }

  if (contentType.includes("text/plain")) {
    const text = clipText(buffer.toString("utf8"), EXTRACT_MAX_CHARS);
    if (!text) throw new MaterialExtractError("That page has no extractable text.");
    return { title: url.hostname, text };
  }

  const extracted = htmlToText(buffer.toString("utf8"));
  const text = clipText(extracted.text, EXTRACT_MAX_CHARS);
  if (!text) {
    throw new MaterialExtractError("That page has no extractable text.");
  }

  return { title: extracted.title || url.hostname, text };
}

export async function extractUrlText(rawUrl: string): Promise<{ title: string; text: string; type: "url" }> {
  const url = assertPublicHttpUrl(rawUrl.trim());
  const extracted = await fetchHop(url, 0);
  return { ...extracted, type: "url" };
}
