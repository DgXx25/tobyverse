"use client";

import { elementScroll, measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState, type ReactNode, type Ref, type RefObject } from "react";
import { chatMessageGap, chatVirtualizerOptions } from "@/lib/workspace/chat-history";
import type { ChatMessage } from "@/types/chat";
import { ChatBlockStateProvider, ChatBlockStateScope } from "./chat-block-state";

export type VirtualChatThreadHandle = { scrollToEnd: () => void; scrollToMessage: (id: string) => void };

/** Scroll updates stay here, rather than reconciling the composer and chat controller. */
export const VirtualChatThread = memo(function VirtualChatThread({
  messages, scrollRef, handleRef, bottomInset, renderMessage, onReady, active = true,
}: {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  handleRef?: Ref<VirtualChatThreadHandle>;
  bottomInset: number;
  active?: boolean;
  renderMessage: (message: ChatMessage, index: number) => ReactNode;
  onReady?: () => void;
}) {
  // An ancestor's scroll ref attaches after this child's layout effects.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = useMemo(() => chatVirtualizerOptions(messages, bottomInset), [messages, bottomInset]);
  const virtualizer = useVirtualizer({
    ...options,
    followOnAppend: false,
    useCachedMeasurements: !active,
    enabled: mounted,
    getScrollElement: () => scrollRef.current,
    measureElement: (element, entry, instance) => {
      // Keepalive routes use display:none. A zero RO box is not the row's height.
      if (!instance.scrollElement?.clientHeight) {
        const index = instance.indexFromElement(element);
        return instance.measurementsCache[index]?.size ?? instance.options.estimateSize(index);
      }
      return measureElement(element, entry, instance);
    },
    scrollToFn: (offset, settings, instance) => {
      if (instance.scrollElement?.clientHeight) elementScroll(offset, settings, instance);
    },
    // Fixed-position galleries and dialogs must not acquire a transformed ancestor.
    directDomUpdates: true,
    directDomUpdatesMode: "position",
  });
  useImperativeHandle(handleRef, () => ({
    scrollToEnd: () => virtualizer.scrollToEnd(),
    scrollToMessage: (id) => {
      const index = messages.findIndex((message) => message.id === id);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "end" });
    },
  }), [virtualizer, messages]);
  useLayoutEffect(() => {
    if (mounted) onReady?.();
  }, [mounted, onReady]);

  return (
    <ChatBlockStateProvider>
    <div ref={virtualizer.containerRef} className="chat-thread chat-thread-virtual relative w-full" data-message-count={messages.length}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          className="chat-virtual-row absolute left-0 w-full"
          style={{ paddingBottom: chatMessageGap(messages[row.index], messages[row.index + 1]) }}
        >
          <ChatBlockStateScope scope={messages[row.index].id}>
            {renderMessage(messages[row.index], row.index)}
          </ChatBlockStateScope>
        </div>
      ))}
    </div>
    </ChatBlockStateProvider>
  );
});
