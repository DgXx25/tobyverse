import type { EntityId, IsoDateString } from "@/types/common";

export type AppUser = {
  uid: EntityId;
  email: string | null;
  displayName: string | null;
};

export type UserProfile = {
  id: EntityId;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};
