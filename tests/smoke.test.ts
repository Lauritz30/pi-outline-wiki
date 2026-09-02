/**
 * Smoke test -- verifies all 16 tools have the correct shape
 * and that the core modules export what index.ts imports.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { OutlineSetupTool } from "../src/tools/outline-setup.ts";
import { OutlineStatusTool } from "../src/tools/outline-status.ts";
import { OutlineProfileTool } from "../src/tools/outline-profile.ts";
import { OutlineCollectionsTool } from "../src/tools/outline-collections.ts";
import { OutlineStructureTool } from "../src/tools/outline-structure.ts";
import { OutlineSearchTool } from "../src/tools/outline-search.ts";
import { OutlineListTool } from "../src/tools/outline-list.ts";
import { OutlineReadTool } from "../src/tools/outline-read.ts";
import { OutlineCreateTool } from "../src/tools/outline-create.ts";
import { OutlineUpdateTool } from "../src/tools/outline-update.ts";
import { OutlineMoveTool } from "../src/tools/outline-move.ts";
import { OutlineArchiveTool } from "../src/tools/outline-archive.ts";
import { OutlineDeleteTool } from "../src/tools/outline-delete.ts";
import { OutlineCommentsTool } from "../src/tools/outline-comments.ts";
import { OutlineCommentTool } from "../src/tools/outline-comment.ts";
import { OutlineExportTool } from "../src/tools/outline-export.ts";

const allTools = [
  OutlineSetupTool,
  OutlineStatusTool,
  OutlineProfileTool,
  OutlineCollectionsTool,
  OutlineStructureTool,
  OutlineSearchTool,
  OutlineListTool,
  OutlineReadTool,
  OutlineCreateTool,
  OutlineUpdateTool,
  OutlineMoveTool,
  OutlineArchiveTool,
  OutlineDeleteTool,
  OutlineCommentsTool,
  OutlineCommentTool,
  OutlineExportTool,
];

describe("Tool structure smoke test", () => {
  it("has exactly 16 tools", () => {
    assert.strictEqual(allTools.length, 16);
  });

  for (const tool of allTools) {
    it(`${tool.name} has required fields`, () => {
      assert.ok(tool.name);
      assert.strictEqual(typeof tool.name, "string");
      assert.ok(tool.label);
      assert.strictEqual(typeof tool.label, "string");
      assert.ok(tool.description);
      assert.strictEqual(typeof tool.description, "string");
      assert.ok(tool.parameters !== undefined);
      assert.strictEqual(typeof tool.execute, "function");
    });
  }

  it("all tool names are unique", () => {
    const names = allTools.map((t) => t.name);
    assert.strictEqual(new Set(names).size, names.length);
  });

  it("all tool names follow the outline_ prefix convention", () => {
    for (const tool of allTools) {
      assert.ok(/^outline_/.test(tool.name), `${tool.name} lacks the prefix`);
    }
  });

  it("every description explains when to use the tool", () => {
    for (const tool of allTools) {
      assert.ok(
        tool.description.length > 40,
        `${tool.name} has a description that is too terse`,
      );
    }
  });
});

describe("Config module", () => {
  it("exports the functions index.ts and the tools rely on", async () => {
    const mod = await import("../src/config.ts");
    assert.strictEqual(typeof mod.loadConfig, "function");
    assert.strictEqual(typeof mod.getConfig, "function");
    assert.strictEqual(typeof mod.resolveConfig, "function");
    assert.strictEqual(typeof mod.saveProfile, "function");
    assert.strictEqual(typeof mod.getProfiles, "function");
    assert.strictEqual(typeof mod.getActiveProfile, "function");
    assert.strictEqual(typeof mod.setActiveProfile, "function");
    assert.strictEqual(typeof mod.deleteProfile, "function");
    assert.strictEqual(typeof mod.normalizeBaseUrl, "function");
  });
});

describe("Extension entry point", () => {
  it("registers every tool and command without errors", async () => {
    const registered: string[] = [];
    const commands: string[] = [];
    const mod = await import("../index.ts");

    mod.default({
      registerTool: (tool: { name: string }) => registered.push(tool.name),
      registerCommand: (name: string) => commands.push(name),
      sendUserMessage: () => {},
    } as any);

    assert.deepStrictEqual(
      registered.sort(),
      allTools.map((t) => t.name).sort(),
    );
    assert.deepStrictEqual(commands.sort(), ["wiki", "wiki-capture"]);
  });
});

describe("Skills", () => {
  it("ships a SKILL.md with valid frontmatter for every skill", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const skillsDir = path.join(import.meta.dirname, "..", "skills");
    const names = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    assert.ok(names.length >= 3, "expected at least three skills");

    for (const name of names) {
      const file = path.join(skillsDir, name, "SKILL.md");
      assert.ok(fs.existsSync(file), `${name} has no SKILL.md`);

      const content = fs.readFileSync(file, "utf-8");
      assert.ok(content.startsWith("---\n"), `${name} has no frontmatter`);

      const frontmatter = content.slice(4, content.indexOf("\n---", 4));
      const declaredName = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();

      assert.strictEqual(declaredName, name, `${name}: frontmatter name mismatch`);
      assert.match(declaredName!, /^[a-z0-9-]{1,64}$/, `${name}: invalid skill name`);
      assert.ok(description, `${name}: missing description`);
      assert.ok(
        description!.length <= 1024,
        `${name}: description exceeds 1024 characters`,
      );
    }
  });
});
