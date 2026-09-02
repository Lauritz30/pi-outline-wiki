/**
 * Tool-level tests: argument validation and the behaviour that lives in the
 * tools themselves (append/prepend assembly, move targets, guard rails).
 * HTTP is stubbed, so nothing here talks to a real workspace.
 */
import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { OutlineSearchTool } from "../src/tools/outline-search.ts";
import { OutlineListTool } from "../src/tools/outline-list.ts";
import { OutlineCreateTool } from "../src/tools/outline-create.ts";
import { OutlineUpdateTool } from "../src/tools/outline-update.ts";
import { OutlineMoveTool } from "../src/tools/outline-move.ts";
import { OutlineArchiveTool } from "../src/tools/outline-archive.ts";
import { OutlineDeleteTool } from "../src/tools/outline-delete.ts";
import { OutlineCommentTool } from "../src/tools/outline-comment.ts";
import { OutlineExportTool } from "../src/tools/outline-export.ts";
import { OutlineProfileTool } from "../src/tools/outline-profile.ts";
import { OutlineReadTool } from "../src/tools/outline-read.ts";
import { OutlineSetupTool } from "../src/tools/outline-setup.ts";
import { OutlineStatusTool } from "../src/tools/outline-status.ts";
import { OutlineCollectionsTool } from "../src/tools/outline-collections.ts";
import { OutlineStructureTool } from "../src/tools/outline-structure.ts";
import { OutlineCommentsTool } from "../src/tools/outline-comments.ts";
import { saveProfile, _resetForTesting } from "../src/config.ts";

const testHome = path.join(os.tmpdir(), "pi-outline-tools-" + Date.now());
const signal = new AbortController().signal;

type Call = { method: string; body: any };
const originalFetch = globalThis.fetch;
let calls: Call[] = [];

/** Reply to each API method with a canned payload. */
function stubApi(responses: Record<string, unknown>) {
  calls = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const method = String(url).split("/api/")[1];
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, body });
    const payload = responses[method];
    if (payload === undefined) {
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ ok: false, message: `no stub for ${method}` }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, data: payload }),
    } as unknown as Response;
  }) as typeof fetch;
}

function lastCall(method: string): Call | undefined {
  return [...calls].reverse().find((call) => call.method === method);
}

const docPayload = {
  id: "doc-1",
  title: "Deploy Runbook",
  text: "Existing body.",
  collectionId: "col-1",
  publishedAt: "2026-01-01T00:00:00.000Z",
  url: "https://acme.getoutline.com/doc/deploy-runbook-abc",
};

