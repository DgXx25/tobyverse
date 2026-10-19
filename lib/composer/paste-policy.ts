/** Ordinary documents stay editable in chat; only multi-page pastes become source attachments. */
export const LARGE_PASTE_CHARS = 12_000;

export function shouldAttachPastedText(text: string): boolean {
  const value = text.trim();
  return value.length >= LARGE_PASTE_CHARS && !/^https?:\/\/\S+$/i.test(value);
}
