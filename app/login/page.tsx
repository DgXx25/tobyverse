import { cookies } from "next/headers";
import { AuthForm } from "@/components/auth-form";
import { LandingAuthGate } from "@/components/landing-auth-gate";
import { LandingHeader } from "@/components/landing-header";
import { SIGNED_IN_COOKIE } from "@/lib/signed-in-cookie";

export default async function LoginPage() {
  const sessionHint = (await cookies()).get(SIGNED_IN_COOKIE)?.value === "1";

  return (
    <LandingAuthGate sessionHint={sessionHint}>
      <main className="flex min-h-dvh flex-col bg-background">
        <LandingHeader />
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="mb-8 text-center text-[28px] font-semibold tracking-tight text-foreground">
              Log into your account
            </h1>
            <AuthForm />
          </div>
        </div>
      </main>
    </LandingAuthGate>
  );
}
