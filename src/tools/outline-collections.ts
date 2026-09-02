/**
 * outline_collections tool -- List the collections of the workspace.
 *
 * Collections are the top level of an Outline wiki; every published document
 * lives in exactly one. Most write tools need a collectionId, so this is
 * usually the first read call in a session.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { listCollections } from "../clients/outline-client.ts";
import { formatCollectionList } from "../formatting/formatters.ts";

export const OutlineCollectionsTool = {
  name: "outline_collections",
  label: "Outline Collections",
  description:
    "List the collections (top-level sections) of the Outline workspace with their ids. Use this to find the collectionId needed by outline_create, outline_search filters and outline_structure.",
  parameters: Type.Object({
    limit: Type.Optional(
      Type.Number({ description: "How many collections to return. Default 50.", default: 50 }),
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
    params: { limit?: number; offset?: number; profile?: string },
    signal: AbortSignal,
  ) {
    const config = resolveConfig(params.profile);
    const { collections, pagination } = await listCollections(
      config,
      { limit: params.limit, offset: params.offset },
      signal,
    );

    return {
      content: [{ type: "text" as const, text: formatCollectionList(collections) }],
      details: {
        count: collections.length,
        collections: collections.map((c) => ({ id: c.id, name: c.name })),
        pagination,
      },
    };
  },
};
