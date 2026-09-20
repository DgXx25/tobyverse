"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import { attachFileKey, fileTypeBadge, isImageAttachment } from "@/lib/composer/attach";
import { formatBytes } from "@/lib/format";
import { LARGE_PASTE_CHARS, looksLikeUrl } from "@/lib/materials/ingest-client";
import { COMPOSER_FILE_ACCEPT } from "@/lib/materials/types";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ComposerParameters } from "@/components/workspace/composer-parameters";
import { LinkifiedText } from "@/components/workspace/linkified-text";
import { SlashMenu } from "@/components/workspace/slash-menu";
import {
  COMPOSER_SKILL_META,
  filterSlashItems,
  parseSlashQuery,
  type ComposerSkill,
  type SlashItem,
} from "@/lib/composer/slash";
import type { ChatMode } from "@/types/chat";

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
    notice?: ReactNode;
    pad?: boolean;
    className?: string;
    allowAttach?: boolean;
    showParameters?: boolean;
    onBackspaceEmpty?: () => void;
    onEscape?: () => void;
    onArrowDown?: () => void;
    fadePlaceholder?: boolean;
    dropActive?: boolean;
    locked?: boolean;
    chatMode?: ChatMode;
    onChatMode?: (mode: ChatMode) => void;
    skill?: ComposerSkill | null;
    onSkill?: (skill: ComposerSkill | null) => void;
    slashSkills?: boolean;
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
    placeholder = "Ask anything",
    fieldStart,
    notice,
    pad = true,
    className = "",
    allowAttach = true,
    showParameters = false,
    onBackspaceEmpty,
    onEscape,
    onArrowDown,
    fadePlaceholder = false,
    dropActive = false,
    locked = false,
    chatMode,
    onChatMode,
    skill,
    onSkill,
    slashSkills = true,
  },
  ref,
) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastDropRef = useRef<{ at: number; keys: Set<string> }>({ at: 0, keys: new Set() });
  const [dropOver, setDropOver] = useState(false);
  const [slashActive, setSlashActive] = useState(0);
  const hint = skill ? COMPOSER_SKILL_META[skill].placeholder : placeholder;
  const slashQuery = parseSlashQuery(draft);
  const [shownPlaceholder, setShownPlaceholder] = useState(placeholder);
  const [prevPlaceholder, setPrevPlaceholder] = useState<string | null>(null);
  const shownPlaceholderRef = useRef(placeholder);
  shownPlaceholderRef.current = shownPlaceholder;

  useEffect(() => {
    if (!fadePlaceholder) {
      shownPlaceholderRef.current = hint;
      setShownPlaceholder(hint);
      setPrevPlaceholder(null);
      return;
    }
    if (shownPlaceholderRef.current === hint) return;
    const from = shownPlaceholderRef.current;
    shownPlaceholderRef.current = hint;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPrevPlaceholder(null);
      setShownPlaceholder(hint);
      return;
    }
    setPrevPlaceholder(from);
    setShownPlaceholder(hint);
    const timer = window.setTimeout(() => setPrevPlaceholder(null), 200);
    return () => window.clearTimeout(timer);
  }, [fadePlaceholder, hint]);

  useImperativeHandle(ref, () => ({
    focus() {
      areaRef.current?.focus({ preventScroll: true });
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

  const hasPrefix = Boolean(fieldStart) || Boolean(skill);
  const prefixHoldRef = useRef<ReactNode>(null);
  const prefixInnerRef = useRef<HTMLDivElement>(null);
  const skillPrefix = skill ? (
    <span className="start-action-prefix pointer-events-none inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap pt-3 text-[15px] leading-6 text-foreground">
      <UiIcon name={COMPOSER_SKILL_META[skill].icon} size={18} className="accent-symbol" />
      <span>{COMPOSER_SKILL_META[skill].label}</span>
    </span>
  ) : null;
  const prefixNode = fieldStart ?? skillPrefix;
  if (prefixNode) prefixHoldRef.current = prefixNode;
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

  useEffect(() => {
    setSlashActive(0);
  }, [slashQuery]);

  useEffect(() => () => cancelAnimationFrame(prefixFrame.current), []);

  function onPrefixTransitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "width" && event.propertyName !== "opacity") return;
    if (!hasPrefix) setPrefixVisible(false);
  }

  const busyChip = chips.some((chip) => chip.status === "uploading");
  const canSend =
    !locked && !sending && !busyChip && Boolean(draft.trim() || chips.some((chip) => chip.status === "ready"));
  const isDrop = dropOver || dropActive;
  const slashOpen = slashQuery != null && Boolean(onChatMode || onSkill);
  const slashItems = slashOpen ? filterSlashItems(slashQuery, slashSkills && Boolean(onSkill)) : [];
  const slashIndex = slashItems.length ? Math.min(slashActive, slashItems.length - 1) : 0;

  function applySlash(item: SlashItem) {
    if (item.kind === "mode") onChatMode?.(item.id as ChatMode);
    else onSkill?.(item.id as ComposerSkill);
    onDraft("");
    requestAnimationFrame(() => areaRef.current?.focus({ preventScroll: true }));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (slashOpen && slashItems[slashIndex]) {
      applySlash(slashItems[slashIndex]);
      return;
    }
    if (locked || !canSend) return;
    onSend();
    requestAnimationFrame(() => areaRef.current?.focus({ preventScroll: true }));
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (slashOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      if (slashItems.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSlashActive((current) => (current + delta + slashItems.length) % slashItems.length);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape") {
      if (slashOpen) {
        event.preventDefault();
        onDraft("");
        return;
      }
      if (!onEscape) return;
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const node = event.currentTarget;
      if (node.selectionStart !== 0 || node.selectionEnd !== 0) return;
      if (skill && onSkill) {
        event.preventDefault();
        onSkill(null);
        return;
      }
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
    if (locked || !allowAttach || !list) return;
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
    if (text.trim().length >= LARGE_PASTE_CHARS && !looksLikeUrl(text.trim())) {
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
        if (locked || !allowAttach) return;
        event.preventDefault();
        event.stopPropagation();
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={onDrop}
      className={`${pad ? "composer-pad px-4 pt-2" : "pt-2"} ${locked ? "pointer-events-none opacity-40" : ""} ${className}`.trim()}
    >
      <div
        className={`relative rounded-[28px] border bg-surface-2 px-3 py-2 transition-[border-color,background-color] ${
          isDrop ? "border-accent bg-foreground/[0.04]" : "border-border"
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-foreground/[0.06] transition-opacity ${
            isDrop ? "opacity-100" : "opacity-0"
          }`}
        />
        {notice}
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
                <span className="min-w-0 truncate">
                  {looksLikeUrl(chip.title) ? (
                    <a
                      href={chip.title}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-link block truncate"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {chip.title}
                    </a>
                  ) : (
                    <span className="text-foreground">{chip.title}</span>
                  )}
                </span>
                {chip.status === "uploading" ? (
                  <span className="shrink-0 whitespace-nowrap text-muted">
                    {chip.type === "url" || looksLikeUrl(chip.title) ? "Reading…" : "Uploading…"}
                  </span>
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
            areaRef.current?.focus({ preventScroll: true });
          }}
        >
          {showPrefix ? (
            <div
              className={`start-action-clip${prefixOpen ? " is-open" : ""}`}
              style={{ width: prefixOpen ? prefixWidth : 0 }}
              onTransitionEnd={onPrefixTransitionEnd}
            >
              <div ref={prefixInnerRef} className="start-action-clip-inner">
                {prefixNode ?? prefixHoldRef.current}
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
              <DraftArea
                areaRef={areaRef}
                draft={draft}
                padClass={`pt-3 pb-2 ${showPrefix ? "" : "px-1"}`}
                placeholder={fadePlaceholder ? undefined : hint}
                locked={locked}
                onDraft={onDraft}
                onKey={onKey}
                onPaste={onPaste}
              />
            </div>
          ) : (
            <DraftArea
              areaRef={areaRef}
              draft={draft}
              padClass="px-1 py-2"
              placeholder={hint}
              locked={locked}
              onDraft={onDraft}
              onKey={onKey}
              onPaste={onPaste}
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
                disabled={locked}
                onClick={() => fileRef.current?.click()}
                className="composer-attach flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground disabled:hover:bg-transparent"
                aria-label="Attach file"
              >
                <UiIcon name="plus" size={18} />
              </button>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {showParameters ? <ComposerParameters mode={chatMode} onMode={onChatMode} /> : null}
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
        {slashOpen ? (
          <div className="absolute bottom-[calc(100%+8px)] left-2 z-50 w-[min(calc(100%-16px),320px)] rounded-2xl bg-surface-2 shadow-2xl ring-1 ring-border">
            <SlashMenu
              items={slashItems}
              active={slashIndex}
              allowSkills={slashSkills && Boolean(onSkill)}
              onPick={applySlash}
              onActive={setSlashActive}
            />
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 px-1 text-xs text-red-400">{error}</p> : null}
    </form>
  );
});

ChatComposer.displayName = "ChatComposer";

function DraftArea({
  areaRef,
  draft,
  padClass,
  placeholder,
  locked = false,
  onDraft,
  onKey,
  onPaste,
}: {
  areaRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  padClass: string;
  placeholder?: string;
  locked?: boolean;
  onDraft: (value: string) => void;
  onKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const hasLink = /https?:\/\//i.test(draft);
  const shared = `max-h-[160px] min-h-[40px] w-full text-[15px] leading-6 ${padClass}`;
  const mirrorText = draft.endsWith("\n") ? `${draft}\u00a0` : draft;

  return (
    <div className="relative min-w-0 flex-1">
      {hasLink ? (
        <div
          ref={mirrorRef}
          aria-hidden
          className={`composer-url-mirror pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-foreground ${shared}`}
        >
          <LinkifiedText text={mirrorText} />
        </div>
      ) : null}
      <textarea
        ref={areaRef}
        value={draft}
        disabled={locked}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onScroll={(event) => {
          if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
        placeholder={hasLink ? undefined : placeholder}
        rows={1}
        className={`composer-draft relative z-[1] resize-none bg-transparent outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted ${shared} ${
          hasLink ? "composer-draft-links text-transparent caret-foreground" : "text-foreground"
        }`}
      />
    </div>
  );
}
