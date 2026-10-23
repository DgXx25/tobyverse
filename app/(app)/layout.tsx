import { AppShell } from "@/components/app-shell";
import { AppRouteProviders } from "@/components/app-route-providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppRouteProviders>
      <AppShell>{children}</AppShell>
    </AppRouteProviders>
  );
}
