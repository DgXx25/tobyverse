import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminWorkspaceShell } from "@/components/admin/admin-workspace-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminWorkspaceShell>{children}</AdminWorkspaceShell>
    </AdminGuard>
  );
}
