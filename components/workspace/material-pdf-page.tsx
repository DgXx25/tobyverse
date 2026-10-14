"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ViewerBoundary } from "@/components/workspace/viewer-boundary";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function MaterialPdfPage({
  data,
  pageCount,
  width,
  onPageCount,
}: {
  data: ArrayBuffer;
  page?: number;
  pageCount?: number;
  width: number;
  onPageCount: (count: number) => void;
}) {
  const [file, setFile] = useState<Blob | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const copy = data.slice(0);
    setFile(new Blob([copy], { type: "application/pdf" }));
  }, [data]);

  if (!file || width < 80) {
    return <p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>;
  }

  return (
    <ViewerBoundary>
      <Document
        file={file}
        loading={<p className="px-4 py-8 text-center text-[13px] text-muted">Loading…</p>}
        error={<p className="px-4 py-8 text-center text-[13px] text-muted">File not found.</p>}
        onLoadSuccess={(info) => {
          const count = info && typeof info.numPages === "number" ? info.numPages : 1;
          onPageCount(Math.max(1, count));
        }}
        onLoadError={() => onPageCount(1)}
      >
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: Math.max(1, pageCount ?? 1) }, (_, index) => index + 1).map((pageNumber) => (
            <div
              key={pageNumber}
              ref={(node) => { pageRefs.current[pageNumber] = node; }}
              data-pdf-page={pageNumber}
              className="mx-auto"
            >
              <Page
                pageNumber={pageNumber}
                width={width}
                renderAnnotationLayer={false}
                renderTextLayer
                onRenderError={() => undefined}
                onGetTextError={() => undefined}
                onGetAnnotationsError={() => undefined}
              />
            </div>
          ))}
        </div>
      </Document>
    </ViewerBoundary>
  );
}

export default MaterialPdfPage;
