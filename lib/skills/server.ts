import { readFile } from "node:fs/promises";
import path from "node:path";
import { RUNTIME_SKILL_CATALOG } from "@/lib/skills/catalog";

const MAX_SKILL_CHARS = 12_000;
const MAX_SKILLS_PER_TURN = 2;

/** Only bundled catalog IDs can resolve to files. No user paths, uploads, URLs, or scripts. */
export async function loadRuntimeSkill(id: string) {
  const entry = RUNTIME_SKILL_CATALOG.find((skill) => skill.name === id);
  if (!entry) return null;
  const source = await readFile(path.join(process.cwd(), "lib", "skills", "library", entry.name, "SKILL.md"), "utf8");
  const parsed = source.replace(/^\uFEFF/, "").match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  const content = parsed?.[1].trim();
  if (!content || content.length > MAX_SKILL_CHARS) throw new Error(`Invalid bundled guide: ${entry.name}`);
  return { ...entry, content };
}

/** A fresh budget for each request; reserve before awaiting to deduplicate parallel calls. */
export function createSkillLoader() {
  const loaded = new Set<string>();
  return async (id?: string) => {
    if (!id || !RUNTIME_SKILL_CATALOG.some((skill) => skill.name === id)) {
      return { ok: false, error: "Unknown guide ID. Answer using the available context." };
    }
    if (loaded.has(id)) return { ok: true, name: id, alreadyLoaded: true };
    if (loaded.size >= MAX_SKILLS_PER_TURN) {
      return { ok: true, skipped: true, message: "Two guides are already loaded. Complete the request using the available guidance; do not retry." };
    }
    loaded.add(id);
    try {
      const skill = await loadRuntimeSkill(id);
      return { ok: true, skill };
    } catch (error) {
      loaded.delete(id);
      throw error;
    }
  };
}
