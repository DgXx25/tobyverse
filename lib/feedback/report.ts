export type CompactFeedbackReport = {
  projectId: string;
  messageId: string;
  reason: string;
  note: string;
  createdAt: string;
};

function cleanInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function compactFeedbackReport(input: {
  projectId: string;
  messageId: string;
  reason: string;
  note?: string;
  createdAt?: string;
}): CompactFeedbackReport {
  const reason = cleanInline(input.reason).slice(0, 120);
  if (!reason) throw new Error("Choose a reason to send this report.");
  return {
    projectId: input.projectId.trim(),
    messageId: input.messageId.trim(),
    reason,
    note: (input.note ?? "").trim().slice(0, 500),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
