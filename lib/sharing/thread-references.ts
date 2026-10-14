type ReferenceMessage = {
  attachments?: { materialId?: unknown }[];
  images?: { materialId?: unknown }[];
  artifact?: { kind?: unknown; id?: unknown } | null;
};

function addId(target: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const id = value.trim();
  if (id) target.add(id);
}

export function collectThreadReferences(messages: ReferenceMessage[]): {
  materialIds: string[];
  sheetIds: string[];
} {
  const materialIds = new Set<string>();
  const sheetIds = new Set<string>();

  for (const message of messages) {
    for (const attachment of message.attachments ?? []) addId(materialIds, attachment.materialId);
    for (const image of message.images ?? []) addId(materialIds, image.materialId);
    const artifact = message.artifact;
    if (artifact?.kind === "sheet" || artifact?.kind === "study_sheet") addId(sheetIds, artifact.id);
  }

  return { materialIds: [...materialIds], sheetIds: [...sheetIds] };
}
