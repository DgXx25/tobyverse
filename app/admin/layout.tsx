import { AuthProvider } from "@/components/auth-provider";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminWorkspaceShell } from "@/components/admin/admin-workspace-shell";
import { ThemeProvider } from "@/components/workspace/theme-provider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AdminGuard>
          <AdminWorkspaceShell>{children}</AdminWorkspaceShell>
        </AdminGuard>
      </ThemeProvider>
    </AuthProvider>
  );
}
