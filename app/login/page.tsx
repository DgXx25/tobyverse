import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <Link href="/" className="mb-8 text-sm font-medium tracking-tight text-foreground">
        TobyVerse
      </Link>
      <AuthForm />
    </main>
  );
}