before(() => {
  fs.mkdirSync(path.join(testHome, ".pi"), { recursive: true, mode: 0o700 });
  process.env.HOME = testHome;
  _resetForTesting();
  saveProfile("test", {
    url: "https://acme.getoutline.com",
    apiKey: "ol_api_test",
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("outline_search validation", () => {
  it("rejects an empty query", async () => {
    await assert.rejects(
      () => OutlineSearchTool.execute("1", { query: "   " }, signal),
      /must not be empty/,
    );
  });

  it("rejects an unknown statusFilter value", async () => {
    await assert.rejects(
      () => OutlineSearchTool.execute("1", { query: "x", statusFilter: ["deleted"] }, signal),
      /Invalid statusFilter/,
    );
  });

  it("rejects an unknown dateFilter value", async () => {
    await assert.rejects(
      () => OutlineSearchTool.execute("1", { query: "x", dateFilter: "hour" }, signal),
      /Invalid dateFilter/,
    );
  });

  it("passes filters through and reports the hits", async () => {
    stubApi({
      "documents.search": [
        { ranking: 1, context: "snippet", document: docPayload },
      ],
    });
    const result = await OutlineSearchTool.execute(
      "1",
      { query: " deploy ", collectionId: "col-1", statusFilter: ["published"] },
      signal,
    );
    assert.strictEqual(lastCall("documents.search")?.body.query, "deploy");
    assert.strictEqual(lastCall("documents.search")?.body.collectionId, "col-1");
    assert.strictEqual(result.details.count, 1);
    assert.match(result.content[0].text, /Deploy Runbook/);
  });
});

describe("outline_list validation", () => {
  it("rejects an unknown sort field", async () => {
    await assert.rejects(
      () => OutlineListTool.execute("1", { sort: "size" }, signal),
      /Invalid sort/,
    );
  });

  it("rejects a bad direction", async () => {
    await assert.rejects(
      () => OutlineListTool.execute("1", { direction: "sideways" }, signal),
      /Invalid direction/,
    );
  });

  it("labels drafts in the heading", async () => {
    stubApi({ "documents.drafts": [] });
    const result = await OutlineListTool.execute("1", { drafts: true }, signal);
    assert.match(result.content[0].text, /^Drafts: nothing found/);
  });
});

describe("outline_create", () => {
  it("rejects an empty title", async () => {
    await assert.rejects(
      () => OutlineCreateTool.execute("1", { title: "  ", collectionId: "c" }, signal),
      /title must not be empty/,
    );
  });

  it("refuses to publish without a destination", async () => {
    await assert.rejects(
      () => OutlineCreateTool.execute("1", { title: "New page" }, signal),
      /collectionId or a parentDocumentId/,
    );
  });

  it("allows an unpublished draft without a destination", async () => {
    stubApi({ "documents.create": { ...docPayload, publishedAt: null } });
    const result = await OutlineCreateTool.execute(
      "1",
      { title: "New page", publish: false },
      signal,
    );
    assert.strictEqual(lastCall("documents.create")?.body.publish, false);
    assert.strictEqual(result.details.published, false);
  });
});

describe("outline_update", () => {
  it("rejects an unknown mode", async () => {
    await assert.rejects(
      () => OutlineUpdateTool.execute("1", { id: "doc-1", text: "x", mode: "patch" }, signal),
      /Invalid mode/,
    );
  });

  it("refuses a no-op update", async () => {
    await assert.rejects(
      () => OutlineUpdateTool.execute("1", { id: "doc-1" }, signal),
      /Nothing to update/,
    );
  });

  it("replaces the body without reading it first", async () => {
    stubApi({ "documents.update": { ...docPayload, text: "New body." } });
    await OutlineUpdateTool.execute("1", { id: "doc-1", text: "New body." }, signal);
    assert.strictEqual(lastCall("documents.info"), undefined);
    assert.strictEqual(lastCall("documents.update")?.body.text, "New body.");
  });

  it("appends after the existing body", async () => {
    stubApi({
      "documents.info": docPayload,
      "documents.update": docPayload,
    });
    await OutlineUpdateTool.execute(
      "1",
      { id: "doc-1", text: "## Added", mode: "append" },
      signal,
    );
    assert.strictEqual(
      lastCall("documents.update")?.body.text,
      "Existing body.\n\n## Added\n",
    );
  });

  it("prepends before the existing body", async () => {
    stubApi({
      "documents.info": docPayload,
      "documents.update": docPayload,
    });
    await OutlineUpdateTool.execute(
      "1",
      { id: "doc-1", text: "Notice.", mode: "prepend" },
      signal,
    );
    assert.strictEqual(
      lastCall("documents.update")?.body.text,
      "Notice.\n\nExisting body.",
    );
  });

  it("publishes a draft without touching the body", async () => {
    stubApi({ "documents.update": docPayload });
    await OutlineUpdateTool.execute("1", { id: "doc-1", publish: true }, signal);
    assert.strictEqual(lastCall("documents.update")?.body.publish, true);
    assert.strictEqual(lastCall("documents.update")?.body.text, undefined);
  });
});

describe("outline_move", () => {
  it("requires a target", async () => {
    await assert.rejects(
      () => OutlineMoveTool.execute("1", { id: "doc-1" }, signal),
      /Specify a target/,
    );
  });

  it("rejects contradictory targets", async () => {
    await assert.rejects(
      () =>
        OutlineMoveTool.execute(
          "1",
          { id: "doc-1", parentDocumentId: "p", toTopLevel: true },
          signal,
        ),
      /contradict/,
    );
  });

  it("clears the parent and keeps the current collection for toTopLevel", async () => {
    stubApi({
      "documents.info": docPayload,
      "documents.move": { documents: [docPayload] },
    });
    await OutlineMoveTool.execute("1", { id: "doc-1", toTopLevel: true }, signal);
    const body = lastCall("documents.move")?.body;
    assert.strictEqual(body.parentDocumentId, null);
    assert.strictEqual(body.collectionId, "col-1");
  });

  it("nests under a parent without an extra lookup", async () => {
    stubApi({ "documents.move": { documents: [] } });
    await OutlineMoveTool.execute("1", { id: "doc-1", parentDocumentId: "p1" }, signal);
    assert.strictEqual(lastCall("documents.info"), undefined);
    assert.strictEqual(lastCall("documents.move")?.body.parentDocumentId, "p1");
  });
});

describe("outline_archive", () => {
  it("rejects an unknown action", async () => {
    await assert.rejects(
      () => OutlineArchiveTool.execute("1", { id: "doc-1", action: "burn" }, signal),
      /Unknown action/,
    );
  });

  it("accepts unarchive as an alias for restore", async () => {
    stubApi({ "documents.restore": docPayload });
    const result = await OutlineArchiveTool.execute(
      "1",
      { id: "doc-1", action: "unarchive" },
      signal,
    );
    assert.strictEqual(result.details.action, "restore");
    assert.match(result.content[0].text, /restored/);
  });

  it("archives by default", async () => {
    stubApi({ "documents.archive": docPayload });
    const result = await OutlineArchiveTool.execute("1", { id: "doc-1" }, signal);
    assert.match(result.content[0].text, /archived/);
  });
});

describe("outline_delete", () => {
  it("trashes by default and explains how to restore", async () => {
    stubApi({ "documents.info": docPayload, "documents.delete": null });
    const result = await OutlineDeleteTool.execute("1", { id: "doc-1" }, signal);
    assert.strictEqual(lastCall("documents.delete")?.body.permanent, undefined);
    assert.match(result.content[0].text, /trash/);
    assert.match(result.content[0].text, /restore/);
  });

  it("warns that permanent deletion cannot be undone", async () => {
    stubApi({ "documents.info": docPayload, "documents.delete": null });
    const result = await OutlineDeleteTool.execute(
      "1",
      { id: "doc-1", permanent: true },
      signal,
    );
    assert.strictEqual(lastCall("documents.delete")?.body.permanent, true);
    assert.match(result.content[0].text, /cannot be undone/);
  });
});

describe("outline_comment", () => {
  it("rejects empty text", async () => {
    await assert.rejects(
      () => OutlineCommentTool.execute("1", { documentId: "doc-1", text: " " }, signal),
      /must not be empty/,
    );
  });

  it("labels a threaded reply", async () => {
    stubApi({ "comments.create": { id: "c2", text: "ok" } });
    const result = await OutlineCommentTool.execute(
      "1",
      { documentId: "doc-1", text: "ok", parentCommentId: "c1" },
      signal,
    );
    assert.match(result.content[0].text, /^Reply posted/);
    assert.strictEqual(lastCall("comments.create")?.body.parentCommentId, "c1");
  });
});

describe("outline_read", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-outline-read-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves the untruncated body to a file", async () => {
    stubApi({ "documents.info": { ...docPayload, text: "y".repeat(300) } });
    const result = await OutlineReadTool.execute(
      "1",
      { id: "doc-1", maxChars: 50, saveDir: dir },
      signal,
    );
    assert.strictEqual(result.details.truncated, true);
    const saved = fs.readFileSync(result.details.savedPath!, "utf-8");
    assert.ok(saved.includes("y".repeat(300)));
    assert.match(saved, /^# Deploy Runbook/);
  });
});

describe("outline_export", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-outline-exp-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("requires exactly one source", async () => {
    await assert.rejects(
      () => OutlineExportTool.execute("1", { targetDir: dir }, signal),
      /either documentId or collectionId/,
    );
    await assert.rejects(
      () =>
        OutlineExportTool.execute(
          "1",
          { targetDir: dir, documentId: "d", collectionId: "c" },
          signal,
        ),
      /not both/,
    );
  });

  it("writes one markdown file per document in a collection", async () => {
    stubApi({
      "collections.documents": [
        { id: "d1", title: "Overview", children: [{ id: "d2", title: "Deploy", children: [] }] },
      ],
      "documents.export": "# content",
    });
    const result = await OutlineExportTool.execute(
      "1",
      { targetDir: dir, collectionId: "col-1" },
      signal,
    );
    assert.strictEqual(result.details.writtenCount, 2);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["deploy.md", "overview.md"]);
  });

  it("respects the limit and reports what was skipped", async () => {
    stubApi({
      "collections.documents": [
        { id: "d1", title: "One", children: [] },
        { id: "d2", title: "Two", children: [] },
      ],
      "documents.export": "x",
    });
    const result = await OutlineExportTool.execute(
      "1",
      { targetDir: dir, collectionId: "col-1", limit: 1 },
      signal,
    );
    assert.strictEqual(result.details.writtenCount, 1);
    assert.strictEqual(result.details.skipped, 1);
  });

  it("keeps both files when two pages share a title", async () => {
    stubApi({
      "collections.documents": [
        { id: "aaaaaaaa-1111", title: "Overview", children: [] },
        { id: "bbbbbbbb-2222", title: "Overview", children: [] },
      ],
      "documents.export": "x",
    });
    const result = await OutlineExportTool.execute(
      "1",
      { targetDir: dir, collectionId: "col-1" },
      signal,
    );
    assert.strictEqual(result.details.writtenCount, 2);
    assert.strictEqual(fs.readdirSync(dir).length, 2);
  });
});

