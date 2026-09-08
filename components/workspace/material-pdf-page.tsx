"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ViewerBoundary } from "@/components/workspace/viewer-boundary";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function MaterialPdfPage({
  data,
  page,
  width,
  onPageCount,
}: {
  data: ArrayBuffer;
  page: number;
  width: number;
  onPageCount: (count: number) => void;
}) {
  const [file, setFile] = useState<Blob | null>(null);

  useEffect(() => {
    const copy = data.slice(0);
    setFile(new Blob([copy], { type: "application/pdf" }));
  }, [data]);

  if (!file || width < 80) {
    return <p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>;
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  return (
    <ViewerBoundary>
      <Document
        file={file}
        loading={<p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>}
        error={<p className="px-4 py-8 text-center text-[13px] text-muted">ფაილი ვერ მოიძებნა</p>}
        onLoadSuccess={(info) => {
          const count = info && typeof info.numPages === "number" ? info.numPages : 1;
          onPageCount(Math.max(1, count));
        }}
        onLoadError={() => onPageCount(1)}
      >
        <Page
          pageNumber={safePage}
          width={width}
          renderAnnotationLayer={false}
          renderTextLayer
          onRenderError={() => undefined}
          onGetTextError={() => undefined}
          onGetAnnotationsError={() => undefined}
        />
      </Document>
    </ViewerBoundary>
  );
}

export default MaterialPdfPage;
