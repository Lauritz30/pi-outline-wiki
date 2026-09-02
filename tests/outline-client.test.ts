import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  callOutline,
  createComment,
  documentLifecycle,
  exportDocument,
  flattenRichText,
  getDocument,
  listCollections,
  listDocuments,
  searchDocuments,
  slugifyTitle,
  toComment,
  toDocumentDetail,
  toDocumentSummary,
  toNavigationNode,
  updateDocument,
  writeMarkdownFile,
} from "../src/clients/outline-client.ts";
import { OutlineApiError, OutlineNotFoundError } from "../src/types.ts";
import type { OutlineConfig } from "../src/types.ts";

const config: OutlineConfig = {
  url: "https://acme.getoutline.com",
  apiKey: "ol_api_test",
};

type Call = { url: string; body: any; headers: Record<string, string> };

const originalFetch = globalThis.fetch;
let calls: Call[] = [];

function stubFetch(
  status: number,
  payload: unknown,
  options: { asText?: string } = {},
) {
  calls = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : undefined,
      headers: init?.headers ?? {},
    });
    const text = options.asText ?? JSON.stringify(payload);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as unknown as Response;
  }) as typeof fetch;
}

describe("callOutline", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to the RPC endpoint with a bearer token", async () => {
    stubFetch(200, { ok: true, data: { hello: "world" } });
    const res = await callOutline<any>(config, "documents.info", { id: "abc" });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://acme.getoutline.com/api/documents.info");
    assert.deepStrictEqual(calls[0].body, { id: "abc" });
    assert.strictEqual(calls[0].headers.Authorization, "Bearer ol_api_test");
    assert.strictEqual(calls[0].headers["Content-Type"], "application/json");
    assert.deepStrictEqual(res.data, { hello: "world" });
  });

  it("drops undefined body values instead of sending nulls", async () => {
    stubFetch(200, { ok: true, data: [] });
    await callOutline(config, "documents.list", {
      limit: 10,
      collectionId: undefined,
    });
    assert.deepStrictEqual(calls[0].body, { limit: 10 });
  });

  it("keeps explicit nulls, which documents.move needs", async () => {
    stubFetch(200, { ok: true, data: {} });
    await callOutline(config, "documents.move", { id: "a", parentDocumentId: null });
    assert.deepStrictEqual(calls[0].body, { id: "a", parentDocumentId: null });
  });

  it("explains a 401 in terms of the API key", async () => {
    stubFetch(401, { ok: false, error: "authentication_required" });
    await assert.rejects(
      () => callOutline(config, "auth.info", {}),
      (err: OutlineApiError) => {
        assert.strictEqual(err.name, "OutlineApiError");
        assert.strictEqual(err.status, 401);
        assert.match(err.message, /API key/);
        return true;
      },
    );
  });

  it("explains a 403 as a permission problem", async () => {
    stubFetch(403, { ok: false, message: "no access to collection" });
    await assert.rejects(
      () => callOutline(config, "documents.info", { id: "a" }),
      /denied access \(403\).*no access to collection/s,
    );
  });

  it("explains a 429 as rate limiting", async () => {
    stubFetch(429, { ok: false });
    await assert.rejects(() => callOutline(config, "documents.search", {}), /rate limit/i);
  });

  it("recognises an HTML error page as a wrong base url", async () => {
    stubFetch(404, undefined, { asText: "<!doctype html><html>404</html>" });
    await assert.rejects(
      () => callOutline(config, "documents.info", { id: "a" }),
      /really an Outline workspace/,
    );
  });

  it("treats ok:false as a failure even on HTTP 200", async () => {
    stubFetch(200, { ok: false, message: "broken" });
    await assert.rejects(() => callOutline(config, "documents.info", { id: "a" }), /broken/);
  });

  it("reports an unreachable host with the workspace url", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      () => callOutline(config, "auth.info", {}),
      /Could not reach Outline at https:\/\/acme\.getoutline\.com/,
    );
  });
});

