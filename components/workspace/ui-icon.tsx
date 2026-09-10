"use client";

import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { AtomIcon } from "@phosphor-icons/react/dist/csr/Atom";
import { BoneIcon } from "@phosphor-icons/react/dist/csr/Bone";
import { BookOpenIcon } from "@phosphor-icons/react/dist/csr/BookOpen";
import { BrainIcon } from "@phosphor-icons/react/dist/csr/Brain";
import { BugIcon } from "@phosphor-icons/react/dist/csr/Bug";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { DatabaseIcon } from "@phosphor-icons/react/dist/csr/Database";
import { DnaIcon } from "@phosphor-icons/react/dist/csr/Dna";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { DropIcon } from "@phosphor-icons/react/dist/csr/Drop";
import { FileIcon } from "@phosphor-icons/react/dist/csr/File";
import { FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { FlameIcon } from "@phosphor-icons/react/dist/csr/Flame";
import { FlaskIcon } from "@phosphor-icons/react/dist/csr/Flask";
import { FolderIcon } from "@phosphor-icons/react/dist/csr/Folder";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { HeartIcon } from "@phosphor-icons/react/dist/csr/Heart";
import { HexagonIcon } from "@phosphor-icons/react/dist/csr/Hexagon";
import { LeafIcon } from "@phosphor-icons/react/dist/csr/Leaf";
import { LightningIcon } from "@phosphor-icons/react/dist/csr/Lightning";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/csr/ListBullets";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MagnifyingGlassMinusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import { MagnifyingGlassPlusIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlassPlus";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { MountainsIcon } from "@phosphor-icons/react/dist/csr/Mountains";
import { NoteIcon } from "@phosphor-icons/react/dist/csr/Note";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PillIcon } from "@phosphor-icons/react/dist/csr/Pill";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { PulseIcon } from "@phosphor-icons/react/dist/csr/Pulse";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { ShieldIcon } from "@phosphor-icons/react/dist/csr/Shield";
import { SidebarSimpleIcon } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { UserIcon } from "@phosphor-icons/react/dist/csr/User";
import { VirusIcon } from "@phosphor-icons/react/dist/csr/Virus";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { WindIcon } from "@phosphor-icons/react/dist/csr/Wind";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

const ICONS = {
  share: ShareNetworkIcon,
  panel: SidebarSimpleIcon,
  close: XIcon,
  materials: FolderIcon,
  notes: NoteIcon,
  practice: AtomIcon,
  spark: SparkleIcon,
  plus: PlusIcon,
  menu: ListIcon,
  back: ArrowLeftIcon,
  forward: CaretRightIcon,
  prev: CaretLeftIcon,
  chevronDown: CaretDownIcon,
  zoomIn: MagnifyingGlassPlusIcon,
  zoomOut: MagnifyingGlassMinusIcon,
  more: DotsThreeIcon,
  edit: PencilSimpleIcon,
  trash: TrashIcon,
  user: UserIcon,
  settings: GearIcon,
  sliders: SlidersHorizontalIcon,
  sun: SunIcon,
  moon: MoonIcon,
  help: QuestionIcon,
  billing: CreditCardIcon,
  logout: SignOutIcon,
  library: BookOpenIcon,
  search: MagnifyingGlassIcon,
  send: ArrowUpIcon,
  appearance: PaletteIcon,
  usage: ChartBarIcon,
  data: DatabaseIcon,
  file: FileIcon,
  plan: ListBulletsIcon,
  deck: StackIcon,
  download: DownloadSimpleIcon,
  activity: PulseIcon,
  apple: LeafIcon,
  arrow: ArrowRightIcon,
  atom: AtomIcon,
  bone: BoneIcon,
  book: BookOpenIcon,
  brain: BrainIcon,
  bug: BugIcon,
  cell: HexagonIcon,
  check: CheckIcon,
  dna: DnaIcon,
  droplet: DropIcon,
  flag: FlagIcon,
  flame: FlameIcon,
  flask: FlaskIcon,
  globe: GlobeIcon,
  heart: HeartIcon,
  leaf: LeafIcon,
  lungs: WindIcon,
  mountain: MountainsIcon,
  pill: PillIcon,
  shield: ShieldIcon,
  star: StarIcon,
  virus: VirusIcon,
  warning: WarningIcon,
  wind: WindIcon,
  x: XIcon,
  zap: LightningIcon,
} as const satisfies Record<string, Icon>;

export type UiIconName = keyof typeof ICONS;

export const CATALOG_ICON_IDS = [
  "activity",
  "apple",
  "arrow",
  "atom",
  "bone",
  "book",
  "brain",
  "bug",
  "cell",
  "check",
  "dna",
  "droplet",
  "flag",
  "flame",
  "flask",
  "globe",
  "heart",
  "leaf",
  "lungs",
  "moon",
  "mountain",
  "pill",
  "shield",
  "star",
  "sun",
  "virus",
  "warning",
  "user",
  "wind",
  "x",
  "zap",
] as const satisfies readonly UiIconName[];

const ALIASES: Record<string, UiIconName> = {
  atom01: "atom",
  barchart01: "usage",
  barbell: "practice",
  bookopen: "book",
  bookopen01: "library",
  creditcard: "billing",
  creditcard01: "billing",
  database01: "data",
  dotshorizontal: "more",
  download01: "download",
  drop: "droplet",
  dumbbell: "practice",
  edit01: "edit",
  file02: "notes",
  file06: "file",
  filetext: "notes",
  flaskconical: "flask",
  folder: "materials",
  heartbeat: "activity",
  helpcircle: "help",
  layerstwo01: "deck",
  layoutright: "panel",
  lightning: "zap",
  list: "plan",
  logout01: "logout",
  memory: "brain",
  moon01: "moon",
  mountains: "mountain",
  note: "notes",
  notebook: "notes",
  notepad: "notes",
  pulse: "activity",
  searchmd: "search",
  send01: "send",
  settings01: "settings",
  share07: "share",
  signout: "logout",
  sliders01: "sliders",
  sparkle: "spark",
  trash01: "trash",
  trianglealert: "warning",
  user01: "user",
};

function normalizeIconKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function resolveUiIconName(name?: string | null): UiIconName | null {
  if (!name) return null;
  const key = normalizeIconKey(name);
  if (key in ICONS) return key as UiIconName;
  return ALIASES[key] ?? null;
}

export function UiIcon({
  name,
  size = 18,
  className = "",
}: {
  name: UiIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return (
    <Icon
      size={size}
      color="currentColor"
      weight="regular"
      className={className}
      aria-hidden="true"
    />
  );
}
