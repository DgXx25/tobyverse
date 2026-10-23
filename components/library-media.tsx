"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FileKindIcon } from "@/components/workspace/file-kind-icon";
import { libraryFileKind, libraryThumbTarget } from "@/lib/library/media";
import type { LibraryItem } from "@/lib/library/items";
import { cacheKey, getMaterialFile, materialFileObjectUrl, type MaterialFileResult } from "@/lib/materials/file-client";

const MaterialPdfPage = dynamic(() => import("@/components/workspace/material-pdf-page"), { ssr: false });

function IconFallback({ item }: { item: LibraryItem }) {
  return <FileKindIcon kind={libraryFileKind(item)} size={52} className={item.materialType === "paste" ? "artifact-panel-paste-icon" : ""} />;
}

export function LibraryCardThumb({ item }: { item: LibraryItem }) {
  const target = useMemo(() => libraryThumbTarget(item), [item]);
  const [state, setState] = useState<{ key: string; file: MaterialFileResult } | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const thumbRef = useRef<HTMLDivElement>(null);
  const key = target ? cacheKey(item.projectId, item.id, target.name) : "";

  useEffect(() => {
    const node = thumbRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "100px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target || !nearViewport) { setState(null); return; }
    let cancelled = false;
    setState(null);
    void getMaterialFile(item.projectId, item.id, target.name).then((file) => {
      if (!cancelled) setState({ key, file });
    });
    return () => { cancelled = true; };
  }, [item.id, item.projectId, key, nearViewport, target]);

  const file = state?.key === key ? state.file : null;
  let preview = <IconFallback item={item} />;
  if (target && file?.ok && target.mode === "image") {
    const url = materialFileObjectUrl(file, key);
    preview = <img src={url} alt="" loading="lazy" decoding="async" className={`h-full w-full ${item.materialType === "image" ? "object-cover" : "object-contain"}`} />;
  } else if (target && file?.ok && target.mode === "pdf") {
    preview = <LibraryPdfThumb data={file.bytes} />;
  }

  return <div ref={thumbRef} className="flex h-full w-full items-center justify-center">{preview}</div>;
}

function LibraryPdfThumb({ data }: { data: ArrayBuffer }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="pointer-events-none h-full w-full overflow-hidden bg-white">
    <MaterialPdfPage data={data} page={1} width={width || 220} onPageCount={() => undefined} />
  </div>;
}
