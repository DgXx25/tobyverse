import { formatBytes } from "@/lib/format";
import { originalLibraryMaterials } from "@/lib/library/originals";
import { listMaterials } from "@/lib/materials";
import { listProjectsForUser } from "@/lib/projects";
import { listStudySheets } from "@/lib/study-sheets";
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
  previewPagePath?: string;
};

export async function listLibraryItems(userId: string): Promise<LibraryItem[]> {
  const projects = await listProjectsForUser(userId);
  const groups = await Promise.all(
    projects.map(async (project) => {
      const [materials, sheets] = await Promise.all([
        listMaterials(project.id),
        listStudySheets(project.id),
      ]);
      const projectTitle = displayProjectTitle(project.title);
      const items: LibraryItem[] = [];

      for (const item of originalLibraryMaterials(materials)) {
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
          previewPagePath: item.previewPagePath,
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

      return items;
    }),
  );

  return groups.flat().sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