describe("outline_profile", () => {
  it("lists profiles without arguments", () => {
    const result = OutlineProfileTool.execute("1", {}, signal);
    assert.match(result.content[0].text, /test/);
    assert.deepStrictEqual(result.details.profiles, ["test"]);
  });

  it("requires a name for use and delete", () => {
    assert.throws(
      () => OutlineProfileTool.execute("1", { action: "use" }, signal),
      /requires a profile name/,
    );
  });

  it("rejects an unknown action", () => {
    assert.throws(
      () => OutlineProfileTool.execute("1", { action: "rename", name: "x" }, signal),
      /Unknown action/,
    );
  });

  it("reports a missing profile on delete", () => {
    const result = OutlineProfileTool.execute("1", { action: "delete", name: "ghost" }, signal);
    assert.strictEqual(result.details.deleted, false);
  });
});

// Appended last: outline_setup writes a second profile, and the profile tests
// above assert on the exact profile list.
describe("outline_setup", () => {
  it("normalizes the url, saves the profile and verifies the connection", async () => {
    stubApi({
      "auth.info": {
        user: { name: "Pat", email: "pat@acme.test" },
        team: { name: "Acme", url: "https://acme.getoutline.com" },
      },
    });
    const result = await OutlineSetupTool.execute(
      "1",
      { name: "verified", url: "acme.getoutline.com/api/", apiKey: " ol_api_x " },
      signal,
    );
    assert.strictEqual(result.details.url, "https://acme.getoutline.com");
    assert.strictEqual(result.details.verified, true);
    assert.match(result.content[0].text, /Workspace: Acme/);
    assert.strictEqual(calls[0].body && Object.keys(calls[0].body).length, 0);
  });

  it("still saves the profile when the connection test fails", async () => {
    stubApi({});
    const result = await OutlineSetupTool.execute(
      "1",
      { name: "broken", url: "https://wrong.example.com", apiKey: "ol_api_y" },
      signal,
    );
    assert.strictEqual(result.details.verified, false);
    assert.match(result.content[0].text, /connection test failed/);
  });
});

