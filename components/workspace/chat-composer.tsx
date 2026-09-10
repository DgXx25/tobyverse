"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import { attachFileKey, fileTypeBadge, isImageAttachment } from "@/lib/composer/attach";
import { formatBytes } from "@/lib/format";
import { LARGE_PASTE_CHARS, looksLikeUrl } from "@/lib/materials/ingest-client";
import { COMPOSER_FILE_ACCEPT } from "@/lib/materials/types";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ComposerParameters } from "@/components/workspace/composer-parameters";

export type ComposerChip = {
  id: string;
  title: string;
  type: string;
  size?: number;
  status: "uploading" | "reading" | "ready" | "error";
  error?: string;
  materialId?: string;
  previewUrl?: string;
  storagePath?: string;
};

export type ChatComposerHandle = {
  focus: () => void;
  openFile: () => void;
};

export const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    draft: string;
    onDraft: (value: string) => void;
    sending: boolean;
    error: string | null;
    chips: ComposerChip[];
    onRemoveChip: (id: string) => void;
    onSend: () => void;
    onStop?: () => void;
    onFile: (file: File) => void;
    onPasteText: (text: string) => void;
    onUrl: (url: string) => void;
    placeholder?: string;
    fieldStart?: ReactNode;
    pad?: boolean;
    className?: string;
    allowAttach?: boolean;
    showParameters?: boolean;
    onBackspaceEmpty?: () => void;
    onEscape?: () => void;
    onArrowDown?: () => void;
    fadePlaceholder?: boolean;
  }
