/**
 * outline_create tool -- Create a new wiki document.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { createDocument } from "../clients/outline-client.ts";
import { formatDocumentSaved } from "../formatting/formatters.ts";

export const OutlineCreateTool = {
  name: "outline_create",
  label: "Outline Create Document",
  description:
    "Create a new document in the Outline wiki from markdown. Give either a collectionId (top level of that collection) or a parentDocumentId (nested under an existing page). Search first -- updating an existing page is usually better than adding a near-duplicate.",
  parameters: Type.Object({
    title: Type.String({ description: "Document title. Keep it specific and searchable." }),
    text: Type.Optional(
      Type.String({
        description:
          "Markdown body. Do not repeat the title as a top-level heading; Outline renders the title separately.",
      }),
    ),
    collectionId: Type.Optional(
      Type.String({
        description: "Collection to create the document in. Required unless parentDocumentId is given.",
      }),
    ),
    parentDocumentId: Type.Optional(
      Type.String({ description: "Create the document as a child of this document." }),
    ),
    templateId: Type.Optional(
      Type.String({ description: "Create the document from this template." }),
    ),
    icon: Type.Optional(
      Type.String({ description: "Emoji or icon name shown next to the title." }),
    ),
    publish: Type.Optional(
      Type.Boolean({
        description:
          "Publish immediately so others can see it. Default true. Set false to keep it as a personal draft.",
        default: true,
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      title: string;
      text?: string;
      collectionId?: string;
      parentDocumentId?: string;
      templateId?: string;
      icon?: string;
      publish?: boolean;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (!params.title || !params.title.trim()) {
      throw new Error("title must not be empty.");
    }
    const publish = params.publish ?? true;
    if (publish && !params.collectionId && !params.parentDocumentId) {
      throw new Error(
        "A published document needs a collectionId or a parentDocumentId. List collections with outline_collections, or pass publish: false to create a draft.",
      );
    }

    const config = resolveConfig(params.profile);
    const doc = await createDocument(
      config,
      {
        title: params.title.trim(),
        text: params.text ?? "",
        collectionId: params.collectionId,
        parentDocumentId: params.parentDocumentId,
        templateId: params.templateId,
        icon: params.icon,
        publish,
      },
      signal,
    );

    return {
      content: [{ type: "text" as const, text: formatDocumentSaved(doc, "created") }],
      details: {
        id: doc.id,
        title: doc.title,
        url: doc.url,
        collectionId: doc.collectionId,
        published: Boolean(doc.publishedAt),
      },
    };
  },
};
