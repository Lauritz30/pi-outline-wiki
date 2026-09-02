/**
 * Outline API client.
 *
 * The Outline API is RPC over HTTP: every method is a POST to
 * `<workspace>/api/<method>` with a JSON body and a Bearer API key, and every
 * response is `{ ok, data, pagination? }`. `callOutline` is the single place
 * that owns auth, timeouts and error translation; everything above it is a
 * thin, typed wrapper that returns plain data and never mutates state.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CollectionSummary,
  CommentEntry,
  DocumentDetail,
  DocumentSummary,
  NavigationNode,
  OutlineConfig,
  OutlineResponse,
  Pagination,
  SearchHit,
  UserRef,
  WorkspaceInfo,
} from "../types.ts";
import {
  OutlineApiError,
  OutlineNotFoundError,
  UnsafeExportPathError,
} from "../types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

let cachedVersion: string | undefined;
let tlsWarningIssued = false;

function getClientVersion(): string {
  if (!cachedVersion) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
      );
      cachedVersion = typeof pkg.version === "string" ? pkg.version : "unknown";
    } catch {
      cachedVersion = "unknown";
    }
  }
  return cachedVersion;
}

/**
 * Certificate validation can only be turned off process-wide in Node, so it
 * happens once, loudly, and only when a profile explicitly opts in.
 */
function applyTlsOption(config: OutlineConfig): void {
  if (!config.insecureTls) return;
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  if (!tlsWarningIssued) {
    tlsWarningIssued = true;
    process.emitWarning(
      "pi-outline-wiki: TLS certificate validation disabled for this process (profile has insecureTls).",
    );
  }
}

/** True once a profile in this process has disabled certificate validation. */
export function isTlsValidationDisabled(): boolean {
  return process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
}

// Core request

function combineSignals(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function describeFailure(method: string, status: number, payload: unknown): OutlineApiError {
  const body = (payload ?? {}) as Record<string, unknown>;
  const code = typeof body.error === "string" ? body.error : undefined;
  const detail =
    (typeof body.message === "string" && body.message) ||
    (typeof body.error === "string" && body.error) ||
    "";

  if (status === 401) {
    return new OutlineApiError(
      method,
      status,
      "Outline rejected the API key (401). Create a new key under Settings -> API & Apps and re-run outline_setup.",
      code,
    );
  }
  if (status === 403) {
    return new OutlineApiError(
      method,
      status,
      `Outline denied access (403)${detail ? `: ${detail}` : ""}. The API key's user may lack permission for this collection or document.`,
      code,
    );
  }
  if (status === 429) {
    return new OutlineApiError(
      method,
      status,
      "Outline rate limit reached (429). Wait a moment and retry.",
      code,
    );
  }
  return new OutlineApiError(
    method,
    status,
    `Outline API ${method} failed (${status})${detail ? `: ${detail}` : ""}`,
    code,
  );
}

/**
 * Call one Outline API method. Throws OutlineApiError for any non-ok response.
 */
export async function callOutline<T>(
  config: OutlineConfig,
  method: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<OutlineResponse<T>> {
  applyTlsOption(config);

  // Undefined values would be serialised away anyway, but dropping them here
  // keeps request bodies readable in errors and tests.
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) payload[key] = value;
  }

  const endpoint = `${config.url}/api/${method}`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": `pi-outline-wiki/${getClientVersion()}`,
      },
      body: JSON.stringify(payload),
      signal: combineSignals(signal, timeoutMs),
    });
  } catch (err) {
    const cause = err as Error;
    if (cause?.name === "TimeoutError" || cause?.name === "AbortError") {
      throw new OutlineApiError(
        method,
        0,
        `Outline did not respond within ${Math.round(timeoutMs / 1000)}s (${endpoint}).`,
      );
    }
    throw new OutlineApiError(
      method,
      0,
      `Could not reach Outline at ${config.url}: ${cause?.message ?? String(err)}`,
    );
  }

  const raw = await response.text();
  let parsed: unknown = undefined;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    if (parsed === undefined && raw.trim().startsWith("<")) {
      throw new OutlineApiError(
        method,
        response.status,
        `Outline returned HTML instead of JSON (${response.status}). Is ${config.url} really an Outline workspace?`,
      );
    }
    throw describeFailure(method, response.status, parsed);
  }

  const envelope = parsed as OutlineResponse<T> | undefined;
  if (!envelope || envelope.ok === false) {
    throw describeFailure(method, response.status, envelope);
  }
  return envelope;
}

