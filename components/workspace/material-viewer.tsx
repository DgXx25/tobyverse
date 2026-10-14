"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject, type UIEvent } from "react";
import dynamic from "next/dynamic";
import { LinkifiedText } from "@/components/workspace/linkified-text";
import { ViewerBoundary } from "@/components/workspace/viewer-boundary";
import { UiIcon } from "@/components/workspace/ui-icon";
import { formatBytes } from "@/lib/format";
import {
  cacheKey,
  downloadMaterialFile,
  getMaterialFile,
  isMissingMaterialName,
  listMaterialFiles,
  materialFileObjectUrl,
  type MaterialFileResult,
  type MaterialFileAccess,
} from "@/lib/materials/file-client";
import {
  extractedStoredName,
  decodeHtmlEntities,
  mergeViewerPages,
  originalStoredName,
  paginateText,
  slidesFromListedNames,
  slidesFromMaterial,
  splitSlideText,
  viewerTitle,
  type ViewerSlide,
} from "@/lib/materials/viewer-files";
import type { Material } from "@/types/material";
import { SpreadsheetPage } from "@/components/workspace/spreadsheet-page";

const MaterialPdfPage = dynamic(() => import("@/components/workspace/material-pdf-page"), {
  ssr: false,
});

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const MaterialFileAccessContext = createContext<MaterialFileAccess | undefined>(undefined);

export type StageChrome = {
  page: number;
  count: number;
  zoom: number;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
};

