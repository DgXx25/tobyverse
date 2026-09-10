"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { subscribeUserProfile } from "@/lib/account/store";
import { asUserPlan, asUserUsage, emptyUsage } from "@/lib/account/plan";
import type { UserProfile } from "@/types/user";

export function useUserProfile(): { profile: UserProfile | null; loading: boolean } {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
        setProfile(
          next ?? {
            id: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            plan: asUserPlan(undefined),
            usage: emptyUsage(),
            preferredModel: null,
            createdAt: user.metadata.creationTime ?? null,
            updatedAt: null,
          },
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  const usage = asUserUsage(profile?.usage);
  const resolved = profile ? { ...profile, plan: asUserPlan(profile.plan), usage } : null;
  return { profile: resolved, loading };
}
