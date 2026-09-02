/**
 * outline_update tool -- Change an existing document.
 *
 * `replace` overwrites the body, so append/prepend exist to add to a page
 * (changelog, decision log, FAQ) without having to read and re-send it.
 */

import { Type } from "typebox";
import { resolveConfig } from "../config.ts";
import { getDocument, updateDocument } from "../clients/outline-client.ts";
import { formatDocumentSaved } from "../formatting/formatters.ts";

const VALID_MODES = new Set(["replace", "append", "prepend"]);

export const OutlineUpdateTool = {
  name: "outline_update",
  label: "Outline Update Document",
  description:
    "Update an existing document: replace the body, append or prepend a section, rename it, or publish a draft. Read the document first when replacing, so nothing is lost.",
  parameters: Type.Object({
    id: Type.String({ description: "Document id or urlId." }),
    text: Type.Optional(Type.String({ description: "Markdown to write, append or prepend." })),
    mode: Type.Optional(
      Type.String({
        description:
          "How to apply text: replace (default, overwrites the whole body), append (add at the end), prepend (add at the top).",
        default: "replace",
      }),
    ),
    title: Type.Optional(Type.String({ description: "New title." })),
    icon: Type.Optional(Type.String({ description: "New emoji or icon." })),
    publish: Type.Optional(
      Type.Boolean({ description: "Publish a draft document so others can see it." }),
    ),
    profile: Type.Optional(
      Type.String({ description: "Outline profile to use. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: {
      id: string;
      text?: string;
      mode?: string;
      title?: string;
      icon?: string;
      publish?: boolean;
      profile?: string;
    },
    signal: AbortSignal,
  ) {
    const mode = (params.mode ?? "replace").toLowerCase();
    if (!VALID_MODES.has(mode)) {
      throw new Error(`Invalid mode "${params.mode}". Use replace, append or prepend.`);
    }
    if (
      params.text === undefined &&
      params.title === undefined &&
      params.icon === undefined &&
      params.publish === undefined
    ) {
      throw new Error("Nothing to update: pass at least one of text, title, icon or publish.");
    }

    const config = resolveConfig(params.profile);

    let text = params.text;
    if (text !== undefined && mode !== "replace") {
      const current = await getDocument(config, params.id, signal);
      const existing = current.text ?? "";
      text =
        mode === "append"
          ? `${existing.replace(/\s*$/, "")}\n\n${text}\n`
          : `${text}\n\n${existing.replace(/^\s*/, "")}`;
    }

    const doc = await updateDocument(
      config,
      {
        id: params.id,
        text,
        title: params.title,
        icon: params.icon,
        publish: params.publish,
      },
      signal,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `${formatDocumentSaved(doc, "updated")}\nMode: ${mode}`,
        },
      ],
      details: {
        id: doc.id,
        title: doc.title,
        url: doc.url,
        mode,
        length: doc.text.length,
      },
    };
  },
};
