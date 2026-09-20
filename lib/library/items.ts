import { listChatMessages } from "@/lib/chats";
import { formatBytes } from "@/lib/format";
import { listMaterials } from "@/lib/materials";
import { listProjectsForUser } from "@/lib/projects";
import { listStudySheets } from "@/lib/study-sheets";
import { listStudyPaths } from "@/lib/paths/store";
import { pathSubtitle, progressCounts } from "@/lib/paths/model";
import { displayProjectTitle } from "@/lib/workspace/title";
import { blockPreviewText } from "@/lib/visuals/validate";
import type { ChatArtifact } from "@/types/chat";
import type { MaterialImage, MaterialType } from "@/types/material";

export type LibraryKind = "material" | "sheet" | "practice" | "path";

export type LibraryItem = {
  key: string;
  kind: LibraryKind;
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  preview: string;
  meta: string;
  createdAt: string | null;
  artifact?: ChatArtifact;
  materialType?: MaterialType;
  sizeBytes?: number;
  pageCount?: number;
  hasImages?: boolean;
  images?: MaterialImage[];
  storagePath?: string;
};

export async function listLibraryItems(userId: string): Promise<LibraryItem[]> {
  const projects = await listProjectsForUser(userId);
  const groups = await Promise.all(
    projects.map(async (project) => {
      const [materials, sheets, messages, paths] = await Promise.all([
        listMaterials(project.id),
        listStudySheets(project.id),
        listChatMessages(project.id),
        listStudyPaths(project.id),
      ]);
      const projectTitle = displayProjectTitle(project.title);
      const items: LibraryItem[] = [];

      for (const item of materials) {
        items.push({
          key: `material:${project.id}:${item.id}`,
          kind: "material",
          id: item.id,
          projectId: project.id,
          projectTitle,
          title: item.title,
          preview: item.extractedTextPreview,
          meta: [item.type, formatBytes(item.sizeBytes)].filter(Boolean).join(" · "),
          createdAt: item.createdAt,
          materialType: item.type,
          sizeBytes: item.sizeBytes,
          pageCount: item.pageCount,
          hasImages: item.hasImages,
          images: item.images,
          storagePath: item.storagePath,
        });
      }

      for (const item of sheets) {
        items.push({
          key: `sheet:${project.id}:${item.id}`,
          kind: "sheet",
          id: item.id,
          projectId: project.id,
          projectTitle,
          title: item.title,
          preview: (
            blockPreviewText(item.blocks) ||
            item.prose ||
            item.content
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160),
          meta: "Notes",
          createdAt: item.createdAt,
          artifact: { kind: item.title === "Study plan" ? "plan" : "sheet", id: item.id, title: item.title },
        });
      }

      for (const item of paths) {
        const { done, total } = progressCounts(item.courses);
        items.push({
          key: `path:${project.id}:${item.id}`,
          kind: "path",
          id: item.id,
          projectId: project.id,
          projectTitle,
          title: item.title,
          preview: pathSubtitle(item),
          meta: `${done}/${total} topics`,
          createdAt: item.updatedAt ?? item.createdAt,
          artifact: { kind: "path", id: item.id, title: item.title, count: total },
        });
      }

      const seen = new Set<string>();
      for (const message of [...messages].reverse()) {
        const artifact = message.artifact;
        if (!artifact || artifact.kind !== "practice" || seen.has(artifact.id)) continue;
        seen.add(artifact.id);
        const count = artifact.count ?? artifact.ids?.length ?? 0;
        items.push({
          key: `practice:${project.id}:${artifact.id}`,
          kind: "practice",
          id: artifact.id,
          projectId: project.id,
          projectTitle,
          title: `Practice set · ${count} items`,
          preview: "",
          meta: "Practice",
          createdAt: message.createdAt,
          artifact,
        });
      }

      return items;
    }),
  );

  return groups.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
