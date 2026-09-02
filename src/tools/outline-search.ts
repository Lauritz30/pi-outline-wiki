/**
 * outline_search tool -- Full-text search across the workspace.
 */

import { Type } from "typebox";
import { getProfiles, resolveConfig } from "../config.ts";
import { searchDocuments } from "../clients/outline-client.ts";
import {
  formatMultiSearchResults,
  formatSearchResults,
  type ProfileSearchResult,
} from "../formatting/formatters.ts";

const VALID_STATUS = new Set(["draft", "archived", "published"]);
const VALID_DATE = new Set(["day", "week", "month", "year"]);

export const OutlineSearchTool = {
  name: "outline_search",
  label: "Outline Search",
  description:
    "Full-text search across the Outline wiki. Returns matching documents with a snippet and their ids; read the full text with outline_read. Prefer two or three distinctive keywords over long sentences. With several workspaces configured, target one with 'profile' or set allProfiles to search all of them at once.",
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
    allProfiles: Type.Optional(
      Type.Boolean({
        description:
          "Search every configured workspace instead of just one, and report which workspace each hit came from. Use it when you do not know which wiki holds the answer. Default false.",
        default: false,
      }),
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
      allProfiles?: boolean;
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

    const query = params.query.trim();
    const criteria = {
      query,
      limit: params.limit,
      offset: params.offset,
      collectionId: params.collectionId,
      documentId: params.documentId,
      statusFilter: params.statusFilter,
      dateFilter: params.dateFilter,
    };

    if (params.allProfiles) {
      if (params.profile) {
        throw new Error(
          "profile and allProfiles contradict each other: pick one workspace, or search all of them.",
        );
      }
      // Collection and document filters are ids that only exist in one
      // workspace, so a fan-out with them set would silently return nothing
      // for every other wiki.
      if (params.collectionId || params.documentId) {
        throw new Error(
          "collectionId and documentId are specific to one workspace and cannot be combined with allProfiles. Search that workspace with the profile parameter instead.",
        );
      }

      const profiles = getProfiles();
      const names = Object.keys(profiles);
      if (names.length === 0) {
        throw new Error(
          "No Outline workspace configured. Use outline_setup first.",
        );
      }

      // One slow or broken workspace must not sink the whole search, so each
      // failure is reported alongside the results from the others.
      const results: ProfileSearchResult[] = await Promise.all(
        names.map(async (name) => {
          try {
            const { hits } = await searchDocuments(profiles[name], criteria, signal);
            return { profile: name, description: profiles[name].description, hits };
          } catch (err) {
            return {
              profile: name,
              description: profiles[name].description,
              hits: [],
              error: (err as Error).message,
            };
          }
        }),
      );

      return {
        content: [
          { type: "text" as const, text: formatMultiSearchResults(results, query) },
        ],
        details: {
          query,
          searchedProfiles: names,
          count: results.reduce((sum, result) => sum + result.hits.length, 0),
          failedProfiles: results.filter((r) => r.error).map((r) => r.profile),
          documents: results.flatMap((result) =>
            result.hits.map((hit) => ({
              id: hit.document.id,
              title: hit.document.title,
              profile: result.profile,
            })),
          ),
        },
      };
    }

    const config = resolveConfig(params.profile);
    const { hits, pagination } = await searchDocuments(config, criteria, signal);

    return {
      content: [
        { type: "text" as const, text: formatSearchResults(hits, query, pagination) },
      ],
      details: {
        query,
        profile: params.profile ?? null,
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
