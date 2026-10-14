import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ICONS_DIR = path.join(process.cwd(), "node_modules", "@hugeicons", "core-free-icons", "dist", "esm");

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!/^[A-Za-z0-9]+Icon$/.test(name)) {
    return NextResponse.json(null, { status: 400 });
  }
  try {
    const source = await readFile(path.join(ICONS_DIR, `${name}.js`), "utf8");
    const match = source.match(/const \w+ = (\[[\s\S]*?\]);/);
    if (!match) return NextResponse.json(null, { status: 404 });
    const icon = Function(`"use strict"; return (${match[1]})`)() as unknown;
    return NextResponse.json(icon, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json(null, { status: 404 });
  }
}
