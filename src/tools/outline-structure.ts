/**
 * outline_structure tool -- Show the nested document tree of a collection.
 *
 * Cheaper and more useful than listing documents flat: it reveals how the
 * wiki is organised, which is what you need before filing a new document.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { getCollectionStructure, listCollections } from "../clients/outline-client.ts";
import { formatCollectionStructure } from "../formatting/formatters.ts";

export const OutlineStructureTool = {
  name: "outline_structure",
  label: "Outline Collection Structure",
  description:
    "Show the nested document tree of one collection (titles and ids, parents and children). Use it to understand how a wiki section is organised before creating or moving documents.",
  parameters: Type.Object({
    collectionId: Type.String({
      description: "Collection id. Get it from outline_collections.",
    }),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { collectionId: string; profile?: string },
    signal: AbortSignal,
  ) {
    const config = resolveConfig(params.profile);
    const nodes = await getCollectionStructure(config, params.collectionId, signal);

    // The tree endpoint returns no collection name, so resolve it for output.
    let collectionName: string | undefined;
    try {
      const { collections } = await listCollections(config, { limit: 100 }, signal);
      collectionName = collections.find((c) => c.id === params.collectionId)?.name;
    } catch {
      /* naming is cosmetic -- never fail the call over it */
    }

    function countNodes(items: ReadonlyArray<{ children: ReadonlyArray<any> }>): number {
      return items.reduce((total, node) => total + 1 + countNodes(node.children), 0);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatCollectionStructure(nodes, collectionName),
        },
      ],
      details: {
        collectionId: params.collectionId,
        collectionName,
        topLevelCount: nodes.length,
        totalCount: countNodes(nodes),
      },
    };
  },
};
