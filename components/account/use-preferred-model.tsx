"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { useUserProfile } from "@/components/account/use-user-profile";
import { readPreferredModel, updatePreferredModel } from "@/lib/account/store";
import {
  aiModelDisplayName,
  availableAiModels,
  isAllowedModelSelection,
  isKnownModelSelection,
  resolveAiModel,
  type AiModelSelection,
  type AiModelSelectionOption,
} from "@/lib/ai/catalog";
import { requestPlanUpgrade } from "@/lib/billing/limit-prompt";

type PreferredModelValue = {
  model: AiModelSelection;
  name: string;
  options: AiModelSelectionOption[];
  setModel: (id: AiModelSelection) => void;
};

const PreferredModelContext = createContext<PreferredModelValue | null>(null);
const preferenceKey = (uid: string) => `tv.preferredModel.${uid}`;

export function PreferredModelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const userId = user?.uid;
  const modelPlan = profile?.access?.plan ?? (profile?.admin ? "admin" : "free_beta");
  const [localPreference, setLocalPreference] = useState<{ uid: string; model: AiModelSelection } | null>(null);
  const selectionVersion = useRef(0);
  const fromProfile = resolveAiModel(profile?.preferredModel, modelPlan);
  const cachedModel = localPreference?.uid === userId ? localPreference?.model ?? null : null;
  const model = cachedModel && isAllowedModelSelection(cachedModel, modelPlan) ? cachedModel : fromProfile;

  useEffect(() => {
    if (!userId) {
      setLocalPreference(null);
      return;
    }
    let alive = true;
    const versionAtStart = selectionVersion.current;
    let cached: AiModelSelection | null = null;
    try {
      const saved = window.localStorage.getItem(preferenceKey(userId));
      cached = saved && isKnownModelSelection(saved) ? saved : null;
      setLocalPreference(cached ? { uid: userId, model: cached } : null);
    } catch {
      setLocalPreference(null);
    }
    // Restore cross-device choices through the same API used to save them. This avoids relying
    // on a Firestore realtime listener, which can be unavailable while the chat itself works.
    void readPreferredModel().then((saved) => {
      if (!alive || !saved || selectionVersion.current !== versionAtStart) return;
      // The server is canonical on mount; keep local state as a fallback if the API is offline.
      setLocalPreference({ uid: userId, model: saved });
      try { window.localStorage.setItem(preferenceKey(userId), saved); } catch { /* private mode */ }
    });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || cachedModel === null || fromProfile !== cachedModel) return;
    try { window.localStorage.removeItem(preferenceKey(userId)); } catch { /* private mode */ }
    setLocalPreference(null);
  }, [cachedModel, fromProfile, userId]);

  const setModel = useCallback(
    (id: AiModelSelection) => {
      if (!isAllowedModelSelection(id, modelPlan)) {
        requestPlanUpgrade("model");
        return;
      }
      if (!userId) return;
      selectionVersion.current += 1;
      const next = { uid: userId, model: id };
      setLocalPreference(next);
      try { window.localStorage.setItem(preferenceKey(userId), id); } catch { /* private mode */ }
      void updatePreferredModel(userId, id);
    },
    [modelPlan, userId],
  );

  const value = useMemo<PreferredModelValue>(
    () => ({
      model,
      name: aiModelDisplayName(model),
      options: availableAiModels(modelPlan),
      setModel,
    }),
    [modelPlan, model, setModel],
  );

  return <PreferredModelContext.Provider value={value}>{children}</PreferredModelContext.Provider>;
}

export function usePreferredModel(): PreferredModelValue {
  const value = useContext(PreferredModelContext);
  if (value) return value;
  return {
    model: resolveAiModel(null, false),
    name: aiModelDisplayName(resolveAiModel(null, false)),
    options: availableAiModels(false),
    setModel: () => undefined,
  };
}
