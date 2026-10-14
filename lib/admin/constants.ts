export function adminUids(): Set<string> {
  return new Set((process.env.ADMIN_UIDS ?? "").split(",").map((uid) => uid.trim()).filter(Boolean));
}

export function isAdminUid(uid: string | null | undefined): boolean {
  return Boolean(uid && adminUids().has(uid));
}
