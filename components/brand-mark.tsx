"use client";

import Link from "next/link";

export function BrandMark({ href = "/", color }: { href?: string; color?: string }) {
  return (
    <Link href={href} draggable={false} className="brand-link accent-symbol inline-flex items-center text-foreground" style={{ color }} aria-label="TobyVerse">
      <span
        className="block h-7 w-7 shrink-0 bg-current"
        style={{
          WebkitMask: "url(/logo.svg) center / contain no-repeat",
          mask: "url(/logo.svg) center / contain no-repeat",
        }}
      />
    </Link>
  );
}
