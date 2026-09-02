/**
 * outline_archive tool -- Archive, restore or unpublish a document.
 *
 * Archiving is the reversible way to retire a wiki page: it disappears from
 * the collection but stays searchable in the archive.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { documentLifecycle } from "../clients/outline-client.ts";

const ACTIONS: Record<string, "archive" | "restore" | "unpublish"> = {
  archive: "archive",
  restore: "restore",
  unarchive: "restore",
  unpublish: "unpublish",
};

export const OutlineArchiveTool = {
  name: "outline_archive",
  label: "Outline Archive Document",
  description:
    "Archive a document (reversible, keeps it out of the collection), restore an archived or trashed document, or unpublish a document back into a draft. Use outline_delete only when the page should really go away.",
  parameters: Type.Object({
    id: Type.String({ description: "Document id." }),
    action: Type.Optional(
      Type.String({
        description: "One of: archive (default), restore, unpublish.",
        default: "archive",
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { id: string; action?: string; profile?: string },
    signal: AbortSignal,
  ) {
    const requested = (params.action ?? "archive").toLowerCase();
    const action = ACTIONS[requested];
    if (!action) {
      throw new Error(
        `Unknown action "${params.action}". Use archive, restore or unpublish.`,
      );
    }

    const config = resolveConfig(params.profile);
    const doc = await documentLifecycle(config, action, { id: params.id }, signal);

    const done =
      action === "archive"
        ? "archived"
        : action === "restore"
          ? "restored"
          : "unpublished (now a draft)";

    return {
      content: [
        {
          type: "text" as const,
          text: `Document ${doc?.title ?? params.id} ${done}.\nId: ${doc?.id ?? params.id}`,
        },
      ],
      details: { id: doc?.id ?? params.id, action, title: doc?.title },
    };
  },
};
