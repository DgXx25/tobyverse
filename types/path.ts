import type { EntityId, IsoDateString } from "@/types/common";

export const PATH_NODE_STATUSES = ["todo", "current", "ready", "done"] as const;
export type PathNodeStatus = (typeof PATH_NODE_STATUSES)[number];

export const PATH_KINDS = ["course", "review"] as const;
export type PathKind = (typeof PATH_KINDS)[number];

export type PathNode = {
  id: string;
  title: string;
  /** Short tutor brief. Student sees `title`; chat uses this to know what to teach. */
  teach: string;
  /** Legacy short line. Prefer `teach`. */
  outcome: string;
  status: PathNodeStatus;
  /** Optional student-facing why this node is next / matters. */
  why?: string;
  practiceSetId?: string | null;
  sheetId?: string | null;
};

export type PathUnit = {
  id: string;
  title: string;
  nodes: PathNode[];
};

export type PathCourse = {
  id: string;
  title: string;
  units: PathUnit[];
};

export type StudyPath = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  title: string;
  kind?: PathKind;
  courses: PathCourse[];
  currentCourseId: string;
  currentNodeId: string;
  /** False until the student confirms Continue. Missing on old paths = already started. */
  started: boolean;
  /** Child chat that teaches this path. Parent / main stays free. */
  threadId?: string | null;
  sourceMaterialIds: string[];
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type PathLiveState = {
  title: string;
  courses: PathCourse[];
  status: string | null;
  pathId?: string;
};

export type PathBriefing = {
  title: string;
  courseTitle: string;
  nodeTitle: string;
  teach: string;
  outcome: string;
  done: number;
  total: number;
  courseCount: number;
  started: boolean;
  kind?: PathKind;
  nodeStatus?: PathNodeStatus;
  nextTitle?: string;
  why?: string;
  inPathThread?: boolean;
};
