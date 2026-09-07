export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty JSON.");
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(raw);
}

export function jsonIssueText(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.map(String).join(".") || "root"}: ${issue.message}`)
    .join("; ");
}
