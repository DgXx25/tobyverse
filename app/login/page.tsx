import { cookies } from "next/headers";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { LandingScreen } from "@/components/landing-screen";
import { SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

export default async function LoginPage() {
  const sessionHint = (await cookies()).get(SIGNED_IN_COOKIE)?.value === "1";

  return (
    <LandingAuthGate sessionHint={sessionHint}>
      <LandingScreen />
    </LandingAuthGate>
  );
}
