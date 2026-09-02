/**
 * outline_move tool -- Re-file a document within the wiki.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { getDocument, moveDocument } from "../clients/outline-client.ts";

export const OutlineMoveTool = {
  name: "outline_move",
  label: "Outline Move Document",
  description:
    "Move a document into another collection or under another parent document. Child documents move with it. Pass toTopLevel to lift a nested document to the root of its collection.",
  parameters: Type.Object({
    id: Type.String({ description: "Document id to move." }),
    collectionId: Type.Optional(
      Type.String({ description: "Target collection id." }),
    ),
    parentDocumentId: Type.Optional(
      Type.String({ description: "Target parent document id (nests the document under it)." }),
    ),
    toTopLevel: Type.Optional(
      Type.Boolean({
        description: "Detach from the current parent and place at the collection root.",
        default: false,
      }),
    ),
    index: Type.Optional(
      Type.Number({ description: "Position among its new siblings (0 = first)." }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      id: string;
      collectionId?: string;
      parentDocumentId?: string;
      toTopLevel?: boolean;
      index?: number;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (!params.collectionId && !params.parentDocumentId && !params.toTopLevel) {
      throw new Error(
        "Specify a target: collectionId, parentDocumentId, or toTopLevel: true.",
      );
    }
    if (params.parentDocumentId && params.toTopLevel) {
      throw new Error("parentDocumentId and toTopLevel contradict each other.");
    }

    const config = resolveConfig(params.profile);

    // documents.move needs a collection when the parent is cleared, so fall
    // back to the document's current one.
    let collectionId = params.collectionId;
    if (!collectionId && params.toTopLevel) {
      const current = await getDocument(config, params.id, signal);
      collectionId = current.collectionId ?? undefined;
    }

    const { documentCount } = await moveDocument(
      config,
      {
        id: params.id,
        collectionId,
        parentDocumentId: params.toTopLevel ? null : params.parentDocumentId,
        index: params.index,
      },
      signal,
    );

    const target = params.toTopLevel
      ? `the root of collection ${collectionId}`
      : params.parentDocumentId
        ? `under document ${params.parentDocumentId}`
        : `collection ${collectionId}`;

    return {
      content: [
        {
          type: "text" as const,
          text: `Moved document ${params.id} to ${target}. ${documentCount} document(s) affected.`,
        },
      ],
      details: {
        id: params.id,
        collectionId,
        parentDocumentId: params.toTopLevel ? null : params.parentDocumentId,
        documentCount,
      },
    };
  },
};
