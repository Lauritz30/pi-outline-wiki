/**
 * Output formatters.
 *
 * Pure functions that transform domain data into display strings.
 * No emojis, no side effects.
 */

import type {
  CollectionSummary,
  CommentEntry,
  DocumentDetail,
  DocumentSummary,
  NavigationNode,
  OutlineConfig,
  Pagination,
  SearchHit,
  WorkspaceInfo,
} from "../types.ts";

/** Show only the last four characters of an API key. */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "(none)";
  if (apiKey.length <= 8) return "****";
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

function shortDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function statusMarkers(doc: DocumentSummary): string {
  const markers: string[] = [];
  if (doc.deletedAt) markers.push("trashed");
  else if (doc.archivedAt) markers.push("archived");
  else if (!doc.publishedAt) markers.push("draft");
  if (doc.template) markers.push("template");
  return markers.length > 0 ? ` [${markers.join(",")}]` : "";
}

function paginationNote(pagination?: Pagination, shown = 0): string {
  if (!pagination) return "";
  const offset = pagination.offset ?? 0;
  const limit = pagination.limit ?? shown;
  if (shown < limit) return "";
  return `\n\nMore results may exist. Re-run with offset ${offset + limit}.`;
}

// Profiles

export function formatProfileStatus(
  profiles: Record<string, OutlineConfig>,
  active: string | null,
): string {
  const names = Object.keys(profiles);
  if (names.length === 0) {
    return "No Outline workspace configured. Use outline_setup with your workspace URL and an API key from Settings -> API & Apps.";
  }

  const lines: string[] = [];
  for (const name of names) {
    const config = profiles[name];
    const marker = name === active ? "*" : " ";
    const insecure = config.insecureTls ? " (TLS validation off)" : "";
    lines.push(
      `${marker} ${name}: ${config.url} key ${maskApiKey(config.apiKey)}${insecure}`,
    );
    // The description is what tells the agent which wiki holds what, so it
    // gets its own line rather than being truncated onto the end of the URL.
    if (config.description) lines.push(`    ${config.description}`);
  }

  const footer =
    names.length > 1
      ? [
          "",
          "Target one workspace with the profile parameter, or set allProfiles: true on outline_search to search all of them at once.",
        ]
      : [];

  return [
    `Outline workspaces (${names.length}), * marks the active one:`,
    ...lines,
    ...footer,
  ].join("\n");
}

/** Search results gathered from several workspaces in one call. */
export interface ProfileSearchResult {
  readonly profile: string;
  readonly description?: string;
  readonly hits: ReadonlyArray<SearchHit>;
  readonly error?: string;
}

