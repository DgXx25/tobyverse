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
  aiEffortDisplayName,
  aiModelDisplayName,
  availableAiModels,
  DEFAULT_AI_EFFORT,
  isAiEffort,
  isAllowedModelSelection,
  isKnownModelSelection,
  resolveAiModel,
  type AiEffort,
  type AiModelSelection,
  type AiModelSelectionOption,
} from "@/lib/ai/catalog";
import { requestPlanUpgrade } from "@/lib/billing/limit-prompt";

type PreferredModelValue = {
  model: AiModelSelection;
  name: string;
  effort: AiEffort;
  effortName: string;
  options: AiModelSelectionOption[];
  setModel: (id: AiModelSelection) => void;
  setEffort: (effort: AiEffort) => void;
};

const PreferredModelContext = createContext<PreferredModelValue | null>(null);
const preferenceKey = (uid: string) => `tv.preferredModel.${uid}`;

export function PreferredModelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const userId = user?.uid;
  const modelPlan = profile?.access?.plan ?? (profile?.admin ? "admin" : "free_beta");
  const [localPreference, setLocalPreference] = useState<{ uid: string; model: AiModelSelection; effort: AiEffort } | null>(null);
  const selectionVersion = useRef(0);
  const fromProfile = resolveAiModel(profile?.preferredModel, modelPlan);
  const fromProfileEffort = profile?.preferredEffort ?? DEFAULT_AI_EFFORT;
  const cachedPreference = localPreference?.uid === userId ? localPreference : null;
  const model = cachedPreference && isAllowedModelSelection(cachedPreference.model, modelPlan) ? cachedPreference.model : fromProfile;
  const effort = cachedPreference?.effort ?? fromProfileEffort;

  useEffect(() => {
    if (!userId) {
      setLocalPreference(null);
      return;
    }
    let alive = true;
    const versionAtStart = selectionVersion.current;
    let cached: AiModelSelection | null = null;
    let cachedEffort = DEFAULT_AI_EFFORT;
    try {
      const saved = window.localStorage.getItem(preferenceKey(userId));
      cached = saved && isKnownModelSelection(saved) ? saved : null;
      cachedEffort = isAiEffort(window.localStorage.getItem(`${preferenceKey(userId)}.effort`))
        ? window.localStorage.getItem(`${preferenceKey(userId)}.effort`) as AiEffort
        : DEFAULT_AI_EFFORT;
      setLocalPreference(cached ? { uid: userId, model: cached, effort: cachedEffort } : null);
    } catch {
      setLocalPreference(null);
    }
    // Restore cross-device choices through the same API used to save them. This avoids relying
    // on a Firestore realtime listener, which can be unavailable while the chat itself works.
    void readPreferredModel().then((saved) => {
      if (!alive || !saved || selectionVersion.current !== versionAtStart) return;
      // The server is canonical on mount; keep local state as a fallback if the API is offline.
      setLocalPreference({ uid: userId, ...saved });
      try {
        window.localStorage.setItem(preferenceKey(userId), saved.model);
        window.localStorage.setItem(`${preferenceKey(userId)}.effort`, saved.effort);
      } catch { /* private mode */ }
    });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || !cachedPreference || fromProfile !== cachedPreference.model || fromProfileEffort !== cachedPreference.effort) return;
    try {
      window.localStorage.removeItem(preferenceKey(userId));
      window.localStorage.removeItem(`${preferenceKey(userId)}.effort`);
    } catch { /* private mode */ }
    setLocalPreference(null);
  }, [cachedPreference, fromProfile, fromProfileEffort, userId]);

  const setModel = useCallback(
    (id: AiModelSelection) => {
      if (!isAllowedModelSelection(id, modelPlan)) {
        requestPlanUpgrade("model");
        return;
      }
      if (!userId) return;
      selectionVersion.current += 1;
      const next = { uid: userId, model: id, effort };
      setLocalPreference(next);
      try { window.localStorage.setItem(preferenceKey(userId), id); } catch { /* private mode */ }
      try { window.localStorage.setItem(`${preferenceKey(userId)}.effort`, effort); } catch { /* private mode */ }
      void updatePreferredModel(userId, id, effort);
    },
    [effort, modelPlan, userId],
  );

  const setEffort = useCallback((nextEffort: AiEffort) => {
    if (!isAiEffort(nextEffort) || !userId) return;
    selectionVersion.current += 1;
    setLocalPreference({ uid: userId, model, effort: nextEffort });
    try {
      window.localStorage.setItem(preferenceKey(userId), model);
      window.localStorage.setItem(`${preferenceKey(userId)}.effort`, nextEffort);
    } catch { /* private mode */ }
    void updatePreferredModel(userId, model, nextEffort);
  }, [model, userId]);

  const value = useMemo<PreferredModelValue>(
    () => ({
      model,
      name: aiModelDisplayName(model),
      effort,
      effortName: aiEffortDisplayName(effort),
      options: availableAiModels(modelPlan),
      setModel,
      setEffort,
    }),
    [modelPlan, model, effort, setModel, setEffort],
  );

  return <PreferredModelContext.Provider value={value}>{children}</PreferredModelContext.Provider>;
}

export function usePreferredModel(): PreferredModelValue {
  const value = useContext(PreferredModelContext);
  if (value) return value;
  return {
    model: resolveAiModel(null, false),
    name: aiModelDisplayName(resolveAiModel(null, false)),
    effort: DEFAULT_AI_EFFORT,
    effortName: aiEffortDisplayName(DEFAULT_AI_EFFORT),
    options: availableAiModels(false),
    setModel: () => undefined,
    setEffort: () => undefined,
  };
}
