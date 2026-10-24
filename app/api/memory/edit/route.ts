import { z } from "zod";
import { generateJson } from "@/lib/ai/json";
import { assertAccountRequest, authErrorResponse, AuthError } from "@/lib/api/assert";
import { aiUsageErrorResponse, startAiUsageSession } from "@/lib/billing/server";
import { memoryEditPrompt, MEMORY_EDIT_SYSTEM } from "@/lib/memory/prompt";
import { asMemoryFacts, parseMemoryOps } from "@/lib/memory/normalize";
import { memorySafeText, containsSensitiveMemory } from "@/lib/memory/privacy";
import { applyPersonalMemoryEdit, formatPersonalMemory, parsePersonalMemory } from "@/lib/memory/summary";
import { memoryStatus, replacePersonalMemory } from "@/lib/memory/personal-server";
import type { UserMemory } from "@/types/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editSchema = z.object({
  operations: z.array(z.object({
    op: z.enum(["add", "update", "delete"]),
    id: z.string().optional(),
    content: z.string().max(200).optional(),
  })).max(20),
});

export async function POST(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > 8_000) return Response.json({ error: "Request too large." }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    const parsed = z.object({ instruction: z.string().trim().min(1).max(2_000), revision: z.number().int().nonnegative() }).strict().safeParse(body);
    if (!parsed.success) return Response.json({ error: "Describe a memory change in 2,000 characters or less." }, { status: 400 });
    const instruction = parsed.data.instruction;
    if (!memorySafeText(instruction) || containsSensitiveMemory(instruction)) {
      return Response.json({ error: "Remove private details or credentials from the memory request." }, { status: 400 });
    }

    const status = await memoryStatus(uid);
    if (status.revision !== parsed.data.revision) {
      throw new AuthError("Memory changed since this popup opened. Reload the latest memory before updating it.", 409);
    }

    const legacy = status.personalization
      ? parsePersonalMemory(formatPersonalMemory([], status.personalization))
        .map((entry, index) => ({ id: `legacy-${index}`, content: entry.content }))
      : [];
    const memories = [...asMemoryFacts(status.memories, 320), ...legacy];
    let usage;
    try { usage = await startAiUsageSession(uid); }
    catch (error) { return aiUsageErrorResponse(error); }
    const result = await generateJson(
      memoryEditPrompt({ instruction, memories }),
      editSchema,
      { systemInstruction: MEMORY_EDIT_SYSTEM, usage: usage.report },
    ).finally(() => usage.commit().catch(error => console.error("[ai-usage] commit failed", error)));

    if (!result.ok) return Response.json({ error: "I couldn't safely update this memory. Try describing the change more clearly." }, { status: 502 });
    const operations = parseMemoryOps(result.data, new Set(memories.map(item => item.id)), 20)
      .filter(operation => operation.op !== "delete" || explicitlyAsksToRemoveMemory(instruction));
    if (operations.length === 0) {
      return Response.json({ error: "No clear personal-memory change was found. Your current memory is unchanged." }, { status: 422 });
    }

    const current = memories.map(item => {
      const trusted = status.memories.find(fact => fact.id === item.id) as UserMemory | undefined;
      const date = trusted ? (trusted.updatedAt || trusted.createdAt)?.slice(0, 10) ?? null : null;
      return { id: item.id, content: item.content, date };
    });
    const updated = applyPersonalMemoryEdit(current, operations);
    if (JSON.stringify(updated) === JSON.stringify(current.map(({ content, date }) => ({ content, date })))) {
      return Response.json({ error: "That change is already reflected in your memory." }, { status: 422 });
    }
    const summary = updated.map(entry => `- ${entry.content}${entry.date ? ` [${entry.date}]` : ""}`).join("\n");
    const next = await replacePersonalMemory(uid, summary, status.revision);
    return Response.json(next, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    if (error instanceof Error && /each memory|private information|summary is too long/i.test(error.message)) return Response.json({ error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

function explicitlyAsksToRemoveMemory(instruction: string): boolean {
  if (/\b(?:do not|don['’]?t|never)\s+(?:please\s+)?(?:forget|delete|remove|clear)\b|(?:არ|ნუ)\s*(?:წაშალ|მოაშორ|ამოიღ|დაივიწყ)/i.test(instruction)) return false;
  return /\b(?:forget everything (?:you (?:know|remember) )?about me|forget all (?:my )?memories|(?:clear|delete|remove) all (?:my )?memories)\b|\b(?:forget|delete|remove|clear)\b.{0,100}\b(?:memory|memories|fact|preference|this|that|it)\b|\b(?:memory|memories|fact|preference)\b.{0,100}\b(?:forget|delete|remove|clear)\b|(?:მეხსიერებ|ფაქტ|პრეფერენცი)[^\n]{0,80}(?:წაშალ|მოაშორ|ამოიღ|დაივიწყ)|(?:წაშალ|მოაშორ|ამოიღ|დაივიწყ)[^\n]{0,80}(?:მეხსიერებ|ფაქტ|პრეფერენცი)/i.test(instruction);
}
