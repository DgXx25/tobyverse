import type { EntityId, IsoDateString } from "@/types/common";

export type UserMemory = {
  id: EntityId;
  content: string;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type ChatMemoryContext = {
  id: EntityId;
  content: string;
};

export type MemoryOp =
  | { op: "add"; content: string }
  | { op: "update"; id: string; content: string }
  | { op: "delete"; id: string };
