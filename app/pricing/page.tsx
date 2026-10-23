import { AuthProvider } from "@/components/auth-provider";
import { PlansPage } from "@/components/account/plans-page";

export default function PricingPage() {
  return (
    <AuthProvider>
      <PlansPage />
    </AuthProvider>
  );
}
