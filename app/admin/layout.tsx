import { AppShell } from "@/components/app-shell";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AdminGuard>
        <div className="flex h-full min-h-0 flex-col">
          <AdminNav />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </AdminGuard>
    </AppShell>
  );
}
