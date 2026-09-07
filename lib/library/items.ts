import { listChatMessages } from "@/lib/chats";
import { formatBytes } from "@/lib/format";
import { listMaterials } from "@/lib/materials";
import { listProjectsForUser } from "@/lib/projects";
import { listStudySheets } from "@/lib/study-sheets";
import { displayProjectTitle } from "@/lib/workspace/title";
import { blockPreviewText } from "@/lib/visuals/validate";
import type { ChatArtifact } from "@/types/chat";

export type LibraryKind = "material" | "sheet" | "practice";

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
};

export async function listLibraryItems(userId: string): Promise<LibraryItem[]> {
  const projects = await listProjectsForUser(userId);
  const groups = await Promise.all(
    projects.map(async (project) => {
      const [materials, sheets, messages] = await Promise.all([
        listMaterials(project.id),
        listStudySheets(project.id),
        listChatMessages(project.id),
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
