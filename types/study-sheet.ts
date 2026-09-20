import type { EntityId, IsoDateString } from "@/types/common";
import type { VisualBlock } from "@/types/visual";

/** Add a type + renderer. Do not delete old fields. Bump schemaVersion. */
export const NOTES_SCHEMA_VERSION = 11 as const;

export type NoteSchemaVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type NotesLiveState = {
  title: string;
  blocks: VisualBlock[];
  status: string | null;
  sheetId?: string;
};

export type StudySheet = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  title: string;
  schemaVersion: NoteSchemaVersion;
  /** v4. Unknown block types are dropped on read. */
  blocks: VisualBlock[];
  /** v1 prose / markdown. Kept on disk even after a v2 save. */
  content: string;
  sections: Record<string, string>;
  /** Derived v1 fallback text. Not written to Firestore. */
  prose: string;
  sourceMaterialIds: EntityId[];
  createdAt: IsoDateString | null;
};
