import mammoth from "mammoth";

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (!text) {
    throw new Error("This Word file has no extractable text.");
  }
  return text;
}
