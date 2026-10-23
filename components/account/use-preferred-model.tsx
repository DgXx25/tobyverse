"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { useUserProfile } from "@/components/account/use-user-profile";
import { updatePreferredModel } from "@/lib/account/store";
import {
  aiModelDisplayName,
  availableAiModels,
  isAllowedAiModel,
  resolveAiModel,
  type AiModelId,
  type AiModelOption,
} from "@/lib/ai/catalog";

type PreferredModelValue = {
  model: AiModelId;
  name: string;
  options: AiModelOption[];
  setModel: (id: AiModelId) => void;
};

const PreferredModelContext = createContext<PreferredModelValue | null>(null);

export function PreferredModelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const modelPlan = profile?.access?.plan ?? (profile?.admin ? "admin" : "free_beta");
  const [optimistic, setOptimistic] = useState<AiModelId | null>(null);
  const fromProfile = resolveAiModel(profile?.preferredModel, modelPlan);
  const model = optimistic && isAllowedAiModel(optimistic, modelPlan) ? optimistic : fromProfile;

  useEffect(() => {
    setOptimistic(null);
  }, [user?.uid]);

  useEffect(() => {
    if (optimistic && fromProfile === optimistic) setOptimistic(null);
  }, [fromProfile, optimistic]);

  const setModel = useCallback(
    (id: AiModelId) => {
      if (!isAllowedAiModel(id, modelPlan)) return;
      setOptimistic(id);
      if (!user) return;
      void updatePreferredModel(user.uid, id).catch(() => undefined);
    },
    [modelPlan, user],
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
