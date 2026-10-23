"use client";

import type { ReactNode } from "react";
import { PreferredModelProvider } from "@/components/account/use-preferred-model";
import { PlanLimitDialog } from "@/components/account/plan-limit-dialog";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/workspace/theme-provider";

export function AppRouteProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PreferredModelProvider>
          {children}
          <PlanLimitDialog />
        </PreferredModelProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
