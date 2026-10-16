"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { UiIcon } from "@/components/workspace/ui-icon";
import { StatusWait } from "@/components/workspace/status-wait";
import { RichContent } from "@/components/rich-content";
import { VisualList } from "@/components/visuals/visual-block";
import { MixedText } from "@/components/visuals/mixed-text";
import { findNode, flattenCourseNodes, flattenNodes, pathIsStarted, progressCounts } from "@/lib/paths/model";
import type { PathNode, PathUnit, StudyPath } from "@/types/path";
import type { NotesLiveState, StudySheet } from "@/types/study-sheet";

export function PathView({
  path,
  status,
  sheets = [],
  liveNote = null,
}: {
  path: StudyPath;
  status?: string | null;
  sheets?: StudySheet[];
  liveNote?: NotesLiveState | null;
}) {
  const currentRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const loc = findNode(path, path.currentNodeId);
  const { done, total } = progressCounts(path.courses);
  const draft = !pathIsStarted(path) || Boolean(status);
  const groups = pathGroups(path);
  const hereId = loc ? (path.courses.length > 1 ? loc.course.id : loc.unit.id) : groups[0]?.id ?? "";
  const [viewGroupId, setViewGroupId] = useState(hereId);
  const [showGroups, setShowGroups] = useState(false);
  const [justDone, setJustDone] = useState<Set<string>>(() => new Set());
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());
  const seenDone = useRef<Set<string> | null>(null);
  const group = groups.find((item) => item.id === viewGroupId) ?? groups.find((item) => item.id === hereId) ?? groups[0] ?? null;
  const finished = !draft && total > 0 && done >= total;
  const sheetsById = new Map(sheets.map((item) => [item.id, item]));
  const liveBlocks = liveNote?.blocks.length ?? 0;
  const manyGroups = groups.length > 1;

  useEffect(() => {
    setViewGroupId(hereId);
    setShowGroups(false);
  }, [hereId]);

  useEffect(() => {
    const nowDone = new Set(
      flattenNodes(path.courses)
        .filter((node) => node.status === "done")
        .map((node) => node.id),
    );
    if (!seenDone.current) {
      seenDone.current = nowDone;
      return;
    }
    const fresh = [...nowDone].filter((id) => !seenDone.current?.has(id));
    seenDone.current = nowDone;
    if (fresh.length === 0) return;
    setJustDone(new Set(fresh));
    const timer = window.setTimeout(() => setJustDone(new Set()), 900);
    return () => window.clearTimeout(timer);
  }, [path.courses]);

  useEffect(() => {
    if (showGroups) return;
    if (status) {
      tailRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      return;
    }
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [path.currentNodeId, viewGroupId, total, status, liveBlocks, showGroups]);

  if (!group) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-8 text-center">
        {status ? <StatusWait label={status} className="text-[13px]" /> : (
          <>
            <p className="text-[15px] font-medium tracking-tight text-foreground">No path yet</p>
            <p className="mt-2 max-w-[260px] text-[13px] leading-5 text-muted">
              Drop a syllabus in chat and ask for a course path.
            </p>
          </>
        )}
      </div>
    );
  }

  const groupsOpen = showGroups && manyGroups;
  const heading = groupsOpen ? path.title : group.title;
  const counts = groupsOpen ? { done, total } : nodeCounts(group.nodes);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {groupsOpen ? null : manyGroups ? (
            <button
              type="button"
              onClick={() => setShowGroups(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              aria-label="All groups"
            >
              <UiIcon name="back" size={16} />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-tight text-foreground">{heading}</p>
          <p className="shrink-0 text-[12px] text-muted">
            {counts.done}/{counts.total}
          </p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-foreground transition-[width]"
            style={{ width: counts.total ? `${Math.round((counts.done / counts.total) * 100)}%` : "0%" }}
          />
        </div>
      </div>

      {groupsOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groups.map((item) => (
            <PathGroupRow
              key={item.id}
              title={item.title}
              nodes={item.nodes}
              current={item.id === hereId}
              onOpen={() => {
                setViewGroupId(item.id);
                setShowGroups(false);
              }}
            />
          ))}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {group.units.map((unit, unitIndex) => {
          const grouped = group.units.length > 1 && unit.nodes.length > 1;
          const lastUnit = unitIndex === group.units.length - 1;
          return (
            <section key={unit.id} className={unitIndex === 0 ? "" : grouped ? "mt-8" : ""}>
              {grouped ? (
                <div className="mb-4 flex gap-3">
                  <div className="flex w-7 shrink-0 justify-center">
                    {unitIndex === 0 ? null : <span className="w-px self-stretch bg-border" />}
                  </div>
                  <p className="min-w-0 pt-0.5 text-[13px] font-medium tracking-wide text-muted">{unit.title}</p>
                </div>
              ) : null}
              <ol className="flex flex-col">
                {unit.nodes.map((node, index) => {
                  const current = !draft && node.id === path.currentNodeId;
                  const live =
                    current && liveNote
                      ? !liveNote.sheetId || !node.sheetId || liveNote.sheetId === node.sheetId
                        ? liveNote
                        : null
                      : null;
                  const sheet = node.sheetId ? sheetsById.get(node.sheetId) ?? null : null;
                  return (
                    <PathNodeRow
                      key={node.id}
                      node={node}
                      last={lastUnit && index === unit.nodes.length - 1}
                      draft={draft}
                      justDone={justDone.has(node.id)}
                      markerRef={current ? currentRef : undefined}
                      sheet={sheet}
                      liveNote={live}
                      noteOpen={current || openNotes.has(node.id)}
                      onToggleNote={() =>
                        setOpenNotes((currentOpen) => {
                          const next = new Set(currentOpen);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          return next;
                        })
                      }
                    />
                  );
                })}
              </ol>
            </section>
          );
        })}
        <div ref={tailRef} />
      </div>
      )}

      <div className="shrink-0 border-t border-border px-4 py-3">
        {status ? (
          <StatusWait label={status} className="text-[12px]" />
        ) : draft ? (
          <p className="text-[13px] text-muted">Review this path, then start.</p>
        ) : finished ? (
          <p className="text-[13px] text-muted">Path complete.</p>
        ) : loc ? (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-foreground">{loc.node.title}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              {loc.node.status === "ready" ? "Ready to move on." : loc.node.why || "The tutor leads this topic."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type PathGroup = {
  id: string;
  title: string;
  nodes: PathNode[];
  units: PathUnit[];
};

function nodeReadyLabel(status: PathNode["status"], draft: boolean): string | null {
  if (draft) return null;
  if (status === "done") return null;
  if (status === "ready") return "ready to move on";
  if (status === "current") return "in progress";
  return "not started";
}

function nodeCounts(nodes: PathNode[]): { done: number; total: number } {
  return {
    done: nodes.filter((item) => item.status === "done").length,
    total: nodes.length,
  };
}

function pathGroups(path: StudyPath): PathGroup[] {
  if (path.courses.length > 1) {
    return path.courses.map((course) => ({
      id: course.id,
      title: course.title,
      nodes: flattenCourseNodes(course),
      units: course.units,
    }));
  }
  const course = path.courses[0];
  if (!course) return [];
  if (course.units.length > 1) {
    return course.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      nodes: unit.nodes,
      units: [unit],
    }));
  }
  return [
    {
      id: course.id,
      title: course.title,
      nodes: flattenCourseNodes(course),
      units: course.units,
    },
  ];
}

