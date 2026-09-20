"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DocumentPaper } from "@/components/workspace/document-paper";
import { LinkifiedText } from "@/components/workspace/linkified-text";
import { ViewerBoundary } from "@/components/workspace/viewer-boundary";
import { UiIcon } from "@/components/workspace/ui-icon";
import { docxBytesToHtml } from "@/lib/materials/docx-html";
import {
  cacheKey,
  downloadMaterialFile,
  getMaterialFile,
  isMissingMaterialName,
  listMaterialFiles,
  materialFileObjectUrl,
  type MaterialFileResult,
} from "@/lib/materials/file-client";
import { patchMaterialPreviewHtml } from "@/lib/materials/store";
import {
  extractedStoredName,
  originalStoredName,
  slidesFromListedNames,
  slidesFromMaterial,
  splitSlideText,
  viewerTitle,
  type ViewerSlide,
} from "@/lib/materials/viewer-files";
import type { Material } from "@/types/material";

const MaterialPdfPage = dynamic(() => import("@/components/workspace/material-pdf-page"), {
  ssr: false,
});

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

function useMaterialFile(projectId: string, materialId: string, name: string | null) {
  const [result, setResult] = useState<MaterialFileResult | null>(() => {
    if (!name) return null;
    if (isMissingMaterialName(projectId, materialId, name)) {
      return { ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" };
    }
    return null;
  });

  useEffect(() => {
    if (!name) {
      setResult(null);
      return;
    }
    if (isMissingMaterialName(projectId, materialId, name)) {
      setResult({ ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" });
      return;
    }
    let cancelled = false;
    setResult(null);
    void getMaterialFile(projectId, materialId, name).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, materialId, name]);

  return result;
}

function FileMessage({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-muted">{text}</p>;
}

function GhostBtn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: "back" | "close" | "download" | "prev" | "forward" | "zoomIn" | "zoomOut";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-transparent text-muted hover:text-foreground disabled:cursor-default disabled:opacity-35"
    >
      <UiIcon name={icon} size={16} />
    </button>
  );
}

export function MaterialViewer({
  material,
  onClose,
}: {
  material: Material;
  onClose: () => void;
}) {
  const originalName = originalStoredName(material);
  const title = viewerTitle(material);
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (!originalName || originalName === "extracted.txt" || downloading) return;
    setDownloading(true);
    try {
      await downloadMaterialFile(material.projectId, material.id, originalName, originalName);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <GhostBtn label="Back" icon="back" onClick={onClose} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-foreground">{title}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">
            {material.type}
            {originalName ? ` · ${originalName}` : ""}
          </p>
        </div>
        <GhostBtn
          label="Download"
          icon="download"
          disabled={!originalName || downloading}
          onClick={() => void onDownload()}
        />
        <GhostBtn label="Close" icon="close" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ViewerBoundary>
          {material.status === "failed" ? (
            <FileMessage text="Could not process this file." />
          ) : material.status === "processing" && !material.extractedTextPreview.trim() ? (
            <FileMessage text="Still processing…" />
          ) : material.type === "pdf" ? (
            <PdfStage material={material} originalName={originalName} />
          ) : material.type === "pptx" ? (
            <PptxStage material={material} />
          ) : material.type === "image" ? (
            <ImageStage material={material} originalName={originalName} />
          ) : material.type === "docx" ? (
            <DocxStage material={material} originalName={originalName} />
          ) : (
            <TextStage material={material} />
          )}
        </ViewerBoundary>
      </div>
    </div>
  );
}

function PdfStage({ material, originalName }: { material: Material; originalName: string | null }) {
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
  }, []);

  const onPageCount = useCallback((count: number) => {
    setPageCount(Math.max(1, count));
    setPage((current) => Math.min(current, Math.max(1, count)));
  }, []);

  if (!originalName) return <FileMessage text="ფაილი ვერ მოიძებნა" />;
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok) {
    return <FileMessage text={file.status === 401 ? "Sign in." : "ფაილი ვერ მოიძებნა"} />;
  }

  const pageWidth = Math.round(width * (zoom / 100));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-1 px-2 py-1.5">
        <GhostBtn label="Previous page" icon="prev" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))} />
        <p className="min-w-[72px] text-center text-[12px] text-muted">
          {page} / {pageCount}
        </p>
        <GhostBtn
          label="Next page"
          icon="forward"
          disabled={page >= pageCount}
          onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <GhostBtn label="Zoom out" icon="zoomOut" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((n) => Math.max(ZOOM_MIN, n - 25))} />
        <p className="min-w-[40px] text-center text-[12px] text-muted">{zoom}%</p>
        <GhostBtn label="Zoom in" icon="zoomIn" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((n) => Math.min(ZOOM_MAX, n + 25))} />
      </div>
      <div ref={stageRef} className="min-h-0 flex-1 overflow-auto">
        <div className="flex justify-center px-3 pb-4">
          <MaterialPdfPage data={file.bytes} page={page} width={pageWidth || 320} onPageCount={onPageCount} />
        </div>
      </div>
    </div>
  );
}

