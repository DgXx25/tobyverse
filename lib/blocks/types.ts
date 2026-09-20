import type { ZodType } from "zod";

export type ChatBlockDef<T = unknown> = {
  id: string;
  /** Lookup tokens. Unigrams and short phrases. Never sent to the model. */
  keys: string[];
  when: string;
  schema: ZodType<T>;
  /** Injected only when this kind is picked for the turn. */
  card: () => string;
};

export type ParsedChatBlock = {
  type: string;
  data: unknown;
};
