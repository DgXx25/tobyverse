"use client";

import dynamic from "next/dynamic";
import type { FormulaProps } from "@/components/visuals/formula";

const Formula = dynamic(
  () => import("@/components/visuals/formula").then((mod) => mod.Formula),
  { loading: () => <span className="font-mono text-[15px] text-foreground">…</span> },
);

export function FormulaLoader(props: FormulaProps) {
  return <Formula {...props} />;
}