function useResolvedPptxSlides(material: Material) {
  const fromDoc = useMemo(() => slidesFromMaterial(material), [material]);
  const originalName = originalStoredName(material);
  const docKey = fromDoc.map((slide) => slide.fileName).join("|");
  const [slides, setSlides] = useState<ViewerSlide[]>([]);
  const [ready, setReady] = useState(false);
  const listed = useRef(false);

  const applyListed = useCallback(async () => {
    if (listed.current) return;
    listed.current = true;
    const listing = await listMaterialFiles(material.projectId, material.id);
    const existing = (names: ViewerSlide[]) =>
      names.filter(
        (slide) =>
          Boolean(slide.fileName) &&
          !isMissingMaterialName(material.projectId, material.id, slide.fileName || ""),
      );
    if (listing.ok) {
      setSlides(existing(slidesFromListedNames(listing.names, originalName)));
    } else {
      setSlides(existing(fromDoc));
    }
    setReady(true);
  }, [fromDoc, material.projectId, material.id, originalName]);

  const dropUnconfirmed = useCallback((keep: Set<string>) => {
    setSlides((current) => {
      const next = current.filter((slide) => Boolean(slide.fileName) && keep.has(slide.fileName || ""));
      return next.length === current.length ? current : next;
    });
  }, []);

  useEffect(() => {
    listed.current = false;
    setReady(false);
    setSlides([]);
    void applyListed();
  }, [material.id, material.projectId, docKey, applyListed]);

  return { slides, ready, refreshFromStorage: applyListed, dropUnconfirmed };
}

