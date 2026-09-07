"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import { attachFileKey, fileTypeBadge, isImageAttachment } from "@/lib/composer/attach";
import { formatBytes } from "@/lib/format";
import { LARGE_PASTE_CHARS, looksLikeUrl } from "@/lib/materials/ingest-client";
import { COMPOSER_FILE_ACCEPT } from "@/lib/materials/types";
import { IconPlus, IconSend } from "@/components/workspace/icons";

export type ComposerChip = {
  id: string;
  title: string;
  type: string;
  size?: number;
  status: "uploading" | "ready" | "error";
  error?: string;
  materialId?: string;
  previewUrl?: string;
  storagePath?: string;
};

export type ChatComposerHandle = {
  focus: () => void;
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
    onFile: (file: File) => void;
    onPasteText: (text: string) => void;
    onUrl: (url: string) => void;
    placeholder?: string;
  }
>(function ChatComposer(
  { draft, onDraft, sending, error, chips, onRemoveChip, onSend, onFile, onPasteText, onUrl, placeholder = "Ask anything" },
  ref,
) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastDropRef = useRef<{ at: number; keys: Set<string> }>({ at: 0, keys: new Set() });
  const [dropOver, setDropOver] = useState(false);

  useImperativeHandle(ref, () => ({
    focus() {
      areaRef.current?.focus();
    },
  }));

  useEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  const uploading = chips.some((chip) => chip.status === "uploading");
  const canSend = !sending && !uploading && Boolean(draft.trim() || chips.some((chip) => chip.status === "ready"));

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend();
    requestAnimationFrame(() => areaRef.current?.focus());
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function takeFiles(list: FileList | File[] | null, source: "drop" | "picker" | "paste") {
    if (!list) return;
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
    takeFiles(event.dataTransfer.files, "drop");
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropOver(true);
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={onDrop}
      className="composer-pad px-4 pt-2"
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
                {chip.size ? (
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
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={placeholder}
          rows={1}
          className="max-h-[160px] min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-[15px] leading-6 text-foreground outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted"
        />
        <div className="flex items-center gap-1 pb-0.5">
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
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
            aria-label="Attach file"
          >
            <IconPlus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
            aria-label="Send"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 px-1 text-xs text-red-400">{error}</p> : null}
    </form>
  );
});

ChatComposer.displayName = "ChatComposer";