function useMaterialFile(projectId: string, materialId: string, name: string | null) {
  const access = useContext(MaterialFileAccessContext);
  const key = cacheKey(projectId, materialId, name || "", access);
  const [state, setState] = useState<{ key: string; result: MaterialFileResult } | null>(null);

  useEffect(() => {
    if (!name) {
      setState(null);
      return;
    }
    if (isMissingMaterialName(projectId, materialId, name, access)) {
      setState({ key, result: { ok: false, status: 404, message: "File not found." } });
      return;
    }
    let cancelled = false;
    setState(null);
    void getMaterialFile(projectId, materialId, name, access).then((next) => {
      if (!cancelled) setState({ key, result: next });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, materialId, name, key, access]);

  return state?.key === key ? state.result : null;
}

function FileMessage({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-muted">{text}</p>;
}

function SpreadsheetStage({ material, originalName, onChrome }: {
  material: Material; originalName: string | null; onChrome: (chrome: StageChrome | null) => void;
}) {
  const file = useMaterialFile(material.projectId, material.id, originalName);
  return <SpreadsheetPage file={file} onChrome={onChrome} />;
}

function GhostBtn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: "back" | "close" | "download" | "panel" | "prev" | "forward" | "zoomIn" | "zoomOut";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg bg-transparent text-muted hover:text-foreground disabled:cursor-default disabled:opacity-35"
    >
      <UiIcon name={icon} size={16} />
    </button>
  );
}

export function MaterialViewer({
  material,
  onClose,
  onBack,
  presentation = "pane",
  onDelete,
  deleting = false,
  confirmDelete = false,
  fileAccess,
}: {
  material: Material;
  onClose: () => void;
  onBack?: () => void;
  presentation?: "pane" | "overlay";
  onDelete?: () => void;
  deleting?: boolean;
  confirmDelete?: boolean;
  fileAccess?: MaterialFileAccess;
}) {
  const originalName = originalStoredName(material);
  const title = viewerTitle(material);
  const [downloading, setDownloading] = useState(false);
  const [chrome, setChrome] = useState<StageChrome | null>(null);
  const onChrome = useCallback((next: StageChrome | null) => setChrome(next), []);

  const overlay = presentation === "overlay";
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function onDownload() {
    if (!originalName || originalName === "extracted.txt" || downloading) return;
    setDownloading(true);
    try {
      const error = await downloadMaterialFile(material.projectId, material.id, originalName, originalName, fileAccess);
      setDownloadError(error?.message ?? null);
    } catch {
      setDownloadError("Could not download file.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <MaterialFileAccessContext.Provider value={fileAccess}>
    <div className="relative flex h-full min-h-0 flex-col">
      <div className={overlay ? "absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 shadow-sm" : "flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1"}>
        {!overlay && onBack ? <button type="button" onClick={onBack} aria-label="Back" title="Back" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"><UiIcon name="back" size={16} /></button> : null}
        {!overlay ? <div className="flex min-w-[80px] flex-1 items-baseline gap-2">
          <p className="min-w-0 truncate text-[13px] text-foreground">{title}</p>
          <p className="shrink-0 truncate text-[11px] text-muted">
            {material.type.toUpperCase()}
            {material.sizeBytes ? ` · ${formatBytes(material.sizeBytes)}` : ""}
          </p>
        </div> : null}
        {chrome && chrome.count > 0 ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <GhostBtn label="Previous page" icon="prev" disabled={chrome.page <= 1} onClick={() => chrome.setPage(chrome.page - 1)} />
            <p className="min-w-[40px] text-center text-[12px] text-muted" aria-live="polite">
              {chrome.page} / {chrome.count}
            </p>
            <GhostBtn
              label="Next page"
              icon="forward"
              disabled={chrome.page >= chrome.count}
              onClick={() => chrome.setPage(chrome.page + 1)}
            />
            <span className="mx-1 h-4 w-px bg-border" />
            <GhostBtn label="Zoom out" icon="zoomOut" disabled={chrome.zoom <= ZOOM_MIN} onClick={() => chrome.setZoom(chrome.zoom - 25)} />
            <GhostBtn label="Zoom in" icon="zoomIn" disabled={chrome.zoom >= ZOOM_MAX} onClick={() => chrome.setZoom(chrome.zoom + 25)} />
          </div>
        ) : null}
        <GhostBtn
          label="Download"
          icon="download"
          disabled={!originalName || downloading}
          onClick={() => void onDownload()}
        />
        {overlay && onDelete ? <button type="button" onClick={onDelete} disabled={deleting} title={confirmDelete ? "Confirm delete" : "Delete"} aria-label={confirmDelete ? "Confirm delete" : "Delete"} className="flex h-8 w-7 items-center justify-center text-red-500 disabled:opacity-35"><UiIcon name="trash" size={16} /></button> : null}
        <GhostBtn label="Close pane" icon="panel" onClick={onClose} />
      </div>
      {downloadError ? <p role="alert" className="bg-surface p-2 text-center text-xs text-foreground">{downloadError}</p> : null}
      <div className={`min-h-0 flex-1 overflow-hidden ${overlay ? "pb-14" : ""}`}>
        <ViewerBoundary key={material.id}>
          {material.type === "pdf" ? (
            <PdfStage material={material} originalName={originalName} onChrome={onChrome} />
          ) : material.type === "pptx" ? (
            <PptxStage material={material} onChrome={onChrome} />
          ) : material.type === "image" ? (
            <ImageStage material={material} originalName={originalName} onChrome={onChrome} />
          ) : material.type === "docx" ? (
            <DocxStage material={material} onChrome={onChrome} />
          ) : material.type === "xlsx" || /\.xlsx?$/i.test(originalName || "") ? (
            <SpreadsheetStage material={material} originalName={originalName} onChrome={onChrome} />
          ) : (
            <TextStage material={material} onChrome={onChrome} />
          )}
        </ViewerBoundary>
      </div>
    </div>
    </MaterialFileAccessContext.Provider>
  );
}

function PdfStage({
  material,
  originalName,
  onChrome,
}: {
  material: Material;
  originalName: string | null;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  const file = useMaterialFile(material.projectId, material.id, originalName);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(Math.max(1, material.pageCount || 1));
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(0, node.clientWidth - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [file]);

  const onPageCount = useCallback((count: number) => {
    setPageCount(Math.max(1, count));
    setPage((current) => Math.min(current, Math.max(1, count)));
  }, []);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const nodes = [...viewport.querySelectorAll<HTMLElement>("[data-pdf-page]")];
    let closest = page;
    let distance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const nextDistance = Math.abs(node.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16);
      if (nextDistance < distance) {
        distance = nextDistance;
        closest = Number(node.dataset.pdfPage) || closest;
      }
    }
    if (closest !== page) setPage(closest);
  }, [page]);

  const scrollToPage = useCallback((next: number) => {
    const target = stageRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    onChrome({
      page,
      count: pageCount,
      zoom,
      setPage: (next) => {
        const safe = Math.min(pageCount, Math.max(1, next));
        setPage(safe);
        scrollToPage(safe);
      },
      setZoom: (next) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))),
    });
    return () => onChrome(null);
  }, [onChrome, page, pageCount, scrollToPage, zoom]);

  if (!originalName) return <FileMessage text="File not found." />;
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok) {
    return <FileMessage text={file.status === 401 ? "Sign in." : "File not found."} />;
  }

  const pageWidth = Math.round(width * (zoom / 100));

  return (
    <div ref={stageRef} className="h-full overflow-auto" onScroll={onScroll}>
      <div className="mx-auto py-4" style={{ width: pageWidth || 320 }}>
        <MaterialPdfPage data={file.bytes} pageCount={pageCount} width={pageWidth || 320} onPageCount={onPageCount} />
      </div>
    </div>
  );
}

