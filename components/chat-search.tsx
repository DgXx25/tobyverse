"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteChatMessages,
  listChatMessages,
  listChatThreads,
  subscribeChatsForUser,
  updateChatTitle,
  type ChatIndexRow,
} from "@/lib/chats";
import {
  deleteProject,
  subscribeProjectsForUser,
  updateProjectTitle,
} from "@/lib/projects";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { chatPath, publicChatId } from "@/lib/workspace/routes";
import {
  collectChatMedia,
  formatSearchAge,
  groupChatResultsByDate,
  normalizeSearchText,
  searchDeletionScope,
  shouldLeaveDeletedSearchRoute,
  searchChats,
  searchMedia,
  type ChatSearchResult,
  type SearchChat,
  type SearchMediaItem,
} from "@/lib/search/chat-search";
import { UiIcon } from "@/components/workspace/ui-icon";
import { useShell } from "@/components/workspace/shell-context";
import { StorageThumb } from "@/components/workspace/sources-chip";
import { CHAT_SEARCH_OPEN_EVENT } from "@/lib/workspace/ui-events";
import type { Project } from "@/types/project";

type SearchTab = "chats" | "media";

export function ChatSearch({ userId, initiallyOpen = false }: { userId: string; initiallyOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setSelectedProjectId } = useShell();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const loadVersion = useRef(0);
  const loadedSignature = useRef("");
  const catalogRef = useRef<SearchChat[]>([]);
  const threadsHydrated = useRef(false);
  const [open, setOpen] = useState(initiallyOpen);
  const [tab, setTab] = useState<SearchTab>("chats");
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatIndex, setChatIndex] = useState<ChatIndexRow[]>([]);
  const [catalog, setCatalog] = useState<SearchChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    const stopProjects = subscribeProjectsForUser(userId, setProjects, () => setError("Could not load chats."));
    const stopChats = subscribeChatsForUser(userId, setChatIndex, () => setError("Could not load chats."));
    return () => {
      stopProjects();
      stopChats();
    };
  }, [open, userId]);

  const openSearch = useCallback(() => {
    if (!open && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
    setOpen(true);
    setError(null);
  }, [open]);

  const closeSearch = useCallback(() => {
    loadVersion.current += 1;
    setLoading(false);
    setOpen(false);
    setEditing(false);
    setDeleteOpen(false);
    setFullscreen(false);
    const opener = openerRef.current;
    window.requestAnimationFrame(() => opener?.focus());
  }, []);

  useEffect(() => {
    function onOpen() {
      openSearch();
    }
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openSearch();
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        if (deleteOpen) {
          if (!deletePending) setDeleteOpen(false);
          return;
        }
        if (editing) {
          setEditing(false);
          return;
        }
        closeSearch();
        return;
      }
      if (open && event.key === "Tab") {
        const root = deleteOpen ? confirmRef.current : dialogRef.current;
        const focusable = [...(root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [])].filter((item) => !item.hidden);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener(CHAT_SEARCH_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(CHAT_SEARCH_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeSearch, deleteOpen, deletePending, editing, open, openSearch]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, tab]);

  const signature = useMemo(
    () => [
      ...projects.map((project) => `${project.id}:${project.updatedAt ?? ""}`),
      ...chatIndex.map((chat) => `${chat.id}:${chat.updatedAt ?? ""}`),
    ].sort().join("|"),
    [chatIndex, projects],
  );

  useEffect(() => {
    if (!open || loadedSignature.current === signature) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);

    async function loadCatalog() {
      const visibleProjects = projects.filter((project) => !project.hidden);
      const projectById = new Map(visibleProjects.map((project) => [project.id, project]));
      const rows = new Map<string, Omit<SearchChat, "messages">>();

      for (const project of visibleProjects) {
        if (project.listed) continue;
        rows.set(project.id, {
          id: project.id,
          projectId: project.id,
          threadId: DEFAULT_CHAT_THREAD_ID,
          title: project.title,
          projectTitle: project.listed ? project.title : undefined,
          updatedAt: project.updatedAt ?? project.createdAt,
          href: chatPath(project.id),
        });
      }

      for (const row of chatIndex) {
        const project = projectById.get(row.projectId);
        if (!project) continue;
        const root = row.nestedId === DEFAULT_CHAT_THREAD_ID && row.id === row.projectId;
        rows.set(row.id, {
          id: row.id,
          projectId: row.projectId,
          threadId: row.nestedId,
          title: row.title?.trim() || (root && !project.listed ? project.title : row.kind === "path" ? "Plan" : "Chat"),
          projectTitle: project.listed ? project.title : undefined,
          updatedAt: row.updatedAt ?? row.createdAt ?? project.updatedAt,
          href: chatPath(row.id),
        });
      }

      const threadGroups: Array<{
        project: Project;
        threads: Awaited<ReturnType<typeof listChatThreads>>;
      }> = [];
      if (!threadsHydrated.current) {
        for (let start = 0; start < visibleProjects.length; start += 6) {
          if (loadVersion.current !== version) return;
          threadGroups.push(...await Promise.all(
            visibleProjects.slice(start, start + 6).map(async (project) => ({
              project,
              threads: await listChatThreads(project.id),
            })),
          ));
        }
      }
      for (const { project, threads } of threadGroups) {
        for (const thread of threads) {
          const id = publicChatId(project.id, thread.id);
          const existing = rows.get(id);
          rows.set(id, {
            id,
            projectId: project.id,
            threadId: thread.id,
            title: thread.title?.trim() || existing?.title || (thread.kind === "path" ? "Plan" : project.title),
            projectTitle: project.listed ? project.title : undefined,
            updatedAt: thread.updatedAt ?? thread.createdAt ?? existing?.updatedAt ?? project.updatedAt,
            href: chatPath(id),
          });
        }
      }

      const records: SearchChat[] = [];
      const descriptors = [...rows.values()];
      const existingByThread = new Map(
        catalogRef.current.map((chat) => [`${chat.projectId}:${chat.threadId}`, chat]),
      );
      for (let start = 0; start < descriptors.length; start += 8) {
        if (loadVersion.current !== version) return;
        records.push(...await Promise.all(
          descriptors.slice(start, start + 8).map(async (row) => {
            const existing = existingByThread.get(`${row.projectId}:${row.threadId}`);
            if (
              existing &&
              existing.updatedAt === row.updatedAt &&
              existing.title === row.title &&
              existing.projectTitle === row.projectTitle &&
              existing.href === row.href
            ) return existing;
            const messages = await listChatMessages(row.projectId, row.threadId);
            return {
              ...row,
              messages: messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
                images: message.images,
              })),
            } satisfies SearchChat;
          }),
        ));
      }

      if (loadVersion.current !== version) return;
      const nextCatalog = records.filter((chat) => chat.messages.length > 0 || chat.title !== "New chat");
      catalogRef.current = nextCatalog;
      setCatalog(nextCatalog);
      if (visibleProjects.length > 0) threadsHydrated.current = true;
      loadedSignature.current = signature;
      setLoading(false);
    }

    void loadCatalog().catch(() => {
      if (loadVersion.current !== version) return;
      setError("Could not load chat search. Try again.");
      setLoading(false);
    });
  }, [chatIndex, loadNonce, open, projects, signature]);

  const chatResults = useMemo(() => searchChats(catalog, query), [catalog, query]);
  const chatGroups = useMemo(() => groupChatResultsByDate(chatResults), [chatResults]);
  const media = useMemo(() => collectChatMedia(catalog), [catalog]);
  const mediaResults = useMemo(() => searchMedia(media, query), [media, query]);
  const selectedResult = chatResults.find((result) => result.chat.id === selectedChatId) ?? chatResults[0] ?? null;
  const selectedMedia = mediaResults.find((item) => item.id === selectedMediaId) ?? mediaResults[0] ?? null;

  useEffect(() => {
    setSelectedChatId((current) => chatResults.some((result) => result.chat.id === current) ? current : chatResults[0]?.chat.id ?? null);
  }, [chatResults]);

  useEffect(() => {
    setSelectedMediaId((current) => mediaResults.some((item) => item.id === current) ? current : mediaResults[0]?.id ?? null);
  }, [mediaResults]);

  const previewMessages = useMemo(() => {
    if (!selectedResult) return [];
    const messages = selectedResult.chat.messages;
    const hit = selectedResult.matchedMessageId
      ? messages.findIndex((message) => message.id === selectedResult.matchedMessageId)
      : -1;
    if (hit < 0) return messages.slice(-6);
    return messages.slice(Math.max(0, hit - 2), Math.min(messages.length, hit + 3));
  }, [selectedResult]);

  function selectRelative(direction: 1 | -1) {
    if (tab === "chats") {
      if (chatResults.length === 0) return;
      const current = chatResults.findIndex((result) => result.chat.id === selectedResult?.chat.id);
      const next = Math.max(0, Math.min(chatResults.length - 1, current + direction));
      setSelectedChatId(chatResults[next].chat.id);
      return;
    }
    if (mediaResults.length === 0) return;
    const current = mediaResults.findIndex((item) => item.id === selectedMedia?.id);
    const next = Math.max(0, Math.min(mediaResults.length - 1, current + direction));
    setSelectedMediaId(mediaResults[next].id);
  }

  function goToSelection() {
    const target = tab === "chats"
      ? selectedResult?.chat.href
      : catalog.find((chat) => chat.id === selectedMedia?.chatId)?.href;
    if (!target) return;
    closeSearch();
    router.push(target);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelative(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      goToSelection();
    }
  }

  function startEditing() {
    if (!selectedResult) return;
    setEditTitle(selectedResult.chat.title);
    setEditing(true);
  }

  async function saveTitle() {
    if (!selectedResult) return;
    const next = editTitle.trim();
    if (!next || next === selectedResult.chat.title) {
      setEditing(false);
      return;
    }
    const chat = selectedResult.chat;
    const project = projects.find((item) => item.id === chat.projectId);
    try {
      if (chat.threadId === DEFAULT_CHAT_THREAD_ID && !project?.listed) {
        await updateProjectTitle(chat.projectId, userId, next);
      } else {
        await updateChatTitle(chat.projectId, chat.threadId, next);
      }
      setCatalog((current) => {
        const updated = current.map((item) => item.id === chat.id ? { ...item, title: next } : item);
        catalogRef.current = updated;
        return updated;
      });
      setEditing(false);
    } catch {
      setError("Could not rename this chat.");
    }
  }

  async function confirmDelete() {
    if (!selectedResult) return;
    const chat = selectedResult.chat;
    const project = projects.find((item) => item.id === chat.projectId);
    setDeletePending(true);
    try {
      const deletesContainer = searchDeletionScope({
        isDefaultThread: chat.threadId === DEFAULT_CHAT_THREAD_ID,
        projectListed: project?.listed === true,
      }) === "container";
      if (deletesContainer) await deleteProject(chat.projectId, userId);
      else await deleteChatMessages(chat.projectId, chat.threadId);
      setCatalog((current) => {
        const updated = current.filter((item) => item.id !== chat.id && (!deletesContainer || item.projectId !== chat.projectId));
        catalogRef.current = updated;
        return updated;
      });
      setDeleteOpen(false);
      const activeProjectId = catalog.find((item) => item.href === pathname)?.projectId ??
        (pathname === `/p/${chat.projectId}` ? chat.projectId : null);
      if (shouldLeaveDeletedSearchRoute({
        deletesContainer,
        activeProjectId,
        deletedProjectId: chat.projectId,
        activeHref: pathname,
        deletedHref: chat.href,
      })) router.push("/new");
    } catch {
      setError("Could not delete this chat.");
      setDeleteOpen(false);
    } finally {
      setDeletePending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onActionKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (event.key.toLocaleLowerCase() === "e" && tab === "chats") {
        event.preventDefault();
        startEditing();
      }
      if (event.key.toLocaleLowerCase() === "d" && tab === "chats" && selectedResult) {
        event.preventDefault();
        setDeleteOpen(true);
      }
    }
    window.addEventListener("keydown", onActionKey);
    return () => window.removeEventListener("keydown", onActionKey);
  });

  if (!open) return null;

  return (
    <div
      className="popup-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-7 max-md:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSearch();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search chats and media"
        className={`popup-surface chat-search-shell flex flex-col overflow-hidden border border-border bg-surface-2 shadow-[0_28px_90px_rgba(0,0,0,0.28)] max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0 ${fullscreen ? "h-dvh w-screen rounded-none" : "h-[min(680px,calc(100dvh-56px))] w-[min(960px,calc(100vw-32px))] rounded-[26px]"}`}
      >
        <header className="flex h-[58px] shrink-0 items-center border-b border-border px-5 max-md:h-auto max-md:flex-wrap max-md:px-3 max-md:py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <UiIcon name="search" size={20} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={tab === "chats" ? "Search chats…" : "Search media…"}
              aria-label={tab === "chats" ? "Search chats" : "Search media"}
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-foreground outline-none placeholder:text-muted"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                aria-label="Clear search"
              >
                <UiIcon name="close" size={15} />
              </button>
            ) : null}
          </div>
          <div className="ml-4 flex rounded-full bg-surface p-0.5 max-md:ml-2">
            {(["chats", "media"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-full px-3 py-1.5 text-[13px] capitalize ${tab === item ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={closeSearch}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close search"
          >
            <UiIcon name="close" size={17} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {tab === "chats" ? (
            <>
              <div className="w-[39%] min-w-[330px] overflow-y-auto border-r border-border p-3 max-md:w-full max-md:min-w-0 max-md:border-r-0">
                {!query ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between px-2 py-1 text-[13px] text-muted">
                      <span>Actions</span>
                      <span>Show all</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(null);
                        closeSearch();
                        router.push("/new");
                      }}
                      className="flex h-12 w-full items-center gap-2 rounded-2xl bg-surface px-3 text-left text-[14px] font-medium text-foreground hover:bg-border"
                    >
                      <UiIcon name="newChat" size={17} />
                      Create New Chat
                    </button>
                  </div>
                ) : null}
                {loading && catalog.length === 0 ? <SearchStatus>Searching your chats…</SearchStatus> : null}
                {error ? (
                  <SearchStatus>
                    <span>{error}</span>
                    <button type="button" onClick={() => { loadedSignature.current = ""; setLoadNonce((value) => value + 1); }} className="mt-2 rounded-xl border border-border px-3 py-1.5 text-foreground hover:bg-surface">Try again</button>
                  </SearchStatus>
                ) : null}
                {!loading && !error && chatResults.length === 0 ? <SearchStatus>No chats found for “{query}”.</SearchStatus> : null}
                {chatGroups.map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="px-2 pb-1 pt-1 text-[13px] text-muted">{group.label}</p>
                    {group.results.map((result) => (
                      <ChatResultRow
                        key={result.chat.id}
                        result={result}
                        query={query}
                        active={result.chat.id === selectedResult?.chat.id}
                        current={pathname === result.chat.href}
                        onSelect={() => setSelectedChatId(result.chat.id)}
                        onOpen={() => {
                          closeSearch();
                          router.push(result.chat.href);
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto bg-[color-mix(in_srgb,var(--bg)_42%,var(--surface-2))] p-7 max-md:hidden">
                {selectedResult ? (
                  <ChatPreview
                    result={selectedResult}
                    messages={previewMessages}
                    query={query}
                    editing={editing}
                    editTitle={editTitle}
                    onEditTitle={setEditTitle}
                    onSaveTitle={() => void saveTitle()}
                    onCancelEdit={() => setEditing(false)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[14px] text-muted">Select a conversation to preview</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="w-[39%] min-w-[330px] overflow-y-auto border-r border-border p-3 max-md:w-full max-md:min-w-0 max-md:border-r-0">
                {loading && media.length === 0 ? <SearchStatus>Loading media…</SearchStatus> : null}
                {error ? (
                  <SearchStatus>
                    <span>{error}</span>
                    <button type="button" onClick={() => { loadedSignature.current = ""; setLoadNonce((value) => value + 1); }} className="mt-2 rounded-xl border border-border px-3 py-1.5 text-foreground hover:bg-surface">Try again</button>
                  </SearchStatus>
                ) : null}
                {!loading && !error && mediaResults.length === 0 ? <SearchStatus>No media found{query ? ` for “${query}”` : ""}.</SearchStatus> : null}
                <div className="grid grid-cols-3 gap-1.5 max-md:grid-cols-4 max-sm:grid-cols-3">
                  {mediaResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedMediaId(item.id)}
                      onDoubleClick={() => {
                        const target = catalog.find((chat) => chat.id === item.chatId)?.href;
                        if (!target) return;
                        closeSearch();
                        router.push(target);
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-surface ${item.id === selectedMedia?.id ? "border-accent" : "border-transparent"}`}
                      aria-label={`${item.title} from ${item.chatTitle}`}
                    >
                      {item.storagePath ? (
                        <StorageThumb path={item.storagePath} className="h-full w-full rounded-none transition-transform duration-200 group-hover:scale-[1.03]" />
                      ) : (
                        <img src={item.thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto bg-[color-mix(in_srgb,var(--bg)_42%,var(--surface-2))] p-7 max-md:hidden">
                {selectedMedia ? <MediaPreview item={selectedMedia} query={query} /> : (
                  <div className="flex h-full items-center justify-center text-[14px] text-muted">Select media to preview</div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex h-[51px] shrink-0 items-center justify-between border-t border-border px-5 text-[13px] text-muted">
          <button type="button" onClick={() => setFullscreen((value) => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface hover:text-foreground" aria-label={fullscreen ? "Exit fullscreen" : "Expand search"}>
            <UiIcon name="zoomIn" size={15} />
          </button>
          <div className="flex items-center gap-5 max-sm:gap-3">
            <FooterAction label="Go" keys="↵" onClick={goToSelection} />
            {tab === "chats" ? <FooterAction label="Edit" keys="Ctrl+⇧ E" onClick={startEditing} /> : null}
            {tab === "chats" ? <FooterAction label="Delete" keys="Ctrl+⇧ D" onClick={() => selectedResult && setDeleteOpen(true)} /> : null}
          </div>
        </footer>
      </section>

      {deleteOpen && selectedResult ? (
        <div className="popup-backdrop fixed inset-0 z-[60] flex items-center justify-center px-4" onMouseDown={(event) => event.target === event.currentTarget && !deletePending && setDeleteOpen(false)}>
          <div ref={confirmRef} role="dialog" aria-modal="true" aria-labelledby="chat-search-delete-title" className="popup-surface w-full max-w-sm rounded-2xl border border-border bg-surface-2 p-5 shadow-2xl">
            <h2 id="chat-search-delete-title" className="text-[15px] font-medium text-foreground">Delete “{selectedResult.chat.title}”?</h2>
            <p className="mt-2 text-[13px] leading-5 text-muted">
              {searchDeletionScope({
                isDefaultThread: selectedResult.chat.threadId === DEFAULT_CHAT_THREAD_ID,
                projectListed: projects.find((item) => item.id === selectedResult.chat.projectId)?.listed === true,
              }) === "container"
                ? "This standalone chat, its messages, and its attached project data will be permanently deleted."
                : "This conversation and its messages will be permanently deleted."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button autoFocus type="button" disabled={deletePending} onClick={() => setDeleteOpen(false)} className="rounded-xl px-3 py-2 text-[13px] text-muted hover:bg-surface">Cancel</button>
              <button type="button" disabled={deletePending} onClick={() => void confirmDelete()} className="rounded-xl bg-red-500 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50">{deletePending ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChatResultRow({
  result,
  query,
  active,
  current,
  onSelect,
  onOpen,
}: {
  result: ChatSearchResult;
  query: string;
  active: boolean;
  current: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={`mb-0.5 w-full rounded-2xl px-3 py-2.5 text-left ${active ? "bg-surface" : "hover:bg-surface"}`}
    >
      {result.chat.projectTitle ? <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted"><UiIcon name="projectFolder" size={12} />{result.chat.projectTitle}</p> : null}
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground"><Highlight query={query}>{result.chat.title}</Highlight></p>
        {current ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">Current</span> : null}
        <span className="shrink-0 text-[12px] text-muted">{formatSearchAge(result.chat.updatedAt)}</span>
      </div>
      {result.excerpt ? <p className="mt-1 line-clamp-2 text-[12px] leading-[17px] text-muted"><Highlight query={query}>{result.excerpt}</Highlight></p> : null}
    </button>
  );
}

function ChatPreview({
  result,
  messages,
  query,
  editing,
  editTitle,
  onEditTitle,
  onSaveTitle,
  onCancelEdit,
}: {
  result: ChatSearchResult;
  messages: SearchChat["messages"];
  query: string;
  editing: boolean;
  editTitle: string;
  onEditTitle: (value: string) => void;
  onSaveTitle: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <article className="mx-auto max-w-[620px]">
      {result.chat.projectTitle ? <p className="mb-2 flex items-center gap-1.5 text-[12px] text-muted"><UiIcon name="projectFolder" size={13} />{result.chat.projectTitle}</p> : null}
      {editing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(event) => onEditTitle(event.target.value)}
          onBlur={onSaveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onCancelEdit();
          }}
          className="mb-6 w-full rounded-xl border border-accent bg-surface px-3 py-2 text-xl font-semibold text-foreground outline-none"
        />
      ) : (
        <h2 className="mb-6 text-xl font-semibold text-foreground"><Highlight query={query}>{result.chat.title}</Highlight></h2>
      )}
      <div className="space-y-5">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[82%] rounded-2xl bg-surface px-4 py-3" : "max-w-full"}>
            <p className="mb-1 text-[11px] text-muted">{message.role === "user" ? "You" : "TobyVerse"}</p>
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground"><Highlight query={query}>{message.content}</Highlight></p>
          </div>
        ))}
      </div>
    </article>
  );
}

function MediaPreview({ item, query }: { item: SearchMediaItem; query: string }) {
  return (
    <article className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-surface">
        {item.storagePath ? (
          <StorageThumb path={item.storagePath} className="h-full w-full rounded-none" />
        ) : (
          <img src={item.src} alt={item.alt} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="shrink-0 pt-4">
        <p className="text-[14px] font-medium text-foreground"><Highlight query={query}>{item.title}</Highlight></p>
        <p className="mt-1 text-[12px] text-muted">From {item.chatTitle}</p>
        {item.context ? <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted"><Highlight query={query}>{item.context}</Highlight></p> : null}
      </div>
    </article>
  );
}

function SearchStatus({ children }: { children: ReactNode }) {
  return <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center text-[13px] text-muted">{children}</div>;
}

function FooterAction({ label, keys, onClick }: { label: string; keys: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 hover:text-foreground">
      <span>{label}</span>
      <kbd className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-muted">{keys}</kbd>
    </button>
  );
}

function Highlight({ query, children }: { query: string; children: string }) {
  const tokens = [...new Set(normalizeSearchText(query).split(" ").filter(Boolean))];
  if (tokens.length === 0) return children;
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "giu");
  return children.split(pattern).map((part, index) =>
    tokens.includes(normalizeSearchText(part))
      ? <mark key={`${part}-${index}`} className="rounded-sm bg-[var(--highlight-bg)] px-0.5 text-inherit">{part}</mark>
      : part,
  );
}
