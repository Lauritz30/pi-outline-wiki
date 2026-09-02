/**
 * Data types for the pi Outline Wiki extension.
 *
 * All domain data is represented as plain immutable-shaped interfaces.
 * No behavior, no classes, no inheritance -- just data (errors excepted).
 */

// Configuration

export interface OutlineConfig {
  /**
   * Workspace base URL without a trailing slash and without the `/api`
   * suffix, e.g. `https://acme.getoutline.com` or `https://wiki.example.com`.
   */
  readonly url: string;
  /** Personal API key, starts with `ol_api_`. */
  readonly apiKey: string;
  /**
   * Skip TLS certificate validation. Only for self-hosted instances behind a
   * self-signed certificate. Disables validation process-wide, so it is off
   * unless explicitly requested.
   */
  readonly insecureTls?: boolean;
}

export interface OutlineProfiles {
  readonly profiles: Record<string, OutlineConfig>;
  readonly activeProfile: string | null;
}

// Domain

export interface UserRef {
  readonly id?: string;
  readonly name?: string;
  readonly email?: string;
}

export interface CollectionSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
  readonly permission?: string | null;
  readonly updatedAt?: string;
}

export interface DocumentSummary {
  readonly id: string;
  readonly urlId?: string;
  readonly title: string;
  readonly url?: string;
  readonly icon?: string | null;
  readonly collectionId?: string | null;
  readonly parentDocumentId?: string | null;
  readonly template?: boolean;
  readonly fullWidth?: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly archivedAt?: string | null;
  readonly deletedAt?: string | null;
  readonly publishedAt?: string | null;
  readonly createdBy?: UserRef;
  readonly updatedBy?: UserRef;
}

export interface DocumentDetail extends DocumentSummary {
  /** Markdown body. */
  readonly text: string;
}

export interface SearchHit {
  readonly ranking?: number;
  /** Snippet around the match, may contain markdown highlight markers. */
  readonly context: string;
  readonly document: DocumentSummary;
}

export interface NavigationNode {
  readonly id: string;
  readonly title: string;
  readonly url?: string;
  readonly children: ReadonlyArray<NavigationNode>;
}

export interface CommentEntry {
  readonly id: string;
  readonly documentId?: string;
  readonly parentCommentId?: string | null;
  /** Plain text flattened from the stored rich-text document. */
  readonly text: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly resolvedAt?: string | null;
  readonly createdBy?: UserRef;
}

export interface WorkspaceInfo {
  readonly userName?: string;
  readonly userEmail?: string;
  readonly teamName?: string;
  readonly teamUrl?: string;
}

export interface Pagination {
  readonly offset?: number;
  readonly limit?: number;
  readonly total?: number;
  readonly nextPath?: string;
}

/** Envelope every Outline API method returns. */
export interface OutlineResponse<T> {
  readonly ok: boolean;
  readonly data: T;
  readonly pagination?: Pagination;
  readonly status?: number;
  readonly error?: string;
  readonly message?: string;
}

// Tool parameter shapes

export interface SetupParams {
  readonly name: string;
  readonly url: string;
  readonly apiKey: string;
  readonly insecureTls?: boolean;
}

// Errors

export class OutlineNotConfiguredError extends Error {
  constructor() {
    super(
      "Outline is not configured. Use the outline_setup tool first (workspace URL + API key).",
    );
    this.name = "OutlineNotConfiguredError";
  }
}

export class OutlineApiError extends Error {
  readonly method: string;
  readonly status: number;
  readonly code?: string;

  constructor(method: string, status: number, message: string, code?: string) {
    super(message);
    this.name = "OutlineApiError";
    this.method = method;
    this.status = status;
    this.code = code;
  }
}

export class OutlineNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found. Check the id, or search for it with outline_search.`);
    this.name = "OutlineNotFoundError";
  }
}

export class UnsafeExportPathError extends Error {
  constructor(target: string) {
    super(`Refusing to write outside the target directory: ${target}`);
    this.name = "UnsafeExportPathError";
  }
}
