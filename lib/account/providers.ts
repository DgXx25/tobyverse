import type { UserInfo } from "firebase/auth";

export type SignInMethod = {
  id: string;
  providerId: string;
  label: string;
  description: string;
};

const LABELS: Record<string, { label: string; description: string }> = {
  "google.com": { label: "Google", description: "Signed in with Google." },
  "apple.com": { label: "Apple", description: "Signed in with Apple." },
  password: { label: "Email", description: "Signed in with email." },
};

export function signInMethodsFromProviderData(providers: UserInfo[] | undefined | null): SignInMethod[] {
  const seen = new Set<string>();
  const methods: SignInMethod[] = [];
  for (const item of providers ?? []) {
    const providerId = item.providerId?.trim();
    if (!providerId || seen.has(providerId)) continue;
    seen.add(providerId);
    const meta = LABELS[providerId] ?? { label: providerId, description: "Connected sign-in method." };
    methods.push({
      id: providerId,
      providerId,
      label: meta.label,
      description: meta.description,
    });
  }
  return methods;
}

export function firstNameFromUser(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = displayName?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  const local = email?.split("@")[0]?.trim();
  return local || "there";
}

export function initialsFromName(name: string | null | undefined, email: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0]) return parts[0].charAt(0).toUpperCase();
  const local = email?.trim().charAt(0);
  return (local ?? "T").toUpperCase();
}
