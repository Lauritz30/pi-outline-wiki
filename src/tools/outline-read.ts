/**
 * outline_read tool -- Read one document's markdown body.
 *
 * Long wiki pages can blow a context window, so the body is truncated by
 * default and the caller decides how much to pull in.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import {
  getDocument,
  listDocuments,
  slugifyTitle,
  writeMarkdownFile,
} from "../clients/outline-client.ts";
import { formatDocument, formatDocumentList } from "../formatting/formatters.ts";

const DEFAULT_MAX_CHARS = 20_000;

export const OutlineReadTool = {
  name: "outline_read",
  label: "Outline Read Document",
  description:
    "Read a document's full markdown body by id (the id or urlId from outline_search, outline_list or outline_structure). Optionally list its child documents or save it to a local markdown file.",
  parameters: Type.Object({
    id: Type.String({
      description: "Document id (uuid) or urlId from an Outline URL.",
    }),
    maxChars: Type.Optional(
      Type.Number({
        description:
          "Truncate the body after this many characters. Default 20000. Use 0 for no limit.",
        default: DEFAULT_MAX_CHARS,
      }),
    ),
    includeChildren: Type.Optional(
      Type.Boolean({
        description: "Also list the direct child documents. Default false.",
        default: false,
      }),
    ),
    saveDir: Type.Optional(
      Type.String({
        description:
          "Directory to save the document as a .md file in. Absolute paths are safest.",
      }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      id: string;
      maxChars?: number;
      includeChildren?: boolean;
      saveDir?: string;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    const config = resolveConfig(params.profile);
    const doc = await getDocument(config, params.id, signal);
    const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;

    const sections = [formatDocument(doc, { maxChars })];

    let savedPath: string | undefined;
    if (params.saveDir) {
      savedPath = writeMarkdownFile(
        params.saveDir,
        `${slugifyTitle(doc.title)}.md`,
        `# ${doc.title}\n\n${doc.text}\n`,
      );
      sections.push(`\nSaved full document to ${savedPath}`);
    }

    let childCount = 0;
    if (params.includeChildren) {
      const { documents } = await listDocuments(
        config,
        { parentDocumentId: doc.id, limit: 50 },
        signal,
      );
      childCount = documents.length;
      sections.push(`\n${formatDocumentList(documents, "Child documents")}`);
    }

    return {
      content: [{ type: "text" as const, text: sections.join("\n") }],
      details: {
        id: doc.id,
        title: doc.title,
        collectionId: doc.collectionId,
        length: doc.text.length,
        truncated: maxChars > 0 && doc.text.length > maxChars,
        childCount,
        savedPath,
      },
    };
  },
};
