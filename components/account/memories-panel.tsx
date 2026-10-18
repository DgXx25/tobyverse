"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ObservationsPanel } from "@/components/account/observations-panel";
import { deleteMemory, subscribeMemories } from "@/lib/memory/store";
import { deleteLearningProfile, subscribeLearningProfile } from "@/lib/memory/profile";
import type { UserMemory } from "@/types/memory";

export function MemoriesPanel() {
  const { user } = useAuth();
  const userId = user?.uid ?? "";
  const [items, setItems] = useState<UserMemory[]>([]);
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!userId) { setItems([]); setProfile(""); setLoading(false); return; }
    setLoading(true); setError("");
    const stopMemories = subscribeMemories(userId, next => { setItems(next); setLoading(false); }, () => { setError("Could not load memory. Try reopening Settings."); setLoading(false); });
    const stopProfile = subscribeLearningProfile(userId, setProfile);
    return () => { stopMemories(); stopProfile(); };
  }, [userId]);
  if (!userId) return <p className="text-[15px] leading-7 text-muted">Sign in to manage memory.</p>;
  return <ObservationsPanel key={userId} userId={userId} memories={items} preferences={profile} loading={loading} loadError={error}
    onRemoveShared={async id => {
      if (id === "preferences") { await deleteLearningProfile(userId); setProfile(""); }
      else await deleteMemory(userId, id);
    }} />;
}
