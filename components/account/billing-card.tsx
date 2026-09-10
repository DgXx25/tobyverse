"use client";

export function BillingCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground">
          <span
            className="accent-symbol block h-5 w-5 bg-current"
            style={{
              WebkitMask: "url(/logo.svg) center / contain no-repeat",
              mask: "url(/logo.svg) center / contain no-repeat",
            }}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[16px] font-medium text-foreground">Free · Beta</p>
          <p className="mt-1 text-[13px] leading-6 text-muted">
            TobyVerse is free for everyone during beta, with 1 GB of material storage per account.
          </p>
        </div>
      </div>
    </div>
  );
}
