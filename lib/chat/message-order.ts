/** Retried writes reuse an ID. Keep that message at its original position so
 * a retry's historical boundary cannot move past later turns in another tab. */
export function preserveMessageOrder<T extends Record<string, unknown>>(payload: T, existing?: Record<string, unknown>): T {
  return { ...payload,
    ...(existing?.createdAt !== undefined ? { createdAt: existing.createdAt } : {}),
    ...(existing?.createdAtClient !== undefined ? { createdAtClient: existing.createdAtClient } : {}),
  };
}
