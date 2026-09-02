/**
 * pi Outline Wiki Extension
 *
 * Gives pi read and write access to an Outline wiki
 * (https://www.getoutline.com) through Outline's REST API.
 *
 * Tools:
 *   - outline_setup: Configure workspace URL and API key
 *   - outline_status: Show configuration and verify the connection
 *   - outline_profile: List, switch or delete workspace profiles
 *   - outline_collections: List collections with their ids
 *   - outline_structure: Show the nested document tree of a collection
 *   - outline_search: Full-text search across the wiki
 *   - outline_list: Browse documents, children or drafts
 *   - outline_read: Read a document's markdown body
 *   - outline_create: Create a new document
 *   - outline_update: Replace, append to or prepend to a document
 *   - outline_move: Re-file a document into another collection or parent
 *   - outline_archive: Archive, restore or unpublish a document
 *   - outline_delete: Trash or permanently delete a document
 *   - outline_comments: Read comment threads on a document
 *   - outline_comment: Post a comment or reply
 *   - outline_export: Save documents to local markdown files
 *
 * Data-oriented design:
 *   - All domain data is represented as plain immutable interfaces (types.ts)
 *   - I/O is isolated in the client module (clients/)
 *   - Pure formatting functions convert data to display strings (formatting/)
 *   - Each tool is a single-responsibility module (tools/)
 *   - Configuration is managed as mutable state with file persistence (config.ts)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadConfig, getConfig } from "./src/config.ts";
import { OutlineSetupTool } from "./src/tools/outline-setup.ts";
import { OutlineStatusTool } from "./src/tools/outline-status.ts";
import { OutlineProfileTool } from "./src/tools/outline-profile.ts";
import { OutlineCollectionsTool } from "./src/tools/outline-collections.ts";
import { OutlineStructureTool } from "./src/tools/outline-structure.ts";
import { OutlineSearchTool } from "./src/tools/outline-search.ts";
import { OutlineListTool } from "./src/tools/outline-list.ts";
import { OutlineReadTool } from "./src/tools/outline-read.ts";
import { OutlineCreateTool } from "./src/tools/outline-create.ts";
import { OutlineUpdateTool } from "./src/tools/outline-update.ts";
import { OutlineMoveTool } from "./src/tools/outline-move.ts";
import { OutlineArchiveTool } from "./src/tools/outline-archive.ts";
import { OutlineDeleteTool } from "./src/tools/outline-delete.ts";
import { OutlineCommentsTool } from "./src/tools/outline-comments.ts";
import { OutlineCommentTool } from "./src/tools/outline-comment.ts";
import { OutlineExportTool } from "./src/tools/outline-export.ts";

const NOT_CONFIGURED =
  "Outline not configured. Use the outline_setup tool with your workspace URL and an API key.";

export default function (pi: ExtensionAPI) {
  // Load saved config on startup
  loadConfig();

  // Register all tools
  pi.registerTool(OutlineSetupTool);
  pi.registerTool(OutlineStatusTool);
  pi.registerTool(OutlineProfileTool);
  pi.registerTool(OutlineCollectionsTool);
  pi.registerTool(OutlineStructureTool);
  pi.registerTool(OutlineSearchTool);
  pi.registerTool(OutlineListTool);
  pi.registerTool(OutlineReadTool);
  pi.registerTool(OutlineCreateTool);
  pi.registerTool(OutlineUpdateTool);
  pi.registerTool(OutlineMoveTool);
  pi.registerTool(OutlineArchiveTool);
  pi.registerTool(OutlineDeleteTool);
  pi.registerTool(OutlineCommentsTool);
  pi.registerTool(OutlineCommentTool);
  pi.registerTool(OutlineExportTool);

  // Look something up in the wiki without spelling out the tool call
  pi.registerCommand("wiki", {
    description: "Search the Outline wiki and summarise what it says",
    handler: async (args, ctx) => {
      if (!getConfig()) {
        ctx.ui.notify(NOT_CONFIGURED, "error");
        return;
      }

      const query = args.trim();
      if (!query) {
        ctx.ui.notify("Usage: /wiki <what you are looking for>", "info");
        return;
      }

      pi.sendUserMessage(
        `Search our Outline wiki for "${query}" using outline_search, read the most relevant document(s) with outline_read, and summarise what the wiki says. Cite each document by title and id, and say so plainly if the wiki has nothing on it.`,
        { deliverAs: "steer" },
      );
      ctx.ui.notify(`Searching the wiki for "${query}"...`, "info");
    },
  });

  // Write the session's outcome back into the wiki
  pi.registerCommand("wiki-capture", {
    description: "Write what we worked out in this session into the Outline wiki",
    handler: async (args, ctx) => {
      if (!getConfig()) {
        ctx.ui.notify(NOT_CONFIGURED, "error");
        return;
      }

      const hint = args.trim();
      pi.sendUserMessage(
        [
          "Capture the durable knowledge from this session in our Outline wiki.",
          hint ? `Focus on: ${hint}.` : "",
          "First use outline_search to check whether a page on this already exists.",
          "If it does, extend it with outline_update (mode append) instead of creating a duplicate.",
          "If it does not, use outline_collections to pick the right collection and create the page with outline_create.",
          "Write what a colleague would need in six months: the decision, why, and what was ruled out -- not a transcript.",
          "Show me the page title and URL when you are done.",
        ]
          .filter(Boolean)
          .join(" "),
        { deliverAs: "steer" },
      );
      ctx.ui.notify("Asking the agent to write this up in the wiki...", "info");
    },
  });
}
