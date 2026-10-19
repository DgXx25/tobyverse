const MAX_TITLE_LENGTH = 100;
const GENERIC_TITLE = /^(?:notes?|study notes?|study sheet|report|path|course path|quiz|exam|practice|flashcards|data table)$/i;

/** A bounded, deterministic suffix keeps repeated outputs recognizable. */
export function uniqueArtifactTitle(title: string, existing: Iterable<string>, context = "", label = ""): string {
  let base = title.replace(/\s+/g, " ").trim();
  const subject = context.replace(/\s+/g, " ").trim().slice(0, 68);
  if ((!base || GENERIC_TITLE.test(base)) && subject) base = `${subject}${label ? ` · ${label}` : ""}`;
  base = (base || label || "Note").slice(0, MAX_TITLE_LENGTH);
  const used = new Set(Array.from(existing, value => value.trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  for (let i = 2; i <= 10002; i++) {
    const suffix = ` (${i})`;
    const candidate = `${base.slice(0, MAX_TITLE_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  // A bounded caller can never fill this many suffixes.
  throw new Error("Could not choose an artifact title.");
}
