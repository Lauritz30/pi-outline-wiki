import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatCollectionList,
  formatCollectionStructure,
  formatComments,
  formatDocument,
  formatDocumentList,
  formatDocumentSaved,
  formatMultiSearchResults,
  formatProfileStatus,
  formatSearchResults,
  formatWorkspaceInfo,
  maskApiKey,
} from "../src/formatting/formatters.ts";
import type { DocumentDetail, DocumentSummary } from "../src/types.ts";

const doc: DocumentSummary = {
  id: "doc-1",
  title: "Deploy Runbook",
  url: "https://acme.getoutline.com/doc/deploy-runbook-abc",
  collectionId: "col-1",
  parentDocumentId: null,
  updatedAt: "2026-08-01T10:30:00.000Z",
  publishedAt: "2026-07-01T10:30:00.000Z",
  archivedAt: null,
  deletedAt: null,
  updatedBy: { name: "Pat" },
};

describe("maskApiKey", () => {
  it("shows only a prefix and the last four characters", () => {
    const masked = maskApiKey("ol_api_abcdefghijklmnop");
    assert.match(masked, /^ol_api_\.\.\.mnop$/);
  });

  it("never leaks a short key", () => {
    assert.strictEqual(maskApiKey("short"), "****");
  });

  it("handles an empty key", () => {
    assert.strictEqual(maskApiKey(""), "(none)");
  });
});

describe("formatProfileStatus", () => {
  it("points at outline_setup when nothing is configured", () => {
    assert.match(formatProfileStatus({}, null), /outline_setup/);
  });

  it("marks the active profile and masks the key", () => {
    const text = formatProfileStatus(
      {
        work: { url: "https://acme.getoutline.com", apiKey: "ol_api_abcdefghijkl" },
        private: { url: "https://wiki.example.com", apiKey: "ol_api_zzzzzzzzzzzz" },
      },
      "work",
    );
    assert.match(text, /\* work: https:\/\/acme\.getoutline\.com/);
    assert.match(text, /^ {2}private:/m);
    assert.ok(!text.includes("ol_api_abcdefghijkl"));
  });

  it("flags a profile with TLS validation disabled", () => {
    const text = formatProfileStatus(
      { local: { url: "https://wiki.local", apiKey: "ol_api_x", insecureTls: true } },
      "local",
    );
    assert.match(text, /TLS validation off/);
  });
});

describe("formatWorkspaceInfo", () => {
  it("names the workspace and the authenticated user", () => {
    const text = formatWorkspaceInfo({
      teamName: "Acme",
      teamUrl: "https://acme.getoutline.com",
      userName: "Pat",
      userEmail: "pat@acme.test",
    });
    assert.match(text, /Workspace: Acme/);
    assert.match(text, /Pat <pat@acme\.test>/);
  });
});

describe("formatCollectionList", () => {
  it("explains an empty result", () => {
    assert.match(formatCollectionList([]), /No collections found/);
  });

  it("lists names with ids", () => {
    const text = formatCollectionList([
      { id: "c1", name: "Engineering", description: "All things eng" },
    ]);
    assert.match(text, /Engineering \(id c1\)/);
    assert.match(text, /All things eng/);
  });
});

describe("formatCollectionStructure", () => {
  it("indents children under their parent", () => {
    const text = formatCollectionStructure(
      [
        {
          id: "1",
          title: "Runbooks",
          children: [{ id: "2", title: "Deploy", children: [] }],
        },
      ],
      "Engineering",
    );
    assert.match(text, /Document tree of "Engineering"/);
    assert.match(text, /^- Runbooks \(id 1\)$/m);
    assert.match(text, /^ {2}- Deploy \(id 2\)$/m);
  });

  it("reports an empty collection", () => {
    assert.match(formatCollectionStructure([], "Empty"), /has no documents/);
  });
});

describe("formatDocumentList", () => {
  it("says so when nothing was found", () => {
    assert.match(formatDocumentList([], "Drafts"), /Drafts: nothing found/);
  });

  it("shows title, id and author", () => {
    const text = formatDocumentList([doc], "Recent");
    assert.match(text, /Deploy Runbook/);
    assert.match(text, /id doc-1/);
    assert.match(text, /by Pat/);
  });

  it("marks drafts and archived documents", () => {
    const text = formatDocumentList(
      [
        { ...doc, id: "d2", publishedAt: null },
        { ...doc, id: "d3", archivedAt: "2026-01-01T00:00:00.000Z" },
      ],
      "Mixed",
    );
    assert.match(text, /\[draft\]/);
    assert.match(text, /\[archived\]/);
  });

  it("hints at pagination when the page is full", () => {
    const text = formatDocumentList([doc], "Recent", { offset: 0, limit: 1 });
    assert.match(text, /offset 1/);
  });
});

describe("formatSearchResults", () => {
  it("suggests a different query when nothing matched", () => {
    const text = formatSearchResults([], "quantum");
    assert.match(text, /No documents match "quantum"/);
  });

  it("numbers the hits and shows the snippet", () => {
    const text = formatSearchResults(
      [{ ranking: 1, context: "how   we deploy", document: doc }],
      "deploy",
    );
    assert.match(text, /1\. Deploy Runbook/);
    assert.match(text, /id doc-1/);
    assert.match(text, /how we deploy/);
  });
});

