import { z } from "zod";
import { generateJson } from "@/lib/ai/json";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { clipText } from "@/lib/materials/limits";
import { PROBLEM_EXERCISE_TYPES, THEORY_EXERCISE_TYPES, type ExerciseType } from "@/types/exercise";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  feedback: z.string().min(1).max(600),
  verdict: z.enum(["correct", "partial", "incorrect", "hint"]),
});

function asType(value: unknown): ExerciseType | null {
  if (typeof value !== "string") return null;
  if (
    (THEORY_EXERCISE_TYPES as readonly string[]).includes(value) ||
    (PROBLEM_EXERCISE_TYPES as readonly string[]).includes(value)
  ) {
    return value as ExerciseType;
  }
  return null;
}

export async function POST(request: Request) {
  let session;
  try {
    session = await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    type?: unknown;
    prompt?: unknown;
    answer?: unknown;
    mode?: unknown;
    reveal?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = asType(body.type);
  if (!type) {
    return Response.json({ error: "Unknown exercise type." }, { status: 400 });
  }

  const mode = body.mode === "normal" ? "normal" : "socratic";
  const reveal = body.reveal === true;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const answer = typeof body.answer === "string" ? body.answer : JSON.stringify(body.answer ?? "");

  const socratic = mode === "socratic" && !reveal;
  const paper = type === "paper";
  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }
  const result = await generateJson(
    `Exercise type: ${type}\nItem: ${clipText(prompt, 1500)}\nStudent: ${clipText(answer, paper ? 3500 : 1500)}\nMode: ${socratic ? "socratic" : "normal"}`,
    feedbackSchema,
    {
      systemInstruction: paper
        ? "JSON only. Grade a Georgian official application (განცხადება): addressee top-right, centered title implied, body with a clear polite request, date, name. Say what to rewrite. verdict correct only if layout and tone work; partial if salvageable; incorrect if the form is wrong. Feedback in the student's language. Short."
        : socratic
          ? "JSON only. Give a short hint. Never reveal the final answer."
          : "JSON only. Give concise feedback. You may confirm the answer.",
      usage: usage.report,
    },
  );
  await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json(result.data);
}
