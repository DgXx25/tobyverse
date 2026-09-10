"use client";

import { ModelOptions } from "@/components/workspace/model-options";

export function ParametersPanel() {
  return (
    <div className="space-y-1">
      <p className="px-0.5 pb-1 text-[12px] text-muted">Model</p>
      <ModelOptions />
    </div>
  );
}
