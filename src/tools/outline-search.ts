/**
 * outline_search tool -- Full-text search across the workspace.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { searchDocuments } from "../clients/outline-client.ts";
import { formatSearchResults } from "../formatting/formatters.ts";

const VALID_STATUS = new Set(["draft", "archived", "published"]);
const VALID_DATE = new Set(["day", "week", "month", "year"]);

export const OutlineSearchTool = {
  name: "outline_search",
  label: "Outline Search",
  description:
    "Full-text search across the Outline wiki. Returns matching documents with a snippet and their ids; read the full text with outline_read. Prefer two or three distinctive keywords over long sentences.",
  parameters: Type.Object({
    query: Type.String({
      description: "Search keywords. Distinctive nouns work better than full questions.",
    }),
    limit: Type.Optional(
      Type.Number({ description: "How many results to return. Default 15.", default: 15 }),
    ),
    offset: Type.Optional(
      Type.Number({ description: "Pagination offset. Default 0.", default: 0 }),
    ),
    collectionId: Type.Optional(
      Type.String({ description: "Restrict the search to one collection." }),
    ),
    documentId: Type.Optional(
      Type.String({ description: "Restrict the search to one document and its children." }),
    ),
    statusFilter: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "Restrict to document states: any of draft, archived, published. Defaults to published documents.",
      }),
    ),
    dateFilter: Type.Optional(
      Type.String({
        description: "Only documents updated within: day, week, month or year.",
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      query: string;
      limit?: number;
      offset?: number;
      collectionId?: string;
      documentId?: string;
      statusFilter?: string[];
      dateFilter?: string;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    if (!params.query || !params.query.trim()) {
      throw new Error("query must not be empty.");
    }
    if (params.statusFilter) {
      const invalid = params.statusFilter.filter((s) => !VALID_STATUS.has(s));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid statusFilter value(s): ${invalid.join(", ")}. Use draft, archived or published.`,
        );
      }
    }
    if (params.dateFilter && !VALID_DATE.has(params.dateFilter)) {
      throw new Error(
        `Invalid dateFilter "${params.dateFilter}". Use day, week, month or year.`,
      );
    }

    const config = resolveConfig(params.profile);
    const { hits, pagination } = await searchDocuments(
      config,
      {
        query: params.query.trim(),
        limit: params.limit,
        offset: params.offset,
        collectionId: params.collectionId,
        documentId: params.documentId,
        statusFilter: params.statusFilter,
        dateFilter: params.dateFilter,
      },
      signal,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: formatSearchResults(hits, params.query.trim(), pagination),
        },
      ],
      details: {
        query: params.query.trim(),
        count: hits.length,
        documents: hits.map((hit) => ({
          id: hit.document.id,
          title: hit.document.title,
        })),
        pagination,
      },
    };
  },
};
