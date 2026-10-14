import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RenderedPptxSlide = {
  page: number;
  mime: "image/png";
  bytes: Uint8Array;
  complete: true;
};

export type PptxRenderResult =
  | { available: true; slides: RenderedPptxSlide[] }
  | { available: false; reason: "renderer unavailable" | "render failed" };

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function renderPptxSlides(buffer: Buffer): Promise<PptxRenderResult> {
  const converter = (await commandExists("soffice"))
    ? "soffice"
    : (await commandExists("libreoffice"))
      ? "libreoffice"
      : null;
  if (!converter || !(await commandExists("pdftoppm"))) {
    return { available: false, reason: "renderer unavailable" };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "tobyverse-pptx-"));
  const inputPath = path.join(tempDir, "source.pptx");
  const pdfPath = path.join(tempDir, "source.pdf");
  const outputPrefix = path.join(tempDir, "slide");
  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(converter, ["--headless", "--convert-to", "pdf", "--outdir", tempDir, inputPath], {
      windowsHide: true,
      timeout: 45_000,
    });
    await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, outputPrefix], {
      windowsHide: true,
      timeout: 45_000,
    });
    const names = (await readdir(tempDir))
      .filter((name) => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    if (names.length === 0) return { available: false, reason: "render failed" };
    return {
      available: true,
      slides: await Promise.all(names.map(async (name) => ({
        page: Number(name.match(/\d+/)?.[0]),
        mime: "image/png" as const,
        bytes: new Uint8Array(await readFile(path.join(tempDir, name))),
        complete: true as const,
      }))),
    };
  } catch {
    return { available: false, reason: "render failed" };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