>(function ChatComposer(
  {
    draft,
    onDraft,
    sending,
    error,
    chips,
    onRemoveChip,
    onSend,
    onStop,
    onFile,
    onPasteText,
    onUrl,
    placeholder = "Ask anything",
    fieldStart,
    pad = true,
    className = "",
    allowAttach = true,
    showParameters = false,
    onBackspaceEmpty,
    onEscape,
    onArrowDown,
    fadePlaceholder = false,
  },
  ref,
) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastDropRef = useRef<{ at: number; keys: Set<string> }>({ at: 0, keys: new Set() });
  const [dropOver, setDropOver] = useState(false);
  const [shownPlaceholder, setShownPlaceholder] = useState(placeholder);
  const [prevPlaceholder, setPrevPlaceholder] = useState<string | null>(null);
  const shownPlaceholderRef = useRef(placeholder);
  shownPlaceholderRef.current = shownPlaceholder;

  useEffect(() => {
    if (!fadePlaceholder) {
      shownPlaceholderRef.current = placeholder;
      setShownPlaceholder(placeholder);
      setPrevPlaceholder(null);
      return;
    }
    if (shownPlaceholderRef.current === placeholder) return;
    const from = shownPlaceholderRef.current;
    shownPlaceholderRef.current = placeholder;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPrevPlaceholder(null);
      setShownPlaceholder(placeholder);
      return;
    }
    setPrevPlaceholder(from);
    setShownPlaceholder(placeholder);
    const timer = window.setTimeout(() => setPrevPlaceholder(null), 200);
    return () => window.clearTimeout(timer);
  }, [fadePlaceholder, placeholder]);

  useImperativeHandle(ref, () => ({
    focus() {
      areaRef.current?.focus();
    },
    openFile() {
      if (!allowAttach) return;
      fileRef.current?.click();
    },
  }));

  useEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  const hasPrefix = Boolean(fieldStart);
  const prefixHoldRef = useRef<ReactNode>(null);
  const prefixInnerRef = useRef<HTMLDivElement>(null);
  if (fieldStart) prefixHoldRef.current = fieldStart;
  const [prefixVisible, setPrefixVisible] = useState(hasPrefix);
  const [prefixOpen, setPrefixOpen] = useState(hasPrefix);
  const [prefixWidth, setPrefixWidth] = useState(0);
  const prefixFrame = useRef(0);
  const showPrefix = prefixVisible || hasPrefix;

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hasPrefix) {
      setPrefixVisible(true);
      const inner = prefixInnerRef.current;
      if (inner) setPrefixWidth(inner.scrollWidth);
      if (reduced) {
        setPrefixOpen(true);
        return;
      }
      setPrefixOpen(false);
      cancelAnimationFrame(prefixFrame.current);
      prefixFrame.current = requestAnimationFrame(() => {
        prefixFrame.current = requestAnimationFrame(() => setPrefixOpen(true));
      });
      return () => cancelAnimationFrame(prefixFrame.current);
    }
    setPrefixOpen(false);
    if (reduced) setPrefixVisible(false);
  }, [hasPrefix]);

  useLayoutEffect(() => {
    if (!showPrefix || !hasPrefix) return;
    const inner = prefixInnerRef.current;
    if (!inner) return;
    const update = () => {
      const next = inner.scrollWidth;
      setPrefixWidth((prev) => (prev === next ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [showPrefix, hasPrefix]);

  useEffect(() => {
    if (hasPrefix || !prefixVisible) return;
    const timer = window.setTimeout(() => setPrefixVisible(false), 220);
    return () => window.clearTimeout(timer);
  }, [hasPrefix, prefixVisible]);

  useEffect(() => () => cancelAnimationFrame(prefixFrame.current), []);

  function onPrefixTransitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "width" && event.propertyName !== "opacity") return;
    if (!hasPrefix) setPrefixVisible(false);
  }

  const busyChip = chips.some((chip) => chip.status === "uploading");
  const canSend = !sending && !busyChip && Boolean(draft.trim() || chips.some((chip) => chip.status === "ready"));

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend();
    requestAnimationFrame(() => areaRef.current?.focus());
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape") {
      if (!onEscape) return;
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const node = event.currentTarget;
      if (node.selectionStart !== 0 || node.selectionEnd !== 0) return;
      if (onBackspaceEmpty) {
        event.preventDefault();
        onBackspaceEmpty();
        return;
      }
      if (chips.length > 0) {
        event.preventDefault();
        onRemoveChip(chips[chips.length - 1].id);
      }
      return;
    }
    if (event.key === "ArrowDown" && onArrowDown && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const node = event.currentTarget;
      const after = node.value.slice(node.selectionStart);
      if (after.includes("\n")) return;
      event.preventDefault();
      onArrowDown();
    }
  }

  function takeFiles(list: FileList | File[] | null, source: "drop" | "picker" | "paste") {
    if (!allowAttach || !list) return;
    const seen = new Set<string>();
    const unique: File[] = [];
    for (const file of Array.from(list)) {
      const key = attachFileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(file);
    }
    if (unique.length === 0) return;

    let files = unique;
    if (source === "drop") {
      const now = Date.now();
      const last = lastDropRef.current;
      if (now - last.at < 400) {
        files = unique.filter((file) => !last.keys.has(attachFileKey(file)));
      }
      const keys = now - last.at < 400 ? new Set(last.keys) : new Set<string>();
      for (const file of unique) keys.add(attachFileKey(file));
      lastDropRef.current = { at: now, keys };
      files = files.filter(
        (file) => !chips.some((chip) => chip.title === file.name && chip.size === file.size),
      );
    }

    for (const file of files) onFile(file);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttach) return;
    const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (image) {
      const file = image.getAsFile();
      if (file) {
        event.preventDefault();
        takeFiles([file], "paste");
        return;
      }
    }
    const files = event.clipboardData.files;
    if (files?.length) {
      event.preventDefault();
      takeFiles(files, "paste");
      return;
    }
    const text = event.clipboardData.getData("text");
    if (!text) return;
    if (looksLikeUrl(text)) {
      event.preventDefault();
      onUrl(text.trim());
      return;
    }
    if (text.trim().length >= LARGE_PASTE_CHARS) {
      event.preventDefault();
      onPasteText(text);
    }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDropOver(false);
    if (!allowAttach) return;
    takeFiles(event.dataTransfer.files, "drop");
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(event) => {
        if (!allowAttach) return;
        event.preventDefault();
        event.stopPropagation();
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={onDrop}
      className={`${pad ? "composer-pad px-4 pt-2" : "pt-2"} ${className}`.trim()}
    >
      <div
        className={`rounded-[28px] border bg-surface-2 px-3 py-2 ${
          dropOver ? "border-accent" : "border-border"
        }`}
      >
        {chips.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5 px-1 pt-1">
            {chips.map((chip) => (
              <span
                key={chip.id}
                className={`inline-flex h-8 max-w-[240px] items-center gap-1.5 overflow-hidden rounded-full border bg-surface pl-1 pr-1.5 text-[11px] leading-none ${
                  chip.status === "error" ? "border-red-400/30" : "border-border"
                }`}
              >
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                  {chip.status === "uploading" ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-muted/40 border-t-foreground" />
                  ) : chip.previewUrl && isImageAttachment(chip.type, chip.title) ? (
                    <img src={chip.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-mono text-[8px] font-medium uppercase tracking-wide text-muted">
                      {fileTypeBadge(chip.type, chip.title)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate text-foreground">{chip.title}</span>
                {chip.status === "uploading" ? (
                  <span className="shrink-0 whitespace-nowrap text-muted">იტვირთება…</span>
                ) : chip.size ? (
                  <span className="shrink-0 whitespace-nowrap text-muted">{formatBytes(chip.size)}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemoveChip(chip.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-muted hover:text-foreground"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          className={`flex px-1.5 ${
            showPrefix ? "items-start" : "items-center"
          } ${fadePlaceholder || showPrefix ? "" : "pt-0.5"}`}
          onMouseDown={(event) => {
            if (!showPrefix) return;
            if (event.target === areaRef.current) return;
            if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
            event.preventDefault();
            areaRef.current?.focus();
          }}
        >
          {showPrefix ? (
            <div
              className={`start-action-clip${prefixOpen ? " is-open" : ""}`}
              style={{ width: prefixOpen ? prefixWidth : 0 }}
              onTransitionEnd={onPrefixTransitionEnd}
            >
              <div ref={prefixInnerRef} className="start-action-clip-inner">
                {fieldStart ?? prefixHoldRef.current}
              </div>
            </div>
          ) : null}
          {fadePlaceholder || showPrefix ? (
            <div className="relative min-w-0 flex-1">
              {fadePlaceholder && !draft ? (
                <>
                  {prevPlaceholder ? (
                    <span
                      className={`composer-placeholder-fade-out pointer-events-none absolute inset-0 flex items-start text-[15px] leading-6 text-muted ${
                        showPrefix ? "pt-3" : "px-1 pt-3"
                      }`}
                    >
                      {prevPlaceholder}
                    </span>
                  ) : null}
                  <span
                    key={shownPlaceholder}
                    className={`pointer-events-none absolute inset-0 flex items-start text-[15px] leading-6 text-muted ${
                      showPrefix ? "pt-3" : "px-1 pt-3"
                    } ${prevPlaceholder ? "composer-placeholder-fade-in" : ""}`}
                  >
                    {shownPlaceholder}
                  </span>
                </>
              ) : null}
              <textarea
                ref={areaRef}
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={onKey}
                onPaste={onPaste}
                placeholder={fadePlaceholder ? undefined : placeholder}
                rows={1}
                className={`max-h-[160px] min-h-[40px] w-full resize-none bg-transparent pt-3 pb-2 text-[15px] leading-6 text-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted ${showPrefix ? "" : "px-1"}`}
              />
            </div>
          ) : (
            <textarea
              ref={areaRef}
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
              placeholder={placeholder}
              rows={1}
              className="max-h-[160px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 text-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted"
            />
          )}
        </div>
        <div className="flex items-center gap-1 pb-0.5">
          {allowAttach ? (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={COMPOSER_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  takeFiles(event.target.files, "picker");
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="composer-attach flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                aria-label="Attach file"
              >
                <UiIcon name="plus" size={18} />
              </button>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {showParameters ? <ComposerParameters /> : null}
            <button
              type={sending && onStop ? "button" : "submit"}
              disabled={sending ? !onStop : !canSend}
              onClick={
                sending && onStop
                  ? (event) => {
                      event.preventDefault();
                      onStop();
                    }
                  : undefined
              }
              className={`composer-send flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background ${
                sending && !onStop ? "" : "disabled:opacity-30"
              }`}
              aria-label={sending ? (onStop ? "Stop" : "Starting") : "Send"}
            >
              {sending && onStop ? (
                <span className="block h-2.5 w-2.5 rounded-[2px] bg-current" />
              ) : sending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              ) : (
                <UiIcon name="send" size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
      {error ? <p className="mt-2 px-1 text-xs text-red-400">{error}</p> : null}
    </form>
  );
});

ChatComposer.displayName = "ChatComposer";
