import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  OutlineApiError,
  OutlineNotConfiguredError,
  OutlineNotFoundError,
  UnsafeExportPathError,
} from "../src/types.ts";

describe("Error types", () => {
  it("OutlineNotConfiguredError points at outline_setup", () => {
    const err = new OutlineNotConfiguredError();
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, "OutlineNotConfiguredError");
    assert.match(err.message, /outline_setup/);
  });

  it("OutlineApiError keeps method, status and code", () => {
    const err = new OutlineApiError("documents.info", 404, "nope", "not_found");
    assert.strictEqual(err.name, "OutlineApiError");
    assert.strictEqual(err.method, "documents.info");
    assert.strictEqual(err.status, 404);
    assert.strictEqual(err.code, "not_found");
    assert.strictEqual(err.message, "nope");
  });

  it("OutlineNotFoundError suggests searching", () => {
    const err = new OutlineNotFoundError('Document "abc"');
    assert.match(err.message, /Document "abc" not found/);
    assert.match(err.message, /outline_search/);
  });

  it("UnsafeExportPathError names the offending target", () => {
    const err = new UnsafeExportPathError("../../etc/passwd");
    assert.match(err.message, /\.\.\/\.\.\/etc\/passwd/);
  });
});
