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
  availableAiProviders,
  isEnabledProvider,
  providerDisplayName,
  resolveAiProvider,
  type AiProviderId,
  type AiProviderOption,
} from "@/lib/ai/catalog";

type PreferredModelValue = {
  model: AiProviderId;
  name: string;
  options: AiProviderOption[];
  setModel: (id: AiProviderId) => void;
};

const PreferredModelContext = createContext<PreferredModelValue | null>(null);

export function PreferredModelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [optimistic, setOptimistic] = useState<AiProviderId | null>(null);
  const fromProfile = resolveAiProvider(profile?.preferredModel);
  const model = optimistic ?? fromProfile;

  useEffect(() => {
    setOptimistic(null);
  }, [user?.uid]);

  useEffect(() => {
    if (optimistic && fromProfile === optimistic) setOptimistic(null);
  }, [fromProfile, optimistic]);

  const setModel = useCallback(
    (id: AiProviderId) => {
      if (!isEnabledProvider(id)) return;
      setOptimistic(id);
      if (!user) return;
      void updatePreferredModel(user.uid, id).catch(() => undefined);
    },
    [user],
  );

  const value = useMemo<PreferredModelValue>(
    () => ({
      model,
      name: providerDisplayName(model),
      options: availableAiProviders(),
      setModel,
    }),
    [model, setModel],
  );

  return <PreferredModelContext.Provider value={value}>{children}</PreferredModelContext.Provider>;
}

export function usePreferredModel(): PreferredModelValue {
  const value = useContext(PreferredModelContext);
  if (value) return value;
  return {
    model: resolveAiProvider(null),
    name: providerDisplayName(resolveAiProvider(null)),
    options: availableAiProviders(),
    setModel: () => undefined,
  };
}
