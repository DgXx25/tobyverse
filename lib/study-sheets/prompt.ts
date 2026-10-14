import { withWritingContract } from "@/lib/ai/voice";

export function studySheetSystemPrompt(): string {
  return withWritingContract(`Write the note as ordinary markdown. No JSON. No code fence around the note.
The first line is a short title: # Title
Then write the way you would explain it in text: short paragraphs. A table only when two or more things are being compared. $...$ is an equation only.
Write in the user's language. Meaning first, so a first-time reader can say the point in their own words.
If Sources are included, the note follows those sources.
Do not invent a block schema, and do not label sections Idea, Example, or Pitfall unless the material itself needs that shape.`);
}