describe("operations", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("searchDocuments maps hits to documents plus context", async () => {
    stubFetch(200, {
      ok: true,
      data: [
        {
          ranking: 0.9,
          context: "the deploy runbook says",
          document: { id: "d1", title: "Deploy", publishedAt: "2026-01-01" },
        },
      ],
      pagination: { offset: 0, limit: 15 },
    });

    const { hits } = await searchDocuments(config, { query: "deploy" });
    assert.strictEqual(calls[0].body.query, "deploy");
    assert.strictEqual(calls[0].body.limit, 15);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].document.title, "Deploy");
    assert.strictEqual(hits[0].context, "the deploy runbook says");
  });

  it("listDocuments switches to documents.drafts", async () => {
    stubFetch(200, { ok: true, data: [] });
    await listDocuments(config, { drafts: true, parentDocumentId: "ignored" });
    assert.strictEqual(calls[0].url.endsWith("/api/documents.drafts"), true);
    assert.strictEqual(calls[0].body.parentDocumentId, undefined);
  });

  it("getDocument turns a 404 into OutlineNotFoundError", async () => {
    stubFetch(404, { ok: false, error: "not_found" });
    await assert.rejects(
      () => getDocument(config, "missing"),
      (err: Error) => {
        assert.ok(err instanceof OutlineNotFoundError);
        return true;
      },
    );
  });

  it("updateDocument forwards publish", async () => {
    stubFetch(200, { ok: true, data: { id: "d1", title: "T", text: "" } });
    await updateDocument(config, { id: "d1", publish: true });
    assert.strictEqual(calls[0].body.publish, true);
  });

  it("documentLifecycle only sends permanent for delete", async () => {
    stubFetch(200, { ok: true, data: { id: "d1", title: "T" } });
    await documentLifecycle(config, "archive", { id: "d1", permanent: true });
    assert.strictEqual(calls[0].body.permanent, undefined);

    stubFetch(200, { ok: true, data: null });
    await documentLifecycle(config, "delete", { id: "d1", permanent: true });
    assert.strictEqual(calls[0].body.permanent, true);
  });

  it("createComment sends both text and rich-text data", async () => {
    stubFetch(200, { ok: true, data: { id: "c1", text: "hi" } });
    await createComment(config, { documentId: "d1", text: "hi" });
    assert.strictEqual(calls[0].body.text, "hi");
    assert.strictEqual(calls[0].body.data.type, "doc");
  });

  it("listCollections maps names and ids", async () => {
    stubFetch(200, {
      ok: true,
      data: [{ id: "c1", name: "Engineering", description: "stuff" }],
    });
    const { collections } = await listCollections(config);
    assert.strictEqual(collections[0].name, "Engineering");
    assert.strictEqual(collections[0].id, "c1");
  });

  it("exportDocument returns the markdown string", async () => {
    stubFetch(200, { ok: true, data: "# Title\n\nbody" });
    assert.strictEqual(await exportDocument(config, "d1"), "# Title\n\nbody");
  });
});

describe("mapping", () => {
  it("falls back to Untitled for an empty title", () => {
    assert.strictEqual(toDocumentSummary({ id: "a", title: "" }).title, "Untitled");
  });

  it("normalizes missing fields to null rather than undefined", () => {
    const doc = toDocumentSummary({ id: "a", title: "T" });
    assert.strictEqual(doc.collectionId, null);
    assert.strictEqual(doc.archivedAt, null);
  });

  it("keeps the markdown body in toDocumentDetail", () => {
    const doc = toDocumentDetail({ id: "a", title: "T", text: "# hi" });
    assert.strictEqual(doc.text, "# hi");
  });

  it("defaults a missing body to an empty string", () => {
    assert.strictEqual(toDocumentDetail({ id: "a", title: "T" }).text, "");
  });

  it("maps navigation nodes recursively", () => {
    const node = toNavigationNode({
      id: "1",
      title: "Root",
      children: [{ id: "2", title: "Child", children: [] }],
    });
    assert.strictEqual(node.children.length, 1);
    assert.strictEqual(node.children[0].title, "Child");
  });
});

describe("flattenRichText", () => {
  it("returns a plain string unchanged", () => {
    assert.strictEqual(flattenRichText("hello"), "hello");
  });

  it("returns an empty string for nullish input", () => {
    assert.strictEqual(flattenRichText(undefined), "");
    assert.strictEqual(flattenRichText(null), "");
  });

  it("flattens a ProseMirror paragraph", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    assert.strictEqual(flattenRichText(doc).trim(), "Hello world");
  });

  it("separates block nodes by newline", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
      ],
    };
    assert.strictEqual(flattenRichText(doc), "one\ntwo\n");
  });

  it("prefers a server-provided text field in toComment", () => {
    const comment = toComment({ id: "c1", text: "plain", data: { type: "doc" } });
    assert.strictEqual(comment.text, "plain");
  });

  it("falls back to the rich-text body in toComment", () => {
    const comment = toComment({
      id: "c1",
      data: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "rich" }] }],
      },
    });
    assert.strictEqual(comment.text, "rich");
  });
});

describe("slugifyTitle", () => {
  it("lowercases and hyphenates", () => {
    assert.strictEqual(slugifyTitle("Deploy Runbook"), "deploy-runbook");
  });

  it("strips German umlauts to ascii", () => {
    assert.strictEqual(slugifyTitle("Übersicht Prüfung"), "ubersicht-prufung");
  });

  it("drops punctuation and collapses separators", () => {
    assert.strictEqual(slugifyTitle("What?! Now -- really"), "what-now-really");
  });

  it("falls back to 'document' for a title with no usable characters", () => {
    assert.strictEqual(slugifyTitle("???"), "document");
  });

  it("caps the length", () => {
    assert.ok(slugifyTitle("a".repeat(200)).length <= 80);
  });
});

describe("writeMarkdownFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-outline-export-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the file and returns its absolute path", () => {
    const written = writeMarkdownFile(dir, "page.md", "# hi");
    assert.strictEqual(written, path.join(dir, "page.md"));
    assert.strictEqual(fs.readFileSync(written, "utf-8"), "# hi");
  });

  it("creates the directory when missing", () => {
    const nested = path.join(dir, "docs", "wiki");
    const written = writeMarkdownFile(nested, "page.md", "x");
    assert.ok(fs.existsSync(written));
  });

  it("refuses a file name that escapes the target directory", () => {
    assert.throws(
      () => writeMarkdownFile(dir, "../escaped.md", "x"),
      /Refusing to write outside/,
    );
  });
});