function PathGroupRow({
  title,
  nodes,
  current,
  onOpen,
}: {
  title: string;
  nodes: PathNode[];
  current: boolean;
  onOpen: () => void;
}) {
  const { done, total } = nodeCounts(nodes);
  const complete = total > 0 && done >= total;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={current ? "step" : undefined}
      data-active={current ? "true" : "false"}
      className="panel-selectable flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
          complete
            ? "border-foreground bg-foreground text-background"
            : current
              ? "path-node-current border-border bg-surface-2 text-muted"
              : "border-border bg-surface text-muted"
        }`}
      >
        {complete ? <UiIcon name="check" size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{title}</span>
      <span className="shrink-0 text-[12px] text-muted">
        {done}/{total}
      </span>
    </button>
  );
}

function PathNodeRow({
  node,
  last,
  draft,
  justDone,
  markerRef,
  sheet,
  liveNote,
  noteOpen,
  onToggleNote,
}: {
  node: PathNode;
  last: boolean;
  draft: boolean;
  justDone?: boolean;
  markerRef?: Ref<HTMLDivElement>;
  sheet: StudySheet | null;
  liveNote: NotesLiveState | null;
  noteOpen: boolean;
  onToggleNote: () => void;
}) {
  const current = !draft && (node.status === "current" || node.status === "ready");
  const done = !draft && node.status === "done";
  const locked = !draft && node.status === "todo";
  const hasNote = Boolean(liveNote || sheet);
  const expanded = Boolean(liveNote) || (hasNote && noteOpen);
  const readyLabel = nodeReadyLabel(node.status, draft);
  return (
    <li className="flex gap-3">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <div
          ref={markerRef}
          aria-current={current ? "step" : undefined}
          aria-label={node.title}
          className={`flex h-7 w-7 items-center justify-center rounded-full border ${
            done
              ? `border-foreground bg-foreground text-background${justDone ? " path-node-just-done" : ""}`
              : current
                ? "path-node-current border-border bg-surface-2 text-muted"
                : "border-border bg-surface text-muted"
          }`}
        >
          {done ? (
            <UiIcon name="check" size={14} />
          ) : locked ? (
            <UiIcon name="lock" size={12} />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          )}
        </div>
        {last ? null : <span className="w-px flex-1 bg-border" />}
      </div>
      <div className={`min-w-0 flex-1 pb-4 ${last ? "pb-0" : ""} ${locked ? "opacity-50" : ""}`}>
        <span
          className={`block truncate text-[13px] ${
            current || draft ? "text-foreground" : done ? "text-foreground/80" : "text-muted"
          }`}
        >
          {node.title}
        </span>
        {readyLabel || node.why ? (
          <p className="mt-0.5 text-[11px] text-muted">
            {readyLabel}
            {readyLabel && node.why ? " · " : ""}
            {node.why}
          </p>
        ) : null}
        {hasNote ? (
          <div className={`path-node-note mt-2 ${liveNote || justDone ? "path-node-note-in" : ""}`}>
            {expanded ? (
              <PathNodeNote
                sheet={sheet}
                liveNote={liveNote}
                onCollapse={liveNote ? undefined : onToggleNote}
              />
            ) : (
              <button
                type="button"
                onClick={onToggleNote}
                className="flex w-full items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-left text-[12px] text-muted hover:text-foreground"
              >
                <UiIcon name="notes" size={13} />
                <span className="min-w-0 truncate">{sheet?.title || "Notes"}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PathNodeNote({
  sheet,
  liveNote,
  onCollapse,
}: {
  sheet: StudySheet | null;
  liveNote: NotesLiveState | null;
  onCollapse?: () => void;
}) {
  const title = (liveNote?.title || sheet?.title || "").trim();
  const blocks = liveNote?.blocks.length ? liveNote.blocks : sheet?.blocks ?? [];
  const prose = (liveNote?.content || sheet?.prose || sheet?.content || "").trim();
  const heading = title && !/^notes$/i.test(title) ? title : "Notes";
  const waiting = Boolean(liveNote?.status);
  return (
    <div className="overflow-hidden rounded-xl bg-surface-2 px-3 py-3">
      {waiting ? <StatusWait label={liveNote?.status || "Creating notes…"} className="text-[12px]" /> : null}
      {waiting ? null : onCollapse ? (
        <button
          type="button"
          onClick={onCollapse}
          className="mb-2 flex w-full items-center gap-1.5 text-left text-[13px] font-medium tracking-tight text-foreground"
        >
          <UiIcon name="notes" size={13} />
          <span className="min-w-0 truncate">
            <MixedText text={heading} />
          </span>
        </button>
      ) : title && !/^notes$/i.test(title) ? (
        <p className="mb-2 text-[13px] font-medium tracking-tight text-foreground">
          <MixedText text={title} />
        </p>
      ) : null}
      {waiting ? null : blocks.length > 0 ? <VisualList blocks={blocks} /> : prose ? <RichContent text={prose} /> : null}
    </div>
  );
}
