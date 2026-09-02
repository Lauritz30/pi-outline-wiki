/**
 * outline_list tool -- Browse documents without searching.
 *
 * Useful for "what changed recently", "what is in this collection" and
 * "what are my unpublished drafts".
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { listDocuments } from "../clients/outline-client.ts";
import { formatDocumentList } from "../formatting/formatters.ts";

const VALID_SORT = new Set(["updatedAt", "createdAt", "title", "index"]);

export const OutlineListTool = {
  name: "outline_list",
  label: "Outline List Documents",
  description:
    "List documents without a search query -- most recently updated first by default. Filter by collection, by parent document, or list your own drafts. Use outline_search when you know what you are looking for.",
  parameters: Type.Object({
    collectionId: Type.Optional(
      Type.String({ description: "Only documents in this collection." }),
    ),
    parentDocumentId: Type.Optional(
      Type.String({ description: "Only direct children of this document." }),
    ),
    drafts: Type.Optional(
      Type.Boolean({
        description: "List unpublished drafts of the authenticated user instead.",
        default: false,
      }),
    ),
    limit: Type.Optional(
      Type.Number({ description: "How many documents to return. Default 25.", default: 25 }),
    ),
    offset: Type.Optional(
      Type.Number({ description: "Pagination offset. Default 0.", default: 0 }),
    ),
    sort: Type.Optional(
      Type.String({
        description: "Sort field: updatedAt (default), createdAt, title or index.",
      }),
    ),
    direction: Type.Optional(
      Type.String({ description: "ASC or DESC. Default DESC.", default: "DESC" }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      collectionId?: string;
      parentDocumentId?: string;
      drafts?: boolean;
      limit?: number;
      offset?: number;
      sort?: string;
      direction?: string;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (params.sort && !VALID_SORT.has(params.sort)) {
      throw new Error(
        `Invalid sort "${params.sort}". Use updatedAt, createdAt, title or index.`,
      );
    }
    const direction = (params.direction ?? "DESC").toUpperCase();
    if (direction !== "ASC" && direction !== "DESC") {
      throw new Error(`Invalid direction "${params.direction}". Use ASC or DESC.`);
    }

    const config = resolveConfig(params.profile);
    const { documents, pagination } = await listDocuments(
      config,
      {
        collectionId: params.collectionId,
        parentDocumentId: params.parentDocumentId,
        drafts: params.drafts,
        limit: params.limit,
        offset: params.offset,
        sort: params.sort,
        direction,
      },
      signal,
    );

    const heading = params.drafts
      ? "Drafts"
      : params.parentDocumentId
        ? `Children of ${params.parentDocumentId}`
        : params.collectionId
          ? `Documents in collection ${params.collectionId}`
          : "Recently updated documents";

    return {
      content: [
        { type: "text" as const, text: formatDocumentList(documents, heading, pagination) },
      ],
      details: {
        count: documents.length,
        documents: documents.map((doc) => ({ id: doc.id, title: doc.title })),
        pagination,
      },
    };
  },
};
