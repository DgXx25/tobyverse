"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import File01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/File01Icon.js";
import FileImageIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/FileImageIcon.js";
import GalleryVerticalIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/GalleryVerticalIcon.js";
import GoogleDocIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/GoogleDocIcon.js";
import GoogleSheetIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/GoogleSheetIcon.js";
import Notebook01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Notebook01Icon.js";
import NotepadTextIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/NotepadTextIcon.js";
import type { IconSvgElement } from "@hugeicons/react";
import type { LibraryFileKind } from "@/lib/library/media";

const ICONS: Record<Exclude<LibraryFileKind, "pdf">, IconSvgElement> = {
  doc: GoogleDocIcon,
  docx: GoogleDocIcon,
  csv: GoogleSheetIcon,
  excel: GoogleSheetIcon,
  ppt: GalleryVerticalIcon,
  pptx: GalleryVerticalIcon,
  jpg: FileImageIcon,
  png: FileImageIcon,
  txt: NotepadTextIcon,
  md: File01Icon,
  notes: Notebook01Icon,
  other: File01Icon,
};

const LABELS: Record<LibraryFileKind, string> = {
  pdf: "PDF",
  doc: "Google Docs or Word document",
  docx: "Google Docs or Word document",
  csv: "Google Sheets or CSV spreadsheet",
  excel: "Google Sheets spreadsheet",
  ppt: "Slides",
  pptx: "Slides",
  jpg: "JPG image",
  png: "PNG image",
  txt: "Text",
  md: "Markdown",
  notes: "Notes",
  other: "File",
};

const TINTS: Record<LibraryFileKind, string> = {
  pdf: "file-kind-pdf",
  doc: "file-kind-doc",
  docx: "file-kind-docx",
  csv: "file-kind-csv",
  excel: "file-kind-excel",
  ppt: "file-kind-ppt",
  pptx: "file-kind-pptx",
  jpg: "file-kind-plain",
  png: "file-kind-plain",
  txt: "file-kind-plain",
  md: "file-kind-plain",
  notes: "file-kind-notes",
  other: "file-kind-plain",
};

export function FileKindIcon({ kind, size = 48, className = "" }: {
  kind: LibraryFileKind;
  size?: number;
  className?: string;
}) {
  if (kind === "pdf") {
    return (
      <span
        role="img"
        aria-label={LABELS.pdf}
        className={`inline-block shrink-0 ${TINTS.pdf} ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: "currentColor",
          maskImage: "url('/icons/Materials/pdf.svg')",
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: "url('/icons/Materials/pdf.svg')",
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
        }}
      />
    );
  }

  return (
    <HugeiconsIcon
      icon={ICONS[kind]}
      size={size}
      color="currentColor"
      strokeWidth={1.75}
      className={`inline-block shrink-0 ${TINTS[kind]} ${className}`}
      aria-label={LABELS[kind]}
    />
  );
}