// Mapping -- API payloads to domain data

function toUserRef(raw: unknown): UserRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const user = raw as Record<string, unknown>;
  return {
    id: typeof user.id === "string" ? user.id : undefined,
    name: typeof user.name === "string" ? user.name : undefined,
    email: typeof user.email === "string" ? user.email : undefined,
  };
}

export function toDocumentSummary(raw: unknown): DocumentSummary {
  const doc = (raw ?? {}) as Record<string, any>;
  return {
    id: String(doc.id ?? ""),
    urlId: doc.urlId,
    title: typeof doc.title === "string" && doc.title.length > 0 ? doc.title : "Untitled",
    url: doc.url,
    icon: doc.icon ?? null,
    collectionId: doc.collectionId ?? null,
    parentDocumentId: doc.parentDocumentId ?? null,
    template: Boolean(doc.template),
    fullWidth: Boolean(doc.fullWidth),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    archivedAt: doc.archivedAt ?? null,
    deletedAt: doc.deletedAt ?? null,
    publishedAt: doc.publishedAt ?? null,
    createdBy: toUserRef(doc.createdBy),
    updatedBy: toUserRef(doc.updatedBy),
  };
}

export function toDocumentDetail(raw: unknown): DocumentDetail {
  const doc = (raw ?? {}) as Record<string, any>;
  return {
    ...toDocumentSummary(doc),
    text: typeof doc.text === "string" ? doc.text : "",
  };
}

export function toCollectionSummary(raw: unknown): CollectionSummary {
  const col = (raw ?? {}) as Record<string, any>;
  return {
    id: String(col.id ?? ""),
    name: typeof col.name === "string" ? col.name : "Untitled",
    description: col.description ?? null,
    icon: col.icon ?? null,
    color: col.color ?? null,
    permission: col.permission ?? null,
    updatedAt: col.updatedAt,
  };
}

export function toNavigationNode(raw: unknown): NavigationNode {
  const node = (raw ?? {}) as Record<string, any>;
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    id: String(node.id ?? ""),
    title: typeof node.title === "string" && node.title.length > 0 ? node.title : "Untitled",
    url: node.url,
    children: children.map(toNavigationNode),
  };
}

/**
 * Comments are stored as a ProseMirror document. Flatten it to plain text so
 * the agent reads prose instead of a node tree. Falls back to `text` when the
 * server already provides it.
 */
export function flattenRichText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";

  const node = raw as Record<string, any>;
  if (node.type === "text" && typeof node.text === "string") return node.text;

  const children = Array.isArray(node.content) ? node.content : [];
  const parts = children.map(flattenRichText).filter((part) => part.length > 0);

  const blockTypes = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "code_block",
    "code_fence",
    "list_item",
    "checkbox_item",
  ]);
  const joined = parts.join("");
  return blockTypes.has(String(node.type)) ? `${joined}\n` : joined;
}

export function toComment(raw: unknown): CommentEntry {
  const comment = (raw ?? {}) as Record<string, any>;
  const text =
    typeof comment.text === "string" && comment.text.length > 0
      ? comment.text
      : flattenRichText(comment.data).trim();
  return {
    id: String(comment.id ?? ""),
    documentId: comment.documentId,
    parentCommentId: comment.parentCommentId ?? null,
    text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    resolvedAt: comment.resolvedAt ?? null,
    createdBy: toUserRef(comment.createdBy),
  };
}

