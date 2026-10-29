"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { subscribeUserProfile } from "@/lib/account/store";
import { asUserPlan, asUserUsage, emptyUsage } from "@/lib/account/plan";
import type { UserProfile } from "@/types/user";
import type { AccountAccess } from "@/types/billing-admin";
import type { User } from "firebase/auth";

const accessCache = new Map<string, { value?: AccountAccess; at: number; pending?: Promise<AccountAccess> }>();
function fallbackProfile(user: User): UserProfile {
  return {
    id: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    plan: asUserPlan(undefined),
    admin: false,
    usage: emptyUsage(),
    preferredModel: null,
    preferredEffort: null,
    chatMode: null,
    theme: null,
    themeAccents: { light: "default", dark: "default" },
    highContrast: false,
    createdAt: user.metadata.creationTime ?? null,
    updatedAt: null,
  };
}

async function loadAccess(user: User): Promise<AccountAccess> {
  const previous = accessCache.get(user.uid);
  if (previous?.pending) return previous.pending;
  // Keep the access snapshot warm for the same interval as the periodic refresh below.
  if (previous?.value && Date.now() - previous.at < 60_000) return previous.value;
  const pending = user.getIdToken().then(async (token) => {
    const response = await fetch("/api/account/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Account access unavailable");
    const { access: value }: { access: AccountAccess } = await response.json();
    accessCache.set(user.uid, { value, at: Date.now() });
    return value;
  }).catch((error) => { accessCache.delete(user.uid); throw error; });
  accessCache.set(user.uid, { at: 0, pending });
  return pending;
}

export function useUserProfile(): { profile: UserProfile | null; loading: boolean } {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<{ uid: string; value: AccountAccess } | null>(null);

  useEffect(() => {
    if (!user || user.isAnonymous) { setAccess(null); return; }
    let alive = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void loadAccess(user).then((value) => { if (alive) setAccess({ uid: user.uid, value }); }).catch(() => {
        // Keep the last verified plan on transient network failures; dropping it would reset a Premium model to Auto.
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [user]);

  // Refresh at the exact grant/paid-period boundary, even when the tab remains open.
  useEffect(() => {
    if (!user || access?.uid !== user.uid) return;
    const times = [access.value.expiresAt, access.value.grant?.expiresAt, ...access.value.subscriptions.flatMap((subscription) => [subscription.periodEndsAt, subscription.scheduledEndsAt])]
      .filter((value): value is string => !!value).map(Date.parse).filter((value) => value > Date.now());
    if (!times.length) return;
    const timer = window.setTimeout(() => {
      accessCache.delete(user.uid);
      void loadAccess(user).then((value) => setAccess({ uid: user.uid, value })).catch(() => setAccess(null));
    }, Math.min(2_147_483_647, Math.max(100, Math.min(...times) - Date.now() + 100)));
    return () => window.clearTimeout(timer);
  }, [access, user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeUserProfile(
      user.uid,
      (next) => {
        setProfile(next ?? fallbackProfile(user));
        setLoading(false);
      },
      () => {
        // Keep plan-aware UI usable if the Firestore browser WebChannel is blocked. Server
        // account access is fetched over HTTP independently and still supplies verified rights.
        setProfile((current) => current?.id === user.uid ? current : fallbackProfile(user));
        setLoading(false);
      },
    );
  }, [user]);

  const usage = asUserUsage(profile?.usage);
  const effective = access?.uid === user?.uid ? access?.value : undefined;
  // Server access is sufficient to surface allowed models even if the Firestore realtime
  // profile listener has not delivered its first snapshot yet.
  const currentProfile = profile?.id === user?.uid ? profile : user && effective ? fallbackProfile(user) : null;
  const resolved = currentProfile ? {
    ...currentProfile,
    access: effective,
    plan: asUserPlan(effective?.plan ?? "free_beta"),
    admin: effective ? effective.source === "admin" : currentProfile.admin,
    usage: currentProfile === profile ? usage : emptyUsage(),
  } : null;
  return { profile: resolved, loading };
}
