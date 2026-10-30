type NamedMaterial = { id: string; title: string; createdAt?: number };
type SearchableMaterial = NamedMaterial & { chunks: number; status?: string };

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

/** An explicitly named file takes priority over similar passages in other project sources. */
export function focusedSourceIds(materials: NamedMaterial[], prompt: string, now = Date.now()): string[] {
  const query = ` ${normalize(prompt)} `;
  const named = materials.filter((material) => {
    const title = normalize(material.title);
    return title.length >= 3 && query.includes(` ${title} `);
  });
  if (named.length) {
    return named
      .filter((material) => !named.some((other) =>
        other.id !== material.id && normalize(other.title).includes(normalize(material.title)) && other.title.length > material.title.length,
      ))
      .map((material) => material.id);
  }

  const asksForFreshUpload = /(?:ახლ\p{L}*|ბოლოს).{0,30}ატვირთულ|ატვირთულ.{0,30}(?:ახლ\p{L}*|ბოლოს)|\b(?:newly|just|recently|latest)\s+uploaded\b/iu.test(prompt);
  if (!asksForFreshUpload) return [];
  const latest = materials
    .filter((material) => typeof material.createdAt === "number")
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  return latest?.createdAt && now - latest.createdAt <= 24 * 60 * 60 * 1000 ? [latest.id] : [];
}

/** Carry a named source into a short, referential follow-up without carrying it into a new topic. */
export function focusQueryForTurn(materials: NamedMaterial[], prompt: string, previousUserPrompts: string[]): string {
  if (focusedSourceIds(materials, prompt).length) return prompt;
  const explicitlyRefersToSource = /ფაილ\p{L}*|დოკუმენტ\p{L}*|წყარ\p{L}*|ატვირთულ\p{L}*|ამ\s+(?:ფოტო|სურათ)\p{L}*|ფოტოზე|ფოტოში|სურათზე|სურათში|\b(?:file|document|source|uploaded|attached|this photo|this image)\b/iu.test(prompt);
  if (prompt.length > 100 && !explicitlyRefersToSource) return prompt;
  const refersToPrevious = /ამას|ამაში|ამის|ეგ|იმას|მისი|ამ წყარ|ამ ფაილ|ფაილ\p{L}*|დოკუმენტ\p{L}*|წყარ\p{L}*|ატვირთულ\p{L}*|ფოტოზე|ფოტოში|სურათზე|სურათში|წაიკითხ|ხედავ|ხედავს|დაინახ|ჩანს|შემოდის|გააგრძელ|\b(?:this|that|it|read|see|same|again|file|document|source|uploaded)\b/iu.test(prompt);
  if (!refersToPrevious) return prompt;
  for (const previous of [...previousUserPrompts].reverse().slice(0, 2)) {
    if (focusedSourceIds(materials, previous).length) return `${previous}\n${prompt}`;
  }
  return prompt;
}

/** Empty selection means all checked; the explicit none marker means none checked. */
export function selectSearchSources<T extends SearchableMaterial>(materials: T[], selectedIds: string[], prompt: string) {
  const allowed = new Set(selectedIds.length ? selectedIds : materials.map((material) => material.id));
  const selected = materials.filter((material) => allowed.has(material.id));
  const focusedIds = focusedSourceIds(selected, prompt);
  const indexed = selected.filter((material) => material.chunks > 0 && material.status !== "failed");
  const comparingSources = /შეადარ|შედარ|compare|versus|\bvs\b/iu.test(prompt);
  const exclusiveFocus = focusedIds.length > 0 && !comparingSources;
  const focusedSet = new Set(focusedIds);
  const usable = exclusiveFocus ? indexed.filter((material) => focusedSet.has(material.id)) : indexed;
  return { selected, indexed, focusedIds, usable, exclusiveFocus };
}