// Operations -- workspace

export async function getWorkspaceInfo(
  config: OutlineConfig,
  signal?: AbortSignal,
): Promise<WorkspaceInfo> {
  const res = await callOutline<any>(config, "auth.info", {}, signal, 15_000);
  const data = res.data ?? {};
  return {
    userName: data.user?.name,
    userEmail: data.user?.email,
    teamName: data.team?.name,
    teamUrl: data.team?.url,
  };
}

// Operations -- collections

export async function listCollections(
  config: OutlineConfig,
  params: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<{ collections: CollectionSummary[]; pagination?: Pagination }> {
  const res = await callOutline<any[]>(
    config,
    "collections.list",
    { limit: params.limit ?? 50, offset: params.offset ?? 0 },
    signal,
  );
  return {
    collections: (res.data ?? []).map(toCollectionSummary),
    pagination: res.pagination,
  };
}

export async function getCollectionStructure(
  config: OutlineConfig,
  collectionId: string,
  signal?: AbortSignal,
): Promise<NavigationNode[]> {
  const res = await callOutline<any[]>(
    config,
    "collections.documents",
    { id: collectionId },
    signal,
  );
  return (res.data ?? []).map(toNavigationNode);
}

// Operations -- documents

export async function searchDocuments(
  config: OutlineConfig,
  params: {
    query: string;
    limit?: number;
    offset?: number;
    collectionId?: string;
    documentId?: string;
    statusFilter?: string[];
    dateFilter?: string;
  },
  signal?: AbortSignal,
): Promise<{ hits: SearchHit[]; pagination?: Pagination }> {
  const res = await callOutline<any[]>(
    config,
    "documents.search",
    {
      query: params.query,
      limit: params.limit ?? 15,
      offset: params.offset ?? 0,
      collectionId: params.collectionId,
      documentId: params.documentId,
      statusFilter: params.statusFilter,
      dateFilter: params.dateFilter,
    },
    signal,
  );
  const hits = (res.data ?? []).map((hit: any) => ({
    ranking: typeof hit?.ranking === "number" ? hit.ranking : undefined,
    context: typeof hit?.context === "string" ? hit.context : "",
    document: toDocumentSummary(hit?.document),
  }));
  return { hits, pagination: res.pagination };
}

export async function listDocuments(
  config: OutlineConfig,
  params: {
    limit?: number;
    offset?: number;
    collectionId?: string;
    parentDocumentId?: string;
    userId?: string;
    sort?: string;
    direction?: string;
    statusFilter?: string[];
    drafts?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<{ documents: DocumentSummary[]; pagination?: Pagination }> {
  const method = params.drafts ? "documents.drafts" : "documents.list";
  const res = await callOutline<any[]>(
    config,
    method,
    {
      limit: params.limit ?? 25,
      offset: params.offset ?? 0,
      collectionId: params.collectionId,
      parentDocumentId: params.drafts ? undefined : params.parentDocumentId,
      userId: params.drafts ? undefined : params.userId,
      sort: params.sort ?? "updatedAt",
      direction: params.direction ?? "DESC",
      statusFilter: params.drafts ? undefined : params.statusFilter,
    },
    signal,
  );
  return {
    documents: (res.data ?? []).map(toDocumentSummary),
    pagination: res.pagination,
  };
}

export async function getDocument(
  config: OutlineConfig,
  id: string,
  signal?: AbortSignal,
): Promise<DocumentDetail> {
  try {
    const res = await callOutline<any>(config, "documents.info", { id }, signal);
    if (!res.data) throw new OutlineNotFoundError(`Document "${id}"`);
    return toDocumentDetail(res.data);
  } catch (err) {
    if (err instanceof OutlineApiError && err.status === 404) {
      throw new OutlineNotFoundError(`Document "${id}"`);
    }
    throw err;
  }
}

export async function createDocument(
  config: OutlineConfig,
  params: {
    title: string;
    text?: string;
    collectionId?: string;
    parentDocumentId?: string;
    templateId?: string;
    icon?: string;
    publish?: boolean;
  },
  signal?: AbortSignal,
): Promise<DocumentDetail> {
  const res = await callOutline<any>(
    config,
    "documents.create",
    {
      title: params.title,
      text: params.text,
      collectionId: params.collectionId,
      parentDocumentId: params.parentDocumentId,
      templateId: params.templateId,
      icon: params.icon,
      publish: params.publish ?? true,
    },
    signal,
  );
  return toDocumentDetail(res.data);
}

export async function updateDocument(
  config: OutlineConfig,
  params: {
    id: string;
    title?: string;
    text?: string;
    icon?: string;
    fullWidth?: boolean;
    publish?: boolean;
  },
  signal?: AbortSignal,
): Promise<DocumentDetail> {
  const res = await callOutline<any>(
    config,
    "documents.update",
    {
      id: params.id,
      title: params.title,
      text: params.text,
      icon: params.icon,
      fullWidth: params.fullWidth,
      publish: params.publish,
    },
    signal,
  );
  return toDocumentDetail(res.data);
}

export async function moveDocument(
  config: OutlineConfig,
  params: {
    id: string;
    collectionId?: string;
    parentDocumentId?: string | null;
    index?: number;
  },
  signal?: AbortSignal,
): Promise<{ documentCount: number }> {
  const res = await callOutline<any>(
    config,
    "documents.move",
    {
      id: params.id,
      collectionId: params.collectionId,
      parentDocumentId: params.parentDocumentId,
      index: params.index,
    },
    signal,
  );
  const documents = res.data?.documents;
  return { documentCount: Array.isArray(documents) ? documents.length : 0 };
}

export async function documentLifecycle(
  config: OutlineConfig,
  action: "archive" | "restore" | "unpublish" | "delete",
  params: { id: string; permanent?: boolean },
  signal?: AbortSignal,
): Promise<DocumentSummary | null> {
  const method = `documents.${action}`;
  const body: Record<string, unknown> = { id: params.id };
  if (action === "delete" && params.permanent) body.permanent = true;

  const res = await callOutline<any>(config, method, body, signal);
  return res.data ? toDocumentSummary(res.data) : null;
}

/** Fetch a document as markdown via documents.export. */
export async function exportDocument(
  config: OutlineConfig,
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await callOutline<string>(config, "documents.export", { id }, signal);
  return typeof res.data === "string" ? res.data : "";
}

// Operations -- comments

export async function listComments(
  config: OutlineConfig,
  params: { documentId: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<{ comments: CommentEntry[]; pagination?: Pagination }> {
  const res = await callOutline<any[]>(
    config,
    "comments.list",
    {
      documentId: params.documentId,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    signal,
  );
  return {
    comments: (res.data ?? []).map(toComment),
    pagination: res.pagination,
  };
}

export async function createComment(
  config: OutlineConfig,
  params: { documentId: string; text: string; parentCommentId?: string },
  signal?: AbortSignal,
): Promise<CommentEntry> {
  const res = await callOutline<any>(
    config,
    "comments.create",
    {
      documentId: params.documentId,
      parentCommentId: params.parentCommentId,
      text: params.text,
      // Older Outline releases validate `data` (ProseMirror) rather than
      // `text`; sending both keeps one call working across versions.
      data: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: params.text }] },
        ],
      },
    },
    signal,
  );
  return toComment(res.data);
}

// Local file output

/** Slugify a document title into a safe file name stem. */
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "document";
}

/**
 * Write markdown into `dir`, refusing any path that escapes it. Returns the
 * absolute path written.
 */
export function writeMarkdownFile(dir: string, fileName: string, content: string): string {
  const targetDir = path.resolve(dir);
  const target = path.resolve(targetDir, fileName);
  if (target !== targetDir && !target.startsWith(targetDir + path.sep)) {
    throw new UnsafeExportPathError(fileName);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return target;
}
