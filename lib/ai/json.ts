import { type ZodTypeAny } from "zod";
import { generateText } from "@/lib/ai/gemini";
import { clipText } from "@/lib/materials/limits";
import { jsonIssueText, parseJsonLoose } from "@/lib/schema/json";
import type { AiUsageReporter } from "@/types/billing";

const REPAIR_SYSTEM = "Return valid JSON only. No markdown. No HTML.";

export async function generateJson(
  prompt: string,
  schema: ZodTypeAny,
  options: { systemInstruction?: string; usage?: AiUsageReporter } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  let raw = "";
  try {
    raw = await generateText(prompt, {
      json: true,
      systemInstruction: options.systemInstruction ?? "Return JSON only. No HTML.",
      usage: options.usage,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Generation failed." };
  }

  const first = parseAndValidate(raw, schema);
  if (first.ok) return first;

  try {
    raw = await generateText(
      `Fix this JSON.\nIssues: ${first.error}\n\nDocument:\n${clipText(raw, 6000)}`,
      { json: true, systemInstruction: REPAIR_SYSTEM, usage: options.usage },
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Repair failed." };
  }

  return parseAndValidate(raw, schema);
}

function parseAndValidate(
  raw: string,
  schema: ZodTypeAny,
): { ok: true; data: unknown } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch {
    return { ok: false, error: "Model did not return JSON." };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: jsonIssueText(result.error) };
  }
  return { ok: true, data: result.data };
}

export async function validateOrRepairJson(
  value: unknown,
  schema: ZodTypeAny,
  options: { usage?: AiUsageReporter } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const first = schema.safeParse(value);
  if (first.success) return { ok: true, data: first.data };

  const raw = typeof value === "string" ? value : JSON.stringify(value);
  try {
    const repaired = await generateText(
      `Fix this JSON.\nIssues: ${jsonIssueText(first.error)}\n\nDocument:\n${clipText(raw, 6000)}`,
      { json: true, systemInstruction: REPAIR_SYSTEM, usage: options.usage },
    );
    return parseAndValidate(repaired, schema);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Repair failed." };
  }
}