describe("formatDocument", () => {
  const detail: DocumentDetail = { ...doc, text: "Step one.\nStep two." };

  it("prints a header block and the body", () => {
    const text = formatDocument(detail);
    assert.match(text, /Title: Deploy Runbook/);
    assert.match(text, /Id: doc-1/);
    assert.match(text, /Step one\./);
  });

  it("truncates long bodies and says so", () => {
    const long: DocumentDetail = { ...detail, text: "x".repeat(500) };
    const text = formatDocument(long, { maxChars: 100 });
    assert.match(text, /truncated after 100 characters/);
    assert.ok(!text.includes("x".repeat(200)));
  });

  it("does not truncate when maxChars is 0", () => {
    const long: DocumentDetail = { ...detail, text: "x".repeat(500) };
    const text = formatDocument(long, { maxChars: 0 });
    assert.ok(!/truncated/.test(text));
  });

  it("handles an empty document", () => {
    const text = formatDocument({ ...detail, text: "" });
    assert.match(text, /no content yet/);
  });
});

describe("formatDocumentSaved", () => {
  it("reports a published document", () => {
    const text = formatDocumentSaved(doc, "created");
    assert.match(text, /created \(published\)/);
    assert.match(text, /Id: doc-1/);
  });

  it("reports a draft", () => {
    const text = formatDocumentSaved({ ...doc, publishedAt: null }, "updated");
    assert.match(text, /updated \(draft\)/);
  });
});

describe("formatComments", () => {
  it("says when a document has no comments", () => {
    assert.match(formatComments([], "doc-1"), /No comments on document doc-1/);
  });

  it("nests replies under their parent", () => {
    const text = formatComments(
      [
        {
          id: "c1",
          parentCommentId: null,
          text: "Is this still true?",
          createdAt: "2026-08-01T10:00:00.000Z",
          createdBy: { name: "Pat" },
        },
        {
          id: "c2",
          parentCommentId: "c1",
          text: "No, updated in July.",
          createdAt: "2026-08-02T10:00:00.000Z",
          createdBy: { name: "Sam" },
        },
      ],
      "doc-1",
    );
    assert.match(text, /^- Pat at/m);
    assert.match(text, /^ {2}- Sam at/m);
    assert.match(text, /No, updated in July\./);
  });

  it("marks resolved threads", () => {
    const text = formatComments(
      [{ id: "c1", text: "done", resolvedAt: "2026-08-02T00:00:00.000Z" }],
      "doc-1",
    );
    assert.match(text, /\[resolved\]/);
  });
});

describe("formatProfileStatus with several workspaces", () => {
  it("shows each workspace description on its own line", () => {
    const text = formatProfileStatus(
      {
        firma: {
          url: "https://acme.getoutline.com",
          apiKey: "ol_api_a",
          description: "internal engineering wiki",
        },
        kunde: { url: "https://wiki.kunde.de", apiKey: "ol_api_b" },
      },
      "firma",
    );
    assert.match(text, /^ {4}internal engineering wiki$/m);
  });

  it("mentions the fan-out option once more than one is configured", () => {
    const many = formatProfileStatus(
      {
        a: { url: "https://a.example.com", apiKey: "k1" },
        b: { url: "https://b.example.com", apiKey: "k2" },
      },
      "a",
    );
    assert.match(many, /allProfiles: true/);

    const one = formatProfileStatus({ a: { url: "https://a.example.com", apiKey: "k1" } }, "a");
    assert.ok(!one.includes("allProfiles"));
  });
});

describe("formatMultiSearchResults", () => {
  const hit = (id: string, title: string) => ({
    ranking: 1,
    context: "snippet here",
    document: { ...doc, id, title },
  });

  it("groups hits by workspace and warns that ids are workspace-scoped", () => {
    const text = formatMultiSearchResults(
      [
        { profile: "firma", description: "internal wiki", hits: [hit("d1", "Deploy")] },
        { profile: "kunde", hits: [hit("d2", "Rollout")] },
      ],
      "deploy",
    );
    assert.match(text, /\[firma \(internal wiki\)\] 1 result/);
    assert.match(text, /\[kunde\] 1 result/);
    assert.match(text, /profile kunde/);
    assert.match(text, /Ids are only valid within their own workspace/);
  });

  it("names the workspaces that had no match", () => {
    const text = formatMultiSearchResults(
      [
        { profile: "firma", hits: [hit("d1", "Deploy")] },
        { profile: "kunde", hits: [] },
      ],
      "deploy",
    );
    assert.match(text, /No matches in: kunde\./);
  });

  it("reports failures separately from empty results", () => {
    const text = formatMultiSearchResults(
      [
        { profile: "firma", hits: [hit("d1", "Deploy")] },
        { profile: "kunde", hits: [], error: "401 key rejected" },
      ],
      "deploy",
    );
    assert.match(text, /1 workspace\(s\) could not be searched/);
    assert.match(text, /kunde: 401 key rejected/);
    assert.ok(!/No matches in/.test(text));
  });

  it("states plainly when nothing matched anywhere", () => {
    const text = formatMultiSearchResults(
      [
        { profile: "firma", hits: [] },
        { profile: "kunde", hits: [] },
      ],
      "unicorn",
    );
    assert.match(text, /No documents match "unicorn" in any of the 2 configured workspace/);
  });
});
