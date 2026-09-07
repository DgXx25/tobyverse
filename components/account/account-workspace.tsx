"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useUserProfile } from "@/components/account/use-user-profile";
import { AccountDataControls } from "@/components/account/data-controls";
import { IconAccount, IconBack, IconData } from "@/components/workspace/icons";
import { firstNameFromUser, initialsFromName, signInMethodsFromProviderData } from "@/lib/account/providers";
import { planLabel } from "@/lib/account/plan";

type AccountTab = "account" | "data";

export function AccountWorkspace() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [tab, setTab] = useState<AccountTab>("account");

  const displayName = profile?.displayName || user?.displayName || "Signed in";
  const email = profile?.email || user?.email || "";
  const firstName = firstNameFromUser(displayName, email);
  const initials = initialsFromName(displayName, email);
  const createdAt = profile?.createdAt || user?.metadata.creationTime || null;
  const methods = signInMethodsFromProviderData(user?.providerData ?? []);
  const plan = planLabel(profile?.plan);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)] md:px-8">
        <Link href="/" draggable={false} className="select-none text-foreground" aria-label="TobyVerse">
          <span
            className="block h-7 w-7 bg-current"
            style={{
              WebkitMask: "url(/logo.svg) center / contain no-repeat",
              mask: "url(/logo.svg) center / contain no-repeat",
            }}
          />
        </Link>
        <Avatar src={user?.photoURL || profile?.photoURL} initials={initials} size="sm" />
      </header>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-5 pb-16 md:flex-row md:gap-16 md:px-8 md:pt-6">
        <aside className="flex w-full shrink-0 flex-col md:w-[240px]">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground md:text-[32px]">
            Welcome, {firstName}.
          </h1>
          <p className="mt-1 text-[15px] text-muted">Manage your account.</p>

          <nav className="mt-8 space-y-1">
            <NavItem
              active={tab === "account"}
              icon={<IconAccount className="h-[18px] w-[18px]" />}
              label="Account"
              onClick={() => setTab("account")}
            />
            <NavItem
              active={tab === "data"}
              icon={<IconData className="h-[18px] w-[18px]" />}
              label="Data"
              onClick={() => setTab("data")}
            />
          </nav>

          <Link
            href="/new"
            className="mt-10 inline-flex w-fit items-center gap-2 rounded-full px-1 py-2 text-[14px] text-foreground hover:bg-surface-2 md:mt-auto"
          >
            <IconBack className="h-4 w-4" />
            Return to TobyVerse
          </Link>
        </aside>

        <section className="min-w-0 flex-1 pb-8">
          {tab === "account" ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Your account</h2>
                  <p className="mt-1 text-[14px] text-muted">Manage your account information.</p>
                </div>
                <Avatar src={user?.photoURL || profile?.photoURL} initials={initials} size="lg" />
              </div>

              <div className="mt-8 overflow-hidden rounded-2xl bg-surface-2">
                <InfoRow label="Full name" value={displayName} />
                <InfoRow label="Email" value={email || "—"} />
                <InfoRow label="Plan" value={plan} hint="Beta" />
                <InfoRow label="Account created" value={formatCreated(createdAt)} last />
              </div>

              <div className="mt-10">
                <h3 className="text-[18px] font-semibold tracking-tight text-foreground">Sign-in methods</h3>
                <p className="mt-1 text-[14px] text-muted">How you log into TobyVerse.</p>
                <div className="mt-5">
                  {methods.length === 0 ? (
                    <p className="text-[14px] text-muted">No sign-in methods on this account.</p>
                  ) : (
                    methods.map((method) => (
                      <div key={method.id} className="flex items-center gap-3 py-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-foreground">
                          <ProviderGlyph providerId={method.providerId} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium text-foreground">{method.label}</p>
                          <p className="text-[13px] text-muted">{method.description}</p>
                        </div>
                        <span className="text-[13px] text-muted">Connected</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Data</h2>
              <p className="mt-1 text-[14px] text-muted">Export metadata or delete your account.</p>
              <div className="mt-6">
                <AccountDataControls />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-left text-[15px] ${
        active ? "text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {active ? <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-foreground" /> : null}
      <span className={active ? "text-foreground" : "text-muted"}>{icon}</span>
      {label}
    </button>
  );
}

function InfoRow({
  label,
  value,
  hint,
  last = false,
}: {
  label: string;
  value: string;
  hint?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-5 py-5 ${last ? "" : "border-b border-border"}`}>
      <div>
        <p className="text-[13px] text-muted">{label}</p>
        <p className="mt-1 text-[15px] text-foreground">{value}</p>
      </div>
      {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

function Avatar({ src, initials, size }: { src?: string | null; initials: string; size: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-14 w-14 text-[15px]" : "h-8 w-8 text-[11px]";
  if (src) {
    return <img src={src} alt="" className={`${size === "lg" ? "h-14 w-14" : "h-8 w-8"} rounded-full object-cover`} />;
  }
  return (
    <span className={`flex items-center justify-center rounded-full bg-surface-2 text-foreground ${dim}`}>{initials}</span>
  );
}

function ProviderGlyph({ providerId }: { providerId: string }) {
  if (providerId === "google.com") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z" />
        <path fill="#34A853" d="M6.6 14.3l-.8.6-2.8 2.2C4.8 20.2 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.8-6-4.4z" />
        <path fill="#4A90E2" d="M3 7.1C2.4 8.4 2 9.9 2 11.5S2.4 14.6 3 15.9c0 .1 3.6-2.8 3.6-2.8-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L3 7.1z" />
        <path fill="#FBBC05" d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 3.8 3 6.9L6.6 9.7C7 7.1 9.2 5.8 12 5.8z" />
      </svg>
    );
  }
  if (providerId === "apple.com") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        <path d="M16.37 12.86c0-1.84 1.5-2.73 1.57-2.78-.86-1.25-2.19-1.42-2.66-1.44-1.13-.11-2.21.67-2.78.67-.58 0-1.46-.65-2.4-.63-1.23.02-2.37.72-3 1.82-1.28 2.22-.33 5.5.91 7.3.61.88 1.33 1.86 2.28 1.83.91-.04 1.26-.59 2.36-.59 1.09 0 1.41.59 2.37.57.98-.02 1.6-.88 2.2-1.77.69-1.01 1-2 1-2.04-.02 0-1.94-.74-1.96-2.94zM14.92 6.9c.5-.61 1.04-1.44.92-2.28-.89.04-1.97.59-2.61 1.2-.57.54-1.08 1.4-.94 2.23 1 .08 2.02-.51 2.63-1.15z" />
      </svg>
    );
  }
  return <IconAccount className="h-4 w-4" />;
}

function formatCreated(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
