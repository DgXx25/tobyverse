"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageAttachments } from "@/components/workspace/message-attachments";
import { MaterialViewer } from "@/components/workspace/material-viewer";
import { NoteDocument } from "@/components/visuals/note-document";
import { QuietIconCluster } from "@/components/workspace/quiet-icon-cluster";
import { UiIcon } from "@/components/workspace/ui-icon";
import { RichContent } from "@/components/rich-content";
import type { SharedChatSnapshot } from "@/lib/sharing/types";
import { loadSharedChatClient } from "@/lib/sharing/client";

type SharedFocus = { kind: "material" | "sheet"; id: string };

export function SharedChatView({ shareId }: { shareId: string }) {
  const [snapshot, setSnapshot] = useState<SharedChatSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [focus, setFocus] = useState<SharedFocus | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setLoadError(false);
    void loadSharedChatClient(shareId)
      .catch(async () => {
        const response = await fetch(`/api/share/${encodeURIComponent(shareId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Shared chat service unavailable.");
        return response.json() as Promise<SharedChatSnapshot>;
      })
      .then((next) => {
        if (cancelled) return;
        if (next) setSnapshot(next);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, retryCount]);

  const activeMaterial = useMemo(
    () => focus?.kind === "material" ? snapshot?.materials.find((item) => item.id === focus.id) ?? null : null,
    [focus, snapshot],
  );
  const activeSheet = useMemo(
    () => focus?.kind === "sheet" ? snapshot?.sheets.find((item) => item.id === focus.id) ?? null : null,
    [focus, snapshot],
  );

  function open(next: SharedFocus) {
    setFocus(next);
    setPanelOpen(true);
  }

  function togglePanel() {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    const fallback = focus ?? (snapshot?.sheets[0]
      ? { kind: "sheet" as const, id: snapshot.sheets[0].id }
      : snapshot?.materials[0]
        ? { kind: "material" as const, id: snapshot.materials[0].id }
        : null);
    if (!fallback) return;
    setFocus(fallback);
    setPanelOpen(true);
  }

  if (missing) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-sm text-muted">Shared chat not found.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-foreground hover:underline">Go to TobyVerse</Link>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
        <div>
          <p className="text-sm text-muted">Could not load this shared chat. Check your connection and try again.</p>
          <button type="button" onClick={() => { setSnapshot(null); setLoadError(false); setRetryCount((count) => count + 1); }} className="mt-4 text-sm text-foreground hover:underline">Try again</button>
        </div>
      </main>
    );
  }

  if (!snapshot) return <main className="min-h-dvh bg-background" />;

  const hasArtifacts = snapshot.materials.length > 0 || snapshot.sheets.length > 0;
  return (
    <main className="relative flex h-dvh min-h-0 overflow-hidden bg-background">
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex">
          <div className="pointer-events-auto">
            <QuietIconCluster
              size={20}
              actions={[{
                id: "panel",
                label: panelOpen ? "Close pane" : "Open pane",
                icon: panelOpen ? "panelLeft" : "panelRight",
                active: panelOpen,
                disabled: !hasArtifacts,
                onClick: togglePanel,
              }]}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-3xl px-8 max-md:px-4">
            <div className="chat-thread flex flex-col pb-16 pt-16">
              {snapshot.messages.map((message) => (
                <article
                  key={message.id}
                  data-turn={message.id}
                  className={`chat-msg ${message.role === "user" ? "chat-msg-user flex justify-end" : "chat-msg-assistant"}`}
                >
                  {message.role === "user" ? (
                    <div className="flex w-fit max-w-[min(100%,36rem)] flex-col items-end gap-2">
                      <MessageAttachments items={message.attachments} onOpenMaterial={(id) => open({ kind: "material", id })} />
                      {message.content.trim() ? (
                        <div className="chat-body rounded-2xl bg-surface-2 px-4 py-2.5 text-foreground">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {message.content.trim() ? <RichContent text={message.content} /> : null}
                      {message.artifact?.kind === "sheet" || message.artifact?.kind === "study_sheet" ? (
                        <button
                          type="button"
                          onClick={() => open({ kind: "sheet", id: message.artifact!.id })}
                          className="flex w-full items-center gap-3 border-y border-border py-3 text-left text-foreground hover:bg-surface-2/40"
                        >
                          <UiIcon name="notes" size={19} className="text-muted" />
                          <span className="min-w-0 flex-1 truncate text-sm">{message.artifact.title || "Notes"}</span>
                          <UiIcon name="forward" size={16} className="text-muted" />
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside
        aria-hidden={!panelOpen}
        className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-[180ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:max-w-[85vw] max-md:bg-surface ${panelOpen ? "w-[420px] opacity-100" : "w-0 opacity-0"}`}
      >
        <div className="ml-auto h-full w-[420px] border-l border-border bg-surface max-md:w-full">
          {activeMaterial ? (
            <MaterialViewer
              material={activeMaterial}
              fileAccess={{ shareId }}
              onClose={() => setPanelOpen(false)}
            />
          ) : activeSheet ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex min-h-11 items-center border-b border-border px-3">
                <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">{activeSheet.title}</p>
                <button type="button" aria-label="Close" onClick={() => setPanelOpen(false)} className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground">
                  <UiIcon name="close" size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <NoteDocument note={activeSheet} />
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </main>
  );
}
