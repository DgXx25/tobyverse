import { generateJson } from "@/lib/ai/json";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { clipText, SHEET_TOTAL_CHARS } from "@/lib/materials/limits";
import { collectNoteProse } from "@/lib/notes/compat";
import { splitNotePayload } from "@/lib/notes/blocks";
import { studySheetSystemPrompt } from "@/lib/study-sheets/prompt";
import { notesDocumentSchema } from "@/lib/visuals/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    projectTitle?: unknown;
    sources?: unknown;
    instruction?: unknown;
    currentBlocks?: unknown;
    currentTitle?: unknown;
    currentContent?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectTitle = typeof body.projectTitle === "string" ? body.projectTitle : "Project";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const currentTitle = typeof body.currentTitle === "string" ? body.currentTitle.trim() : "";
  const currentBlocks = Array.isArray(body.currentBlocks) ? body.currentBlocks : [];
  const currentContent = typeof body.currentContent === "string" ? body.currentContent.trim() : "";
  const sources = Array.isArray(body.sources) ? body.sources : [];

  const compiled = sources
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { title?: unknown; excerpt?: unknown; images?: unknown };
      if (typeof row.title !== "string") return [];
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
      const images = Array.isArray(row.images)
        ? row.images.flatMap((image) => {
            if (!image || typeof image !== "object") return [];
            const cell = image as { slide?: unknown; path?: unknown };
            if (typeof cell.path !== "string") return [];
            return [`- slide ${typeof cell.slide === "number" ? cell.slide : 1}: ${cell.path}`];
          })
        : [];
      if (!excerpt && images.length === 0) return [];
      return [
        `# ${row.title}\n${excerpt}${images.length ? `\nImages (cite path exactly, do not invent):\n${images.join("\n")}` : ""}`,
      ];
    })
    .join("\n\n");

  if (!compiled.trim() && currentBlocks.length === 0 && !currentContent && !instruction) {
    return Response.json({ error: "Add a topic or a file first." }, { status: 400 });
  }

  const result = await generateJson(
    [
      `Project: ${projectTitle}`,
      instruction ? `Instruction: ${instruction}` : null,
      currentTitle ? `Current title: ${currentTitle}` : null,
      currentBlocks.length
        ? `Current note blocks (replace in place, same note):\n${clipText(JSON.stringify(currentBlocks), SHEET_TOTAL_CHARS)}`
        : null,
      currentContent && currentBlocks.length === 0
        ? `Legacy note text to rebuild as blocks:\n${clipText(currentContent, SHEET_TOTAL_CHARS)}`
        : null,
      compiled.trim() ? `Sources:\n${clipText(compiled, SHEET_TOTAL_CHARS)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    notesDocumentSchema,
    { systemInstruction: studySheetSystemPrompt() },
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  const sheet = result.data as { title?: unknown; blocks?: unknown; content?: unknown; sections?: unknown };
  const title = typeof sheet.title === "string" && sheet.title.trim() ? sheet.title.trim().slice(0, 80) : "Notes";
  const fallback = collectNoteProse({
    content: sheet.content,
    sections: sheet.sections,
  }).prose;
  const { blocks, content } = splitNotePayload(sheet.blocks, fallback);
  if (blocks.length === 0 && !content.trim()) {
    return Response.json({ error: "Notes JSON was invalid." }, { status: 422 });
  }

  return Response.json({ title, blocks, content });
}
