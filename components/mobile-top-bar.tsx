"use client";

import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";

export function MobileTopBar() {
  const { user } = useAuth();
  const { setMobileNavOpen, openAccountSheet, mobileTopActions } = useShell();
  const name = user?.displayName || user?.email || "Account";

  return (
    <header className="mobile-topbar relative z-20 flex shrink-0 items-center justify-between px-2 md:hidden">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-surface-2"
        aria-label="Open menu"
      >
        <UiIcon name="menu" size={18} />
      </button>
      <div className="flex items-center gap-0.5">
        {mobileTopActions}
        <button
          type="button"
          onClick={() => openAccountSheet("root")}
          className="flex h-11 w-11 items-center justify-center"
          aria-label="Account"
        >
          <UserAvatar src={user?.photoURL} name={name} />
        </button>
      </div>
    </header>
  );
}

function UserAvatar({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return <img src={src} alt="" className="h-7 w-7 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[11px] text-foreground">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
