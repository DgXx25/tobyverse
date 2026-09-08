import type { FC, SVGProps } from "react";
import {
  ArrowLeft,
  Atom01,
  BarChart01,
  BookOpen01,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard01,
  Database01,
  DotsHorizontal,
  Download01,
  Edit01,
  File02,
  File06,
  Folder,
  HelpCircle,
  LayersTwo01,
  LayoutRight,
  List,
  LogOut01,
  Menu01,
  Moon01,
  Palette,
  Plus,
  SearchMd,
  Send01,
  Settings01,
  Sliders01,
  Sun,
  Share07,
  Trash01,
  User01,
  X,
  ZoomIn,
  ZoomOut,
} from "@untitledui/icons";

type UntitledIcon = FC<SVGProps<SVGSVGElement> & { color?: string; size?: number }>;

const ICONS = {
  share: Share07,
  panel: LayoutRight,
  close: X,
  materials: Folder,
  notes: File02,
  practice: Atom01,
  plus: Plus,
  menu: Menu01,
  back: ArrowLeft,
  forward: ChevronRight,
  prev: ChevronLeft,
  chevronDown: ChevronDown,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  more: DotsHorizontal,
  edit: Edit01,
  trash: Trash01,
  user: User01,
  settings: Settings01,
  sliders: Sliders01,
  sun: Sun,
  moon: Moon01,
  help: HelpCircle,
  billing: CreditCard01,
  logout: LogOut01,
  library: BookOpen01,
  search: SearchMd,
  send: Send01,
  appearance: Palette,
  usage: BarChart01,
  data: Database01,
  file: File06,
  plan: List,
  deck: LayersTwo01,
  download: Download01,
} as const satisfies Record<string, UntitledIcon>;

export type UiIconName = keyof typeof ICONS;

export function UiIcon({
  name,
  size = 18,
  strokeWidth = 1.5,
  className = "",
}: {
  name: UiIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = ICONS[name];
  return (
    <Icon
      size={size}
      color="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}