function PptxStage({ material }: { material: Material }) {
  const { slides, ready, refreshFromStorage, dropUnconfirmed } = useResolvedPptxSlides(material);
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const extractedName = slides.length === 0 && ready ? extractedStoredName(material) : null;
  const extracted = useMaterialFile(material.projectId, material.id, extractedName);
  const texts = useMemo(() => {
    if (!extracted?.ok) return new Map<number, string>();
    return splitSlideText(new TextDecoder().decode(extracted.bytes));
  }, [extracted]);

  useEffect(() => {
    setIndex(0);
    setConfirmed(new Set());
  }, [material.id]);

  useEffect(() => {
    setIndex((n) => (slides.length === 0 ? 0 : Math.min(n, slides.length - 1)));
  }, [slides.length]);

  const current = slides[index] ?? slides[0];
  const currentName = current?.fileName ?? null;
  const slideFile = useMaterialFile(material.projectId, material.id, currentName);

  useEffect(() => {
    if (slideFile?.ok && currentName) {
      setConfirmed((prev) => {
        if (prev.has(currentName)) return prev;
        const next = new Set(prev);
        next.add(currentName);
        return next;
      });
    }
    if (slideFile && !slideFile.ok && slideFile.status === 404 && currentName) {
      dropUnconfirmed(confirmed);
      void refreshFromStorage();
    }
  }, [slideFile, currentName, refreshFromStorage, confirmed, dropUnconfirmed]);

  const neighbors = useMemo(() => {
    return [index - 1, index, index + 1]
      .map((i) => slides[i]?.fileName)
      .filter((name): name is string => typeof name === "string" && confirmed.has(name));
  }, [index, slides, confirmed]);

  useEffect(() => {
    for (const name of neighbors) {
      if (isMissingMaterialName(material.projectId, material.id, name)) continue;
      void getMaterialFile(material.projectId, material.id, name);
    }
  }, [neighbors, material.projectId, material.id]);

  if (!ready) return <FileMessage text="Loading…" />;

  if (slides.length === 0) {
    const text = textFallback(material, extracted);
    if (extracted && !extracted.ok && extracted.status === 401) return <FileMessage text="Sign in." />;
    if (!extracted && extractedName) return <FileMessage text="Loading…" />;
    return (
      <DocumentPaper>
        <p className="whitespace-pre-wrap">
          <LinkifiedText text={text || "No preview yet. Download to open in PowerPoint."} />
        </p>
      </DocumentPaper>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-1 px-2 py-1.5">
        <GhostBtn label="Previous slide" icon="prev" disabled={index <= 0} onClick={() => setIndex((n) => Math.max(0, n - 1))} />
        <p className="min-w-[72px] text-center text-[12px] text-muted">
          {index + 1} / {slides.length}
        </p>
        <GhostBtn
          label="Next slide"
          icon="forward"
          disabled={index >= slides.length - 1}
          onClick={() => setIndex((n) => Math.min(slides.length - 1, n + 1))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <SlideStage
          projectId={material.projectId}
          materialId={material.id}
          fileName={currentName}
          file={currentName ? slideFile : null}
          text={texts.get(current?.page ?? 0) || ""}
        />
      </div>
      {slides.length > 1 ? (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border px-2 py-2">
          {slides.map((slide, i) => (
            <button
              key={`${slide.page}-${slide.fileName || "text"}`}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${
                i === index ? "border-foreground" : "border-border"
              }`}
              aria-label={`Slide ${slide.page}`}
              aria-current={i === index ? "true" : undefined}
            >
              <FilmstripThumb
                projectId={material.projectId}
                materialId={material.id}
                fileName={slide.fileName}
                load={Boolean(slide.fileName && (i === index || confirmed.has(slide.fileName)))}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SlideStage({
  projectId,
  materialId,
  fileName,
  file,
  text,
}: {
  projectId: string;
  materialId: string;
  fileName: string | null;
  file: MaterialFileResult | null;
  text: string;
}) {
  if (!fileName) {
    return (
      <DocumentPaper>
        <p className="whitespace-pre-wrap">
          <LinkifiedText text={text || "No text on this slide."} />
        </p>
      </DocumentPaper>
    );
  }
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok) {
    return (
      <div className="flex h-full flex-col">
        <FileMessage text={file.status === 401 ? "Sign in." : "ფაილი ვერ მოიძებნა"} />
        {text ? (
          <DocumentPaper>
            <p className="whitespace-pre-wrap">
              <LinkifiedText text={text} />
            </p>
          </DocumentPaper>
        ) : null}
      </div>
    );
  }
  const url = materialFileObjectUrl(file, cacheKey(projectId, materialId, fileName));
  return <img src={url} alt="" className="mx-auto max-h-full max-w-full object-contain" />;
}

function FilmstripThumb({
  projectId,
  materialId,
  fileName,
  load,
}: {
  projectId: string;
  materialId: string;
  fileName: string | null;
  load: boolean;
}) {
  const skip = Boolean(fileName && isMissingMaterialName(projectId, materialId, fileName));
  const file = useMaterialFile(projectId, materialId, load && !skip ? fileName : null);
  if (!fileName) {
    return <span className="flex h-full items-center justify-center text-[10px] text-muted">Text</span>;
  }
  if (skip || (file && !file.ok)) {
    return <span className="flex h-full items-center justify-center text-[10px] text-muted">—</span>;
  }
  if (!load || !file) {
    return <span className="flex h-full items-center justify-center text-[10px] text-muted">—</span>;
  }
  const url = materialFileObjectUrl(file, cacheKey(projectId, materialId, fileName));
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function ImageStage({ material, originalName }: { material: Material; originalName: string | null }) {
  const name = originalName || slidesFromMaterial(material)[0]?.fileName || null;
  const file = useMaterialFile(material.projectId, material.id, name);
  if (!name) return <FileMessage text="ფაილი ვერ მოიძებნა" />;
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok) {
    return <FileMessage text={file.status === 401 ? "Sign in." : "ფაილი ვერ მოიძებნა"} />;
  }
  const url = materialFileObjectUrl(file, cacheKey(material.projectId, material.id, name));
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-3">
      <img src={url} alt={material.title} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function textFallback(material: Material, file: MaterialFileResult | null): string {
  if (file?.ok) return new TextDecoder().decode(file.bytes).trim();
  return material.extractedTextPreview?.trim() || "";
}

function TextStage({ material }: { material: Material }) {
  const name = extractedStoredName(material);
  const file = useMaterialFile(material.projectId, material.id, name);
  if (!file) return <FileMessage text="Loading…" />;
  if (!file.ok && file.status === 401) return <FileMessage text="Sign in." />;
  const text = textFallback(material, file);
  if (!file.ok && !text) return <FileMessage text="ფაილი ვერ მოიძებნა" />;
  return (
    <DocumentPaper>
      <p className="whitespace-pre-wrap">
        <LinkifiedText text={text || "No preview yet."} />
      </p>
    </DocumentPaper>
  );
}

function DocxStage({ material, originalName }: { material: Material; originalName: string | null }) {
  const cachedHtml = material.previewHtml?.trim() || "";
  const [html, setHtml] = useState(cachedHtml);
  const [failed, setFailed] = useState(false);
  const original = useMaterialFile(material.projectId, material.id, cachedHtml ? null : originalName);
  const extractedName = extractedStoredName(material);
  const extracted = useMaterialFile(material.projectId, material.id, html ? null : extractedName);

  useEffect(() => {
    if (cachedHtml) {
      setHtml(cachedHtml);
      return;
    }
    if (!originalName) {
      setFailed(true);
      return;
    }
    if (!original) return;
    if (!original.ok) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void docxBytesToHtml(original.bytes)
      .then((next) => {
        if (cancelled) return;
        if (!next.trim()) {
          setFailed(true);
          return;
        }
        setHtml(next);
        void patchMaterialPreviewHtml(material.projectId, material.id, next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cachedHtml, originalName, original, material.projectId, material.id]);

  if (html) return <DocumentPaper html={html} />;
  if (original && !original.ok && original.status === 401) return <FileMessage text="Sign in." />;
  if (!failed && originalName) return <FileMessage text="Loading…" />;

  const text = textFallback(material, extracted);
  if (!text && original && !original.ok) return <FileMessage text="ფაილი ვერ მოიძებნა" />;
  return (
    <DocumentPaper>
      <p className="whitespace-pre-wrap">
        <LinkifiedText text={text || "No preview yet."} />
      </p>
    </DocumentPaper>
  );
}