function useResolvedPreviewPages(material: Material) {
  const access = useContext(MaterialFileAccessContext);
  const fromDoc = useMemo(() => slidesFromMaterial(material), [material]);
  const [slides, setSlides] = useState<ViewerSlide[]>(fromDoc);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSlides(fromDoc);
    setReady(false);
    void listMaterialFiles(material.projectId, material.id, access).then((listing) => {
      if (cancelled) return;
      const pages = new Map<number, ViewerSlide>();
      if (listing.ok) {
        for (const slide of slidesFromListedNames(listing.names, originalStoredName(material))) pages.set(slide.page, slide);
      }
      for (const slide of fromDoc) pages.set(slide.page, slide);
      setSlides([...pages.values()].sort((a, b) => a.page - b.page));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [fromDoc, material, access]);

  const removePageImage = useCallback((fileName: string) => {
    setSlides((current) => current.map((slide) => slide.fileName === fileName ? { ...slide, fileName: null } : slide));
  }, []);
  return { slides, ready, removePageImage };
}

function PptxStage({
  material,
  onChrome,
}: {
  material: Material;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  return <StoredPagesStage material={material} onChrome={onChrome} kind="slides" />;
}

function DocxStage({
  material,
  onChrome,
}: {
  material: Material;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  return <StoredPagesStage material={material} onChrome={onChrome} kind="document" />;
}

function StoredPagesStage({
  material,
  onChrome,
  kind,
}: {
  material: Material;
  onChrome: (chrome: StageChrome | null) => void;
  kind: "slides" | "document";
}) {
  const access = useContext(MaterialFileAccessContext);
  const { slides, ready, removePageImage } = useResolvedPreviewPages(material);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const scrollRef = useRef<HTMLDivElement>(null);
  const extractedName = ready ? extractedStoredName(material) : null;
  const extracted = useMaterialFile(material.projectId, material.id, extractedName);
  const texts = useMemo(() => {
    const text = extracted ? textFallback(material, extracted) : "";
    return kind === "slides" ? splitSlideText(text) : paginateText(text);
  }, [material, extracted, kind]);
  const pages = useMemo(() => mergeViewerPages(slides, kind === "slides"
    ? new Set([...texts.keys(), ...Array.from({ length: Math.min(10000, Math.max(0, material.pageCount || 0)) }, (_, i) => i + 1)])
    : texts.keys()), [slides, texts, kind, material.pageCount]);
  const count = Math.max(1, pages.length);
  const navigatePage = useCallback((next: number) => {
    const pageIndex = Math.min(count - 1, Math.max(0, next - 1));
    setIndex(pageIndex);
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector<HTMLElement>(`[data-slide-page="${pageIndex + 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [count]);

  useEffect(() => {
    setIndex(0);
    setZoom(100);
  }, [material.id]);

  useEffect(() => {
    setIndex((current) => Math.min(current, count - 1));
  }, [count]);

  useEffect(() => {
    onChrome({
      page: index + 1,
      count,
      zoom,
      setPage: navigatePage,
      setZoom: (next) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))),
    });
    return () => onChrome(null);
  }, [count, index, navigatePage, onChrome, zoom]);

  const current = pages[index] ?? pages[0];
  const currentName = current?.fileName ?? null;
  const pageFile = useMaterialFile(material.projectId, material.id, currentName);

  useEffect(() => {
    if (pageFile && !pageFile.ok && pageFile.status === 404 && currentName) {
      removePageImage(currentName);
    }
  }, [pageFile, currentName, removePageImage]);

  const neighbors = useMemo(() => {
    return [index - 1, index, index + 1]
      .map((i) => pages[i]?.fileName)
      .filter((name): name is string => typeof name === "string");
  }, [index, pages]);

  useEffect(() => {
    for (const name of neighbors) {
      if (isMissingMaterialName(material.projectId, material.id, name, access)) continue;
      void getMaterialFile(material.projectId, material.id, name, access);
    }
  }, [neighbors, material.projectId, material.id, access]);

  if (!ready) return <FileMessage text="Loading…" />;
  if (!currentName && !extracted) return <FileMessage text="Loading…" />;

  if (kind === "slides" || kind === "document") {
    if (pages.length === 0) {
      return kind === "slides"
        ? <FileMessage text="Preview unavailable — Download the original PowerPoint file." />
        : <TextPage text={texts.get(1) || "No preview yet."} zoom={zoom} />;
    }
    return (
      <div
        ref={scrollRef}
        className="h-full overflow-auto px-3 py-4"
        onScroll={(event) => {
          const viewport = event.currentTarget;
          const nodes = [...viewport.querySelectorAll<HTMLElement>("[data-slide-page]")];
          let closest = index;
          let distance = Number.POSITIVE_INFINITY;
          for (const node of nodes) {
            const top = node.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
            const nextDistance = Math.abs(top - 16);
            if (nextDistance < distance) {
              distance = nextDistance;
              closest = Number(node.dataset.slidePage) - 1;
            }
          }
          if (closest !== index) setIndex(closest);
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4" style={{ width: `${zoom}%` }}>
          {pages.map((slide) => (
            <ContinuousSlidePage
              key={`${material.id}:${slide.page}:${slide.fileName ?? "text"}`}
              material={material}
              slide={slide}
              text={texts.get(slide.page) || ""}
              zoom={100}
              kind={kind}
            />
          ))}
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    if (extracted && !extracted.ok && extracted.status === 401) return <FileMessage text="Sign in." />;
    if (!extracted && extractedName) return <FileMessage text="Loading…" />;
    return (
      <TextPage
        text="No preview yet."
        notice="Layout preview unavailable."
        zoom={zoom}
      />
    );
  }

}

function ContinuousSlidePage({
  material,
  slide,
  text,
  zoom,
  kind,
}: {
  material: Material;
  slide: ViewerSlide;
  text: string;
  zoom: number;
  kind: "slides" | "document";
}) {
  const access = useContext(MaterialFileAccessContext);
  const pageRef = useRef<HTMLDivElement>(null);
  const active = useNearViewport(pageRef);
  const file = useMaterialFile(material.projectId, material.id, active ? slide.fileName : null);

  if (!slide.fileName) {
    return <div data-slide-page={slide.page} data-stored-page={kind === "document" ? slide.page : undefined} className="min-h-[420px] bg-white p-8 text-black shadow-sm">
      {kind === "slides" ? <p className="text-[13px] text-black/60">Preview unavailable — Download the original PowerPoint file.</p> : (
        <article className="whitespace-pre-wrap text-[16px] leading-relaxed" style={{ fontSize: `${16 * zoom / 100}px` }}>{text || "No preview yet."}</article>
      )}
    </div>;
  }
  const url = file?.ok
    ? materialFileObjectUrl(file, cacheKey(material.projectId, material.id, slide.fileName, access))
    : null;
  return <div ref={pageRef} data-slide-page={slide.page} data-stored-page={kind === "document" ? slide.page : undefined} className="min-h-[240px] bg-white shadow-sm">
    {url ? <img src={url} alt={`Slide ${slide.page}`} loading="lazy" className="block h-auto w-full object-contain" /> : (
      kind === "slides"
        ? <div className="p-8 text-black/60"><p className="text-[13px]">Preview unavailable — Download the original PowerPoint file.</p></div>
        : text ? <div className="p-8 text-black"><p className="whitespace-pre-wrap">{text}</p></div> : <div className="h-[420px]" />
    )}
  </div>;
}

function useNearViewport(ref: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "500px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return active;
}

function ImageStage({
  material,
  originalName,
  onChrome,
}: {
  material: Material;
  originalName: string | null;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  const access = useContext(MaterialFileAccessContext);
  const name = originalName || slidesFromMaterial(material)[0]?.fileName || null;
  const file = useMaterialFile(material.projectId, material.id, name);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    onChrome({
      page: 1,
      count: 1,
      zoom,
      setPage: () => undefined,
      setZoom: (next) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))),
    });
    return () => onChrome(null);
  }, [onChrome, zoom]);

  if (!name) return <FileMessage text="File not found." />;
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok) {
    return <FileMessage text={file.status === 401 ? "Sign in." : "File not found."} />;
  }
  const url = materialFileObjectUrl(file, cacheKey(material.projectId, material.id, name, access));
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-3">
      <img
        src={url}
        alt={material.title}
        className="block max-w-none object-contain"
        style={{ width: `${zoom}%` }}
      />
    </div>
  );
}

function textFallback(material: Material, file: MaterialFileResult | null): string {
  if (file?.ok) return decodeHtmlEntities(new TextDecoder().decode(file.bytes)).trim();
  return decodeHtmlEntities(material.extractedTextPreview?.trim() || "");
}

function TextStage({
  material,
  onChrome,
}: {
  material: Material;
  onChrome: (chrome: StageChrome | null) => void;
}) {
  const name = extractedStoredName(material);
  const file = useMaterialFile(material.projectId, material.id, name);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    onChrome({
      page: 1,
      count: 1,
      zoom,
      setPage: () => undefined,
      setZoom: (next) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))),
    });
    return () => onChrome(null);
  }, [onChrome, zoom]);

  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok && file.status === 401) return <FileMessage text="Sign in." />;
  const text = textFallback(material, file);
  if (!file.ok && !text) return <FileMessage text="File not found." />;
  return <TextPage text={text || "No preview yet."} zoom={zoom} paper={material.type !== "paste"} />;
}

function TextPage({ text, notice, zoom, paper = true }: { text: string; notice?: string; zoom: number; paper?: boolean }) {
  return (
    <div className="h-full overflow-auto px-3 py-5">
      <article className={`mx-auto min-h-[60vh] max-w-none p-6 text-[16px] leading-relaxed sm:p-12 ${paper ? "bg-white text-black" : "bg-surface text-foreground"}`} style={{ width: `${zoom}%`, overflowWrap: "anywhere" }}>
        {notice ? <p className={`mb-5 text-[12px] ${paper ? "text-black/55" : "text-muted"}`}>{notice}</p> : null}
        <p className="whitespace-pre-wrap">
          <LinkifiedText text={text} />
        </p>
      </article>
    </div>
  );
}
