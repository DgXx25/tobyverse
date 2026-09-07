import { Timestamp } from "firebase/firestore";
import type { IsoDateString } from "@/types/common";

export function toIsoDate(value: unknown): IsoDateString | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
