"use client";

import { AIModelSelector } from "@/components/kokonutui/ai-model-selector";
import type { ChatMode } from "@/types/chat";

export function ComposerParameters({
  mode: _mode,
  onMode: _onMode,
}: {
  mode?: ChatMode;
  onMode?: (mode: ChatMode) => void;
}) {
  return <AIModelSelector />;
}
