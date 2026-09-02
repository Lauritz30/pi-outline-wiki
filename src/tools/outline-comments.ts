/**
 * outline_comments tool -- Read the discussion on a document.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { listComments } from "../clients/outline-client.ts";
import { formatComments } from "../formatting/formatters.ts";

export const OutlineCommentsTool = {
  name: "outline_comments",
  label: "Outline Read Comments",
  description:
    "Read the comment threads on a document, nested by reply. Useful for open questions and review feedback that never made it into the page body.",
  parameters: Type.Object({
    documentId: Type.String({ description: "Document id." }),
    limit: Type.Optional(
      Type.Number({ description: "How many comments to return. Default 50.", default: 50 }),
    ),
    offset: Type.Optional(
      Type.Number({ description: "Pagination offset. Default 0.", default: 0 }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { documentId: string; limit?: number; offset?: number; profile?: string },
    signal: AbortSignal,
  ) {
    const config = resolveConfig(params.profile);
    const { comments, pagination } = await listComments(
      config,
      { documentId: params.documentId, limit: params.limit, offset: params.offset },
      signal,
    );

    return {
      content: [
        { type: "text" as const, text: formatComments(comments, params.documentId) },
      ],
      details: {
        documentId: params.documentId,
        count: comments.length,
        unresolved: comments.filter((c) => !c.resolvedAt).length,
        pagination,
      },
    };
  },
};
