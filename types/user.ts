import type { EntityId, IsoDateString } from "@/types/common";
import type { ThemeAccents } from "@/lib/workspace/theme";
import type { ChatMode } from "@/types/chat";

export type AppUser = {
  uid: EntityId;
  email: string | null;
  displayName: string | null;
};

/** Stored plan values; legacy `free` is normalized at read time. */
export const USER_PLANS = ["free_beta", "lite", "pro", "max", "team"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export type UserUsage = {
  weekStart: string;
  chatTurns: number;
  practiceGenerated: number;
  notesGenerated: number;
  storageBytes: number;
};

export type UserProfile = {
  /** Server-resolved access, held only in memory; never written to the user document. */
  access?: import("@/types/billing-admin").AccountAccess;
  id: EntityId;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  plan: UserPlan;
  admin: boolean;
  usage: UserUsage;
  preferredModel: string | null;
  /** Reply style new notebooks start with. Null until the user picks one. */
  chatMode: ChatMode | null;
  theme: string | null;
  themeAccents: ThemeAccents;
  highContrast: boolean;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};
