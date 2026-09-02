/**
 * outline_export tool -- Save wiki documents to local markdown files.
 *
 * The point is to get wiki knowledge into the repository the agent is working
 * in (docs/, ADRs, onboarding notes) without copying text through the model.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import {
  exportDocument,
  getCollectionStructure,
  getDocument,
  slugifyTitle,
  writeMarkdownFile,
} from "../clients/outline-client.ts";
import type { NavigationNode } from "../types.ts";

function flatten(nodes: ReadonlyArray<NavigationNode>, out: NavigationNode[] = []): NavigationNode[] {
  for (const node of nodes) {
    out.push(node);
    flatten(node.children, out);
  }
  return out;
}

export const OutlineExportTool = {
  name: "outline_export",
  label: "Outline Export to Files",
  description:
    "Export one document (optionally with its children) or a whole collection to local markdown files. Use it to pull wiki content into a repository instead of reading every page through the model.",
  parameters: Type.Object({
    targetDir: Type.String({
      description: "Directory to write the .md files into. Absolute paths are safest.",
    }),
    documentId: Type.Optional(
      Type.String({ description: "Document to export. Mutually exclusive with collectionId." }),
    ),
    collectionId: Type.Optional(
      Type.String({ description: "Export every document of this collection." }),
    ),
    includeChildren: Type.Optional(
      Type.Boolean({
        description: "With documentId: also export nested child documents. Default false.",
        default: false,
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum number of documents to write. Default 50.",
        default: 50,
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      targetDir: string;
      documentId?: string;
      collectionId?: string;
      includeChildren?: boolean;
      limit?: number;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (!params.documentId && !params.collectionId) {
      throw new Error("Pass either documentId or collectionId.");
    }
    if (params.documentId && params.collectionId) {
      throw new Error("Pass documentId or collectionId, not both.");
    }

    const config = resolveConfig(params.profile);
    const limit = params.limit ?? 50;
    const targets: Array<{ id: string; title: string }> = [];

    if (params.collectionId) {
      const tree = await getCollectionStructure(config, params.collectionId, signal);
      for (const node of flatten(tree)) {
        targets.push({ id: node.id, title: node.title });
      }
    } else {
      const doc = await getDocument(config, params.documentId!, signal);
      targets.push({ id: doc.id, title: doc.title });
      if (params.includeChildren && doc.collectionId) {
        const tree = await getCollectionStructure(config, doc.collectionId, signal);
        const self = flatten(tree).find((node) => node.id === doc.id);
        if (self) {
          for (const child of flatten(self.children)) {
            targets.push({ id: child.id, title: child.title });
          }
        }
      }
    }

    const capped = targets.slice(0, limit);
    const written: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const usedNames = new Set<string>();

    for (const target of capped) {
      try {
        const markdown = await exportDocument(config, target.id, signal);
        let stem = slugifyTitle(target.title);
        // Wikis are full of pages called "Overview"; keep every file.
        if (usedNames.has(stem)) stem = `${stem}-${target.id.slice(0, 8)}`;
        usedNames.add(stem);
        written.push(writeMarkdownFile(params.targetDir, `${stem}.md`, markdown));
      } catch (err) {
        failed.push({ id: target.id, error: (err as Error).message });
      }
    }

    const lines = [
      `Exported ${written.length} document(s) to ${params.targetDir}:`,
      ...written.map((file) => `- ${file}`),
    ];
    if (targets.length > capped.length) {
      lines.push(
        `\n${targets.length - capped.length} more document(s) not exported (limit ${limit}).`,
      );
    }
    if (failed.length > 0) {
      lines.push(
        `\n${failed.length} document(s) failed:`,
        ...failed.map((f) => `- ${f.id}: ${f.error}`),
      );
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: {
        targetDir: params.targetDir,
        written,
        writtenCount: written.length,
        failedCount: failed.length,
        skipped: targets.length - capped.length,
      },
    };
  },
};
