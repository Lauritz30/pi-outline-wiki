/**
 * outline_delete tool -- Move a document to the trash, or erase it.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { documentLifecycle, getDocument } from "../clients/outline-client.ts";

export const OutlineDeleteTool = {
  name: "outline_delete",
  label: "Outline Delete Document",
  description:
    "Move a document to the Outline trash, where it can be restored with outline_archive action 'restore'. With permanent: true it is erased and cannot be recovered -- only do that when explicitly asked. Prefer archiving over deleting.",
  parameters: Type.Object({
    id: Type.String({ description: "Document id." }),
    permanent: Type.Optional(
      Type.Boolean({
        description:
          "Erase the document instead of moving it to the trash. Irreversible. Default false.",
        default: false,
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { id: string; permanent?: boolean; profile?: string },
    signal: AbortSignal,
  ) {
    const config = resolveConfig(params.profile);

    // Resolve the title before deletion so the confirmation names the page
    // rather than a bare uuid.
    let title = params.id;
    try {
      title = (await getDocument(config, params.id, signal)).title;
    } catch {
      /* the delete call below reports a real failure */
    }

    await documentLifecycle(
      config,
      "delete",
      { id: params.id, permanent: params.permanent },
      signal,
    );

    const text = params.permanent
      ? `Permanently deleted "${title}" (${params.id}). This cannot be undone.`
      : `Moved "${title}" (${params.id}) to the trash. Restore it with outline_archive action "restore".`;

    return {
      content: [{ type: "text" as const, text }],
      details: { id: params.id, title, permanent: Boolean(params.permanent) },
    };
  },
};
