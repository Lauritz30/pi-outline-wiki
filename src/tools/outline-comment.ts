/**
 * outline_comment tool -- Post a comment or a reply on a document.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { createComment } from "../clients/outline-client.ts";

export const OutlineCommentTool = {
  name: "outline_comment",
  label: "Outline Post Comment",
  description:
    "Post a comment on a document, or reply to an existing comment thread. Use this to leave a question or a note for the humans who own the page instead of editing it silently.",
  parameters: Type.Object({
    documentId: Type.String({ description: "Document id to comment on." }),
    text: Type.String({ description: "Comment text." }),
    parentCommentId: Type.Optional(
      Type.String({ description: "Reply inside this comment thread." }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      documentId: string;
      text: string;
      parentCommentId?: string;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (!params.text || !params.text.trim()) {
      throw new Error("text must not be empty.");
    }

    const config = resolveConfig(params.profile);
    const comment = await createComment(
      config,
      {
        documentId: params.documentId,
        text: params.text.trim(),
        parentCommentId: params.parentCommentId,
      },
      signal,
    );

    const kind = params.parentCommentId ? "Reply" : "Comment";
    return {
      content: [
        {
          type: "text" as const,
          text: `${kind} posted on document ${params.documentId}.\nComment id: ${comment.id}`,
        },
      ],
      details: {
        id: comment.id,
        documentId: params.documentId,
        parentCommentId: params.parentCommentId ?? null,
      },
    };
  },
};
