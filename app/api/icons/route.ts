import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ICONS_DIR = path.join(process.cwd(), "node_modules", "@hugeicons", "core-free-icons", "dist", "esm");
const iconCache = new Map<string, unknown>();
const iconReads = new Map<string, Promise<unknown | null>>();

function validIconName(name: string): boolean {
  return /^[A-Za-z0-9]+Icon$/.test(name);
}

async function readIcon(name: string): Promise<unknown | null> {
  if (iconCache.has(name)) return iconCache.get(name) ?? null;
  const pending = iconReads.get(name);
  if (pending) return pending;

  const read = (async () => {
    try {
      const source = await readFile(path.join(ICONS_DIR, `${name}.js`), "utf8");
      const match = source.match(/const \w+ = (\[[\s\S]*?\]);/);
      if (!match) return null;
      const icon = Function(`"use strict"; return (${match[1]})`)() as unknown;
      iconCache.set(name, icon);
      return icon;
    } catch {
      return null;
    } finally {
      iconReads.delete(name);
    }
  })();
  iconReads.set(name, read);
  return read;
}

const ICON_HEADERS = { "Cache-Control": "public, max-age=31536000, immutable" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const namesParam = params.get("names");
  if (namesParam !== null) {
    const names = [...new Set(namesParam.split(",").filter(validIconName))].slice(0, 80);
    if (names.length === 0) return NextResponse.json({}, { status: 400 });
    const entries = await Promise.all(names.map(async (name) => [name, await readIcon(name)] as const));
    return NextResponse.json(Object.fromEntries(entries), { headers: ICON_HEADERS });
  }

  const name = params.get("name") ?? "";
  if (!validIconName(name)) return NextResponse.json(null, { status: 400 });
  const icon = await readIcon(name);
  return icon ? NextResponse.json(icon, { headers: ICON_HEADERS }) : NextResponse.json(null, { status: 404 });
}
