"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ChatComposer, type ComposerChip } from "@/components/workspace/chat-composer";
import { newChipId } from "@/lib/composer/attach";
import { requireSignedInUser } from "@/lib/auth";
import { startProjectFromPrompt } from "@/lib/workspace/start-project";
import type { PendingAttachment } from "@/lib/workspace/pending-start";

export function StartScreen() {
  const router = useRouter();
  const { loading } = useAuth();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const chips: ComposerChip[] = attachments.map((item) => {
    if (item.kind === "file") {
      return {
        id: item.id,
        title: item.file.name,
        type: item.file.name.split(".").pop() || "file",
        size: item.file.size,
        status: "ready",
        previewUrl: previews[item.id],
      };
    }
    if (item.kind === "paste") {
      return { id: item.id, title: item.title || "Pasted notes", type: "txt", size: item.text.length, status: "ready" };
    }
    return { id: item.id, title: item.url, type: "url", status: "ready" };
  });

  function addFile(file: File) {
    const id = newChipId();
    if (file.type.startsWith("image/")) {
      setPreviews((current) => ({ ...current, [id]: URL.createObjectURL(file) }));
    }
    setAttachments((current) => [...current, { id, kind: "file", file }]);
  }

  async function start() {
    if (sending || loading) return;
    const prompt = draft.trim();
    if (!prompt && attachments.length === 0) return;

    setSending(true);
    setError(null);
    try {
      const signedIn = await requireSignedInUser();
      const id = await startProjectFromPrompt({
        userId: signedIn.uid,
        prompt,
        attachments,
      });
      for (const url of Object.values(previews)) URL.revokeObjectURL(url);
      setAttachments([]);
      setPreviews({});
      setDraft("");
      router.push(`/project/${id}`);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
      setSending(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) addFile(file);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <p className="rounded-xl border border-dashed border-white/20 px-6 py-4 text-sm text-foreground">
            Drop a file or image
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-24">
        <h1 className="text-center text-[32px] font-medium tracking-tight text-foreground">
          What do you want to learn?
        </h1>
        <p className="mt-3 max-w-md text-center text-sm leading-6 text-muted">
          Ask anything, or attach a file. Practice and notes appear as cards when you ask for them.
        </p>
        <div className="mt-10 w-full max-w-2xl">
          <ChatComposer
            draft={draft}
            onDraft={setDraft}
            sending={sending || loading}
            error={error}
            chips={chips}
            onRemoveChip={(id) => {
              setAttachments((current) => current.filter((item) => item.id !== id));
              const url = previews[id];
              if (url) URL.revokeObjectURL(url);
              setPreviews((current) => {
                const next = { ...current };
                delete next[id];
                return next;
              });
            }}
            onSend={() => void start()}
            onFile={addFile}
            onPasteText={(text) =>
              setAttachments((current) => [
                ...current,
                { id: newChipId(), kind: "paste", text, title: "Pasted notes" },
              ])
            }
            onUrl={(url) => setAttachments((current) => [...current, { id: newChipId(), kind: "url", url }])}
          />
        </div>
      </div>
    </div>
  );
}
