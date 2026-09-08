import { extractPlainText, MaterialExtractError } from "@/lib/materials/extract";
import { extractUrlText } from "@/lib/materials/url";
import { EXTRACT_MAX_CHARS, MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, clipText, previewText, uploadTooLargeMessage } from "@/lib/materials/limits";
import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAccountRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { text?: unknown; title?: unknown; url?: unknown };
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
      return Response.json(
        { error: "Could not read upload. File may be too large." },
        { status: 413 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Choose a PDF, DOCX, PPTX, TXT, MD, or image file." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const phase = String(form.get("phase") ?? "all").trim().toLowerCase();
    const extracted = await extractPlainText({
      filename: file.name,
      mime: file.type,
      buffer,
      includeImages: phase !== "text",
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
  }
}
