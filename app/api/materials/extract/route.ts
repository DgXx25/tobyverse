import { extractPlainText, MaterialExtractError } from "@/lib/materials/extract";
import { extractUrlText } from "@/lib/materials/url";
import {
  EXTRACT_MAX_CHARS,
  clipText,
  previewText,
} from "@/lib/materials/limits";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "@/lib/materials/limits";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { downloadGcsObject, uploadGcsObject } from "@/lib/storage-gcs";
import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractStoredFile(input: {
  uid: string;
  path: string;
  textPath?: string;
  phase: string;
  usage?: Awaited<ReturnType<typeof startAiUsageSession>>;
}) {
  const parsed = parseMaterialStoragePath(input.path);
  if (!parsed || parsed.userId !== input.uid) {
    throw new MaterialExtractError("Invalid storage path.");
  }
  const { buffer, contentType } = await downloadGcsObject(input.path);
  const extracted = await extractPlainText({
    filename: parsed.name,
    mime: contentType,
    buffer,
    includeImages: input.phase !== "text",
    usage: input.usage?.report,
  });
  let textStored = false;
  if (input.textPath && input.phase !== "images") {
    const textParsed = parseMaterialStoragePath(input.textPath);
    if (textParsed && textParsed.userId === input.uid && textParsed.projectId === parsed.projectId && textParsed.materialId === parsed.materialId && textParsed.name === "extracted.txt") {
      await uploadGcsObject(input.textPath, Buffer.from(extracted.text, "utf8"), "text/plain; charset=utf-8");
      textStored = true;
    }
  }
  return {
    preview: previewText(extracted.text),
    type: extracted.type,
    title: parsed.name.replace(/\.[^.]+$/, "") || "File",
    pageCount: extracted.pageCount,
    textChars: extracted.text.length,
    textStored,
    images: extracted.images,
    text: textStored ? undefined : extracted.text,
  };
}

export async function POST(request: Request) {
  let uid = "";
  try {
    uid = (await assertAccountRequest(request)).uid;
  } catch (error) {
    return authErrorResponse(error);
  }

  let usage;
  try {
    usage = await startAiUsageSession(uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    return Response.json({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        text?: unknown;
        title?: unknown;
        url?: unknown;
        path?: unknown;
        textPath?: unknown;
        phase?: unknown;
      };
      const path = typeof body.path === "string" ? body.path.trim() : "";
      if (path) {
        const phase = typeof body.phase === "string" ? body.phase.trim().toLowerCase() : "text";
        const textPath = typeof body.textPath === "string" ? body.textPath.trim() : "";
        return Response.json(
          await extractStoredFile({ uid, path, textPath: textPath || undefined, phase, usage }),
        );
      }

      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (url) {
        const extracted = await extractUrlText(url);
        return Response.json({
          text: extracted.text,
          preview: previewText(extracted.text),
          type: "url",
          title:
            typeof body.title === "string" && body.title.trim()
              ? body.title.trim()
              : extracted.title,
          pageCount: 1,
          images: [],
        });
      }

      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return Response.json({ error: "Paste some text or a URL first." }, { status: 400 });
      }
      const clipped = clipText(text, EXTRACT_MAX_CHARS);
      return Response.json({
        text: clipped,
        preview: previewText(clipped),
        type: "paste",
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Pasted notes",
        pageCount: 1,
        images: [],
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a PDF, DOCX, PPTX, TXT, MD, or image file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const phase = String(form.get("phase") ?? "all").trim().toLowerCase();
    const extracted = await extractPlainText({
      filename: file.name,
      mime: file.type,
      buffer,
      includeImages: phase !== "text",
      usage: usage.report,
    });

    return Response.json({
      text: extracted.text,
      preview: previewText(extracted.text),
      type: extracted.type,
      title: file.name.replace(/\.[^.]+$/, "") || "File",
      pageCount: extracted.pageCount,
      images: extracted.images,
    });
  } catch (error) {
    const message =
      error instanceof MaterialExtractError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not extract text.";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
  }
}
