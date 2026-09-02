import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OutlineConfig } from "../src/types.ts";

const testHome = path.join(os.tmpdir(), "pi-outline-test-" + Date.now());
const testConfigDir = path.join(testHome, ".pi");
const testConfigFile = path.join(testConfigDir, "outline-config.json");

const originalHome = process.env.HOME;

const sampleConfig: OutlineConfig = {
  url: "https://acme.getoutline.com",
  apiKey: "ol_api_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

const sampleConfig2: OutlineConfig = {
  url: "https://wiki.example.com",
  apiKey: "ol_api_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

async function freshConfigModule() {
  const mod = await import("../src/config.ts");
  mod._resetForTesting();
  return mod;
}

describe("config", () => {
  beforeEach(() => {
    fs.mkdirSync(testConfigDir, { recursive: true, mode: 0o700 });
    process.env.HOME = testHome;
    if (fs.existsSync(testConfigFile)) fs.unlinkSync(testConfigFile);
  });

  afterEach(() => {
    if (fs.existsSync(testConfigFile)) fs.unlinkSync(testConfigFile);
    process.env.HOME = originalHome;
  });

  describe("normalizeBaseUrl", () => {
    it("keeps a clean https url unchanged", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("https://acme.getoutline.com"),
        "https://acme.getoutline.com",
      );
    });

    it("adds https to a bare host", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("acme.getoutline.com"),
        "https://acme.getoutline.com",
      );
    });

    it("strips trailing slashes", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("https://acme.getoutline.com///"),
        "https://acme.getoutline.com",
      );
    });

    it("strips a pasted /api suffix", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("https://acme.getoutline.com/api"),
        "https://acme.getoutline.com",
      );
    });

    it("strips the /mcp endpoint suffix", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("https://acme.getoutline.com/mcp/"),
        "https://acme.getoutline.com",
      );
    });

    it("keeps http for local self-hosted instances", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.strictEqual(
        normalizeBaseUrl("http://localhost:3000/"),
        "http://localhost:3000",
      );
    });

    it("rejects an empty url", async () => {
      const { normalizeBaseUrl } = await freshConfigModule();
      assert.throws(() => normalizeBaseUrl("   "), /must not be empty/);
    });
  });

  describe("profiles", () => {
    it("saves a profile and makes the first one active", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      assert.strictEqual(mod.getActiveProfile(), "work");
      assert.deepStrictEqual(mod.getConfig(), sampleConfig);
    });

    it("normalizes the url on save", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", { ...sampleConfig, url: "acme.getoutline.com/api" });
      assert.strictEqual(mod.getConfig()?.url, "https://acme.getoutline.com");
    });

    it("keeps the first profile active when a second is added", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod.saveProfile("private", sampleConfig2);
      assert.strictEqual(mod.getActiveProfile(), "work");
      assert.deepStrictEqual(Object.keys(mod.getProfiles()).sort(), [
        "private",
        "work",
      ]);
    });

    it("switches the active profile", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod.saveProfile("private", sampleConfig2);
      mod.setActiveProfile("private");
      assert.strictEqual(mod.getActiveProfile(), "private");
      assert.strictEqual(mod.getConfig()?.url, "https://wiki.example.com");
    });

    it("refuses to activate an unknown profile", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      assert.throws(() => mod.setActiveProfile("nope"), /does not exist/);
    });

    it("deletes a profile and falls back to another", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod.saveProfile("private", sampleConfig2);
      assert.strictEqual(mod.deleteProfile("work"), true);
      assert.strictEqual(mod.getActiveProfile(), "private");
    });

    it("reports false when deleting an unknown profile", async () => {
      const mod = await freshConfigModule();
      assert.strictEqual(mod.deleteProfile("ghost"), false);
    });

    it("clears the active profile when the last one is deleted", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod.deleteProfile("work");
      assert.strictEqual(mod.getActiveProfile(), null);
      assert.strictEqual(mod.getConfig(), null);
    });
  });

  describe("resolveConfig", () => {
    it("returns the named profile", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod.saveProfile("private", sampleConfig2);
      assert.strictEqual(mod.resolveConfig("private").url, "https://wiki.example.com");
    });

    it("falls back to the active profile", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      assert.strictEqual(mod.resolveConfig().url, "https://acme.getoutline.com");
    });

    it("throws a helpful error for an unknown profile", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      assert.throws(() => mod.resolveConfig("nope"), /Available: work/);
    });

    it("throws OutlineNotConfiguredError when nothing is configured", async () => {
      const mod = await freshConfigModule();
      assert.throws(() => mod.resolveConfig(), /outline_setup/);
    });
  });

  describe("persistence", () => {
    it("writes the config file with 0600 permissions", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      assert.ok(fs.existsSync(testConfigFile));
      const mode = fs.statSync(testConfigFile).mode & 0o777;
      assert.strictEqual(mode, 0o600);
    });

    it("round-trips through loadConfig", async () => {
      const mod = await freshConfigModule();
      mod.saveProfile("work", sampleConfig);
      mod._resetForTesting();
      assert.strictEqual(mod.getConfig(), null);
      mod.loadConfig();
      assert.strictEqual(mod.getActiveProfile(), "work");
      assert.strictEqual(mod.getConfig()?.apiKey, sampleConfig.apiKey);
    });

    it("migrates a flat legacy config", async () => {
      fs.writeFileSync(testConfigFile, JSON.stringify(sampleConfig), {
        encoding: "utf-8",
        mode: 0o600,
      });
      const mod = await freshConfigModule();
      mod.loadConfig();
      assert.strictEqual(mod.getActiveProfile(), "default");
      assert.strictEqual(mod.getConfig()?.url, "https://acme.getoutline.com");

      const stored = JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      assert.ok(stored.profiles.default);
      assert.strictEqual(stored.activeProfile, "default");
    });

    it("tightens permissions of a world-readable legacy file", async () => {
      fs.writeFileSync(
        testConfigFile,
        JSON.stringify({ profiles: { work: sampleConfig }, activeProfile: "work" }),
        { encoding: "utf-8", mode: 0o644 },
      );
      fs.chmodSync(testConfigFile, 0o644);
      const mod = await freshConfigModule();
      mod.loadConfig();
      assert.strictEqual(fs.statSync(testConfigFile).mode & 0o777, 0o600);
    });

    it("repairs an activeProfile that no longer exists", async () => {
      fs.writeFileSync(
        testConfigFile,
        JSON.stringify({ profiles: { work: sampleConfig }, activeProfile: "gone" }),
        { encoding: "utf-8", mode: 0o600 },
      );
      const mod = await freshConfigModule();
      mod.loadConfig();
      assert.strictEqual(mod.getActiveProfile(), "work");
    });

    it("survives a corrupt config file", async () => {
      fs.writeFileSync(testConfigFile, "{ not json", { mode: 0o600 });
      const mod = await freshConfigModule();
      mod.loadConfig();
      assert.strictEqual(mod.getConfig(), null);
      assert.deepStrictEqual(mod.getProfiles(), {});
    });
  });
});
