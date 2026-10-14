"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import Csv01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Csv01Icon.js";
import Doc01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Doc01Icon.js";
import File01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/File01Icon.js";
import FileSpreadsheetIcon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/FileSpreadsheetIcon.js";
import Image01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Image01Icon.js";
import Notebook01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Notebook01Icon.js";
import Pdf01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Pdf01Icon.js";
import Ppt01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Ppt01Icon.js";
import Txt01Icon from "../../node_modules/@hugeicons/core-free-icons/dist/esm/Txt01Icon.js";
import type { IconSvgElement } from "@hugeicons/react";
import type { LibraryFileKind } from "@/lib/library/media";

const ICONS: Record<LibraryFileKind, IconSvgElement> = {
  pdf: Pdf01Icon,
  doc: Doc01Icon,
  docx: Doc01Icon,
  csv: Csv01Icon,
  excel: FileSpreadsheetIcon,
  ppt: Ppt01Icon,
  pptx: Ppt01Icon,
  jpg: Image01Icon,
  png: Image01Icon,
  txt: Txt01Icon,
  md: File01Icon,
  notes: Notebook01Icon,
  other: File01Icon,
};

const LABELS: Record<LibraryFileKind, string> = {
  pdf: "PDF",
  doc: "Word document",
  docx: "Word document",
  csv: "CSV spreadsheet",
  excel: "Spreadsheet",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
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