export function formatMultiSearchResults(
  results: ReadonlyArray<ProfileSearchResult>,
  query: string,
): string {
  const withHits = results.filter((result) => result.hits.length > 0);
  const failed = results.filter((result) => result.error);
  const total = withHits.reduce((sum, result) => sum + result.hits.length, 0);

  const sections: string[] = [];

  if (total === 0) {
    sections.push(
      `No documents match "${query}" in any of the ${results.length} configured workspace(s).`,
    );
  } else {
    sections.push(
      `Search "${query}" across ${results.length} workspace(s) -- ${total} result(s).`,
      "Ids are only valid within their own workspace: pass that workspace as the profile parameter to outline_read.",
    );
  }

  for (const result of withHits) {
    const label = result.description
      ? `${result.profile} (${result.description})`
      : result.profile;
    const lines = result.hits.map((hit, index) => {
      const context = hit.context.replace(/\s+/g, " ").trim();
      return [
        `  ${index + 1}. ${hit.document.title}${statusMarkers(hit.document)}`,
        `     id ${hit.document.id} | profile ${result.profile} | updated ${shortDate(hit.document.updatedAt)}`,
        context ? `     ${context.slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
    sections.push(`\n[${label}] ${result.hits.length} result(s):\n${lines.join("\n")}`);
  }

  const empty = results.filter(
    (result) => !result.error && result.hits.length === 0,
  );
  if (empty.length > 0 && total > 0) {
    sections.push(
      `\nNo matches in: ${empty.map((result) => result.profile).join(", ")}.`,
    );
  }

  if (failed.length > 0) {
    sections.push(
      `\n${failed.length} workspace(s) could not be searched:`,
      ...failed.map((result) => `- ${result.profile}: ${result.error}`),
    );
  }

  return sections.join("\n");
}

export function formatWorkspaceInfo(info: WorkspaceInfo): string {
  const lines = [
    `Workspace: ${info.teamName ?? "(unknown)"}`,
    `URL: ${info.teamUrl ?? "(unknown)"}`,
    `Authenticated as: ${info.userName ?? "(unknown)"}${info.userEmail ? ` <${info.userEmail}>` : ""}`,
  ];
  return lines.join("\n");
}

// Collections

export function formatCollectionList(
  collections: ReadonlyArray<CollectionSummary>,
): string {
  if (collections.length === 0) {
    return "No collections found. The API key's user may not be a member of any collection.";
  }

  const lines = collections.map((collection) => {
    const description = collection.description
      ? ` -- ${collection.description.replace(/\s+/g, " ").slice(0, 100)}`
      : "";
    return `- ${collection.name} (id ${collection.id})${description}`;
  });

  return [`Collections (${collections.length}):`, ...lines].join("\n");
}

export function formatCollectionStructure(
  nodes: ReadonlyArray<NavigationNode>,
  collectionName?: string,
): string {
  if (nodes.length === 0) {
    return `Collection ${collectionName ?? ""} has no documents.`.trim();
  }

  const lines: string[] = [];
  function walk(items: ReadonlyArray<NavigationNode>, indent: string): void {
    for (const node of items) {
      lines.push(`${indent}- ${node.title} (id ${node.id})`);
      if (node.children.length > 0) {
        walk(node.children, `${indent}  `);
      }
    }
  }
  walk(nodes, "");

  const header = collectionName
    ? `Document tree of "${collectionName}":`
    : "Document tree:";
  return [header, ...lines].join("\n");
}

// Documents

export function formatDocumentList(
  documents: ReadonlyArray<DocumentSummary>,
  heading: string,
  pagination?: Pagination,
): string {
  if (documents.length === 0) {
    return `${heading}: nothing found.`;
  }

  const lines = documents.map((doc) => {
    const author = doc.updatedBy?.name ? ` by ${doc.updatedBy.name}` : "";
    return `- ${doc.title}${statusMarkers(doc)}\n  id ${doc.id} | updated ${shortDate(doc.updatedAt)}${author}`;
  });

  return (
    `${heading} (${documents.length}):\n` +
    lines.join("\n") +
    paginationNote(pagination, documents.length)
  );
}

export function formatSearchResults(
  hits: ReadonlyArray<SearchHit>,
  query: string,
  pagination?: Pagination,
): string {
  if (hits.length === 0) {
    return `No documents match "${query}". Try fewer or more general keywords, or drop the collection filter.`;
  }

  const lines = hits.map((hit, index) => {
    const context = hit.context.replace(/\s+/g, " ").trim();
    return [
      `${index + 1}. ${hit.document.title}${statusMarkers(hit.document)}`,
      `   id ${hit.document.id} | updated ${shortDate(hit.document.updatedAt)}`,
      context ? `   ${context.slice(0, 300)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return (
    `Search "${query}" -- ${hits.length} result(s). Read one with outline_read.\n` +
    lines.join("\n") +
    paginationNote(pagination, hits.length)
  );
}

export function formatDocument(
  doc: DocumentDetail,
  options: { maxChars?: number } = {},
): string {
  const maxChars = options.maxChars ?? 0;
  let body = doc.text || "(this document has no content yet)";
  let truncated = false;

  if (maxChars > 0 && body.length > maxChars) {
    body = body.slice(0, maxChars);
    truncated = true;
  }

  const header = [
    `Title: ${doc.title}${statusMarkers(doc)}`,
    `Id: ${doc.id}`,
    doc.collectionId ? `Collection: ${doc.collectionId}` : "",
    doc.parentDocumentId ? `Parent document: ${doc.parentDocumentId}` : "",
    doc.url ? `URL: ${doc.url}` : "",
    `Updated: ${shortDate(doc.updatedAt)}${doc.updatedBy?.name ? ` by ${doc.updatedBy.name}` : ""}`,
  ].filter(Boolean);

  const footer = truncated
    ? `\n\n[truncated after ${maxChars} characters -- re-run outline_read with a larger maxChars to see the rest]`
    : "";

  return `${header.join("\n")}\n\n---\n\n${body}${footer}`;
}

export function formatDocumentSaved(
  doc: DocumentSummary,
  action: "created" | "updated",
): string {
  const state = doc.publishedAt ? "published" : "draft";
  return [
    `Document ${action} (${state}): ${doc.title}`,
    `Id: ${doc.id}`,
    doc.url ? `URL: ${doc.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Comments

export function formatComments(
  comments: ReadonlyArray<CommentEntry>,
  documentId: string,
): string {
  if (comments.length === 0) {
    return `No comments on document ${documentId}.`;
  }

  const byParent = new Map<string, CommentEntry[]>();
  const roots: CommentEntry[] = [];
  for (const comment of comments) {
    if (comment.parentCommentId) {
      const siblings = byParent.get(comment.parentCommentId) ?? [];
      siblings.push(comment);
      byParent.set(comment.parentCommentId, siblings);
    } else {
      roots.push(comment);
    }
  }

  const lines: string[] = [];
  function render(entry: CommentEntry, indent: string): void {
    const author = entry.createdBy?.name ?? "unknown";
    const resolved = entry.resolvedAt ? " [resolved]" : "";
    lines.push(`${indent}- ${author} at ${shortDate(entry.createdAt)}${resolved} (id ${entry.id})`);
    for (const line of (entry.text || "(empty)").split("\n")) {
      lines.push(`${indent}  ${line}`);
    }
    for (const child of byParent.get(entry.id) ?? []) {
      render(child, `${indent}  `);
    }
  }
  for (const root of roots) render(root, "");

  return [`Comments on document ${documentId} (${comments.length}):`, ...lines].join("\n");
}