describe("outline_status", () => {
  it("reports the profiles and a working connection", async () => {
    stubApi({
      "auth.info": { user: { name: "Pat" }, team: { name: "Acme" } },
    });
    const result = await OutlineStatusTool.execute("1", { profile: "test" }, signal);
    assert.strictEqual(result.details.configured, true);
    assert.strictEqual(result.details.reachable, true);
    assert.match(result.content[0].text, /Outline profiles/);
  });

  it("does not throw when the workspace is unreachable", async () => {
    stubApi({});
    const result = await OutlineStatusTool.execute("1", { profile: "test" }, signal);
    assert.strictEqual(result.details.reachable, false);
    assert.match(result.content[0].text, /Connection test failed/);
  });
});

describe("outline_collections and outline_structure", () => {
  it("lists collections with ids", async () => {
    stubApi({ "collections.list": [{ id: "col-1", name: "Engineering" }] });
    const result = await OutlineCollectionsTool.execute("1", {}, signal);
    assert.strictEqual(result.details.count, 1);
    assert.match(result.content[0].text, /Engineering \(id col-1\)/);
  });

  it("renders the tree and counts nested documents", async () => {
    stubApi({
      "collections.documents": [
        { id: "d1", title: "Runbooks", children: [{ id: "d2", title: "Deploy", children: [] }] },
      ],
      "collections.list": [{ id: "col-1", name: "Engineering" }],
    });
    const result = await OutlineStructureTool.execute("1", { collectionId: "col-1" }, signal);
    assert.strictEqual(result.details.totalCount, 2);
    assert.strictEqual(result.details.collectionName, "Engineering");
    assert.match(result.content[0].text, /Deploy \(id d2\)/);
  });

  it("still renders the tree when the collection name cannot be resolved", async () => {
    stubApi({ "collections.documents": [{ id: "d1", title: "Runbooks", children: [] }] });
    const result = await OutlineStructureTool.execute("1", { collectionId: "col-1" }, signal);
    assert.strictEqual(result.details.collectionName, undefined);
    assert.match(result.content[0].text, /Runbooks/);
  });
});

describe("outline_comments", () => {
  it("counts unresolved threads", async () => {
    stubApi({
      "comments.list": [
        { id: "c1", text: "open question" },
        { id: "c2", text: "done", resolvedAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
    const result = await OutlineCommentsTool.execute("1", { documentId: "doc-1" }, signal);
    assert.strictEqual(result.details.count, 2);
    assert.strictEqual(result.details.unresolved, 1);
  });
});
