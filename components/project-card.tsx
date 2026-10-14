import Link from "next/link";
import { shortDate } from "@/lib/format";
import { displayProjectTitle } from "@/lib/workspace/title";
import type { Project } from "@/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/p/${project.id}`}
      className="group flex min-h-[132px] flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border hover:bg-surface-2"
    >
      <h3 className="text-[15px] font-medium tracking-tight text-foreground">
        {displayProjectTitle(project.title)}
      </h3>
      <p className="mt-1 line-clamp-2 flex-1 text-sm leading-5 text-muted">
        {project.description || "No description"}
      </p>
      <div className="mt-4 text-[11px] text-muted">{shortDate(project.updatedAt || project.createdAt)}</div>
    </Link>
  );
}
