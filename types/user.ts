import type { EntityId, IsoDateString } from "@/types/common";

export type AppUser = {
  uid: EntityId;
  email: string | null;
  displayName: string | null;
};

/** Beta is free for everyone. Paid values are never accepted from the client. */
export const USER_PLANS = ["free"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export type UserUsage = {
  weekStart: string;
  chatTurns: number;
  practiceGenerated: number;
  notesGenerated: number;
  storageBytes: number;
};

export type UserProfile = {
  id: EntityId;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  plan: UserPlan;
  usage: UserUsage;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};
