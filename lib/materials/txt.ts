export function extractTxtText(buffer: Buffer): string {
  const text = buffer.toString("utf8").trim();
  if (!text) {
    throw new Error("This text file is empty.");
  }
  return text;
}
