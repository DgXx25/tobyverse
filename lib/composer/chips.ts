export type ComposerChipIdentity = { id: string };

export function patchComposerChip<T extends ComposerChipIdentity>(
  chips: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return chips.map((chip) => chip.id === id ? { ...chip, ...patch } : chip);
}
