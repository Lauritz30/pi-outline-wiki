/**
 * Configuration persistence and state.
 *
 * Stores named Outline workspace profiles in ~/.pi/outline-config.json.
 * Supports multiple profiles with an active profile selector.
 *
 * File format:
 *   { "profiles": { "name": OutlineConfig, ... }, "activeProfile": "name" }
 *
 * Backward-compatible: a flat { url, apiKey } object is migrated to
 * { profiles: { "default": ... }, activeProfile: "default" }.
 */

import type { OutlineConfig, OutlineProfiles } from "./types.ts";
import { OutlineNotConfiguredError } from "./types.ts";
import * as fs from "node:fs";
import * as path from "node:path";

// Mutable state

let profiles: Record<string, OutlineConfig> = {};
let activeProfile: string | null = null;

// Path resolution

function configPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return path.join(home, ".pi", "outline-config.json");
}

// URL normalisation

/**
 * Accepts what people actually paste: a bare host, a URL with a trailing
 * slash, the `/api` base, or the `/mcp` endpoint from Outline's MCP docs.
 * Returns the workspace root without a trailing slash.
 */
export function normalizeBaseUrl(raw: string): string {
  let url = String(raw ?? "").trim();
  if (!url) {
    throw new Error("Workspace URL must not be empty.");
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/(api|mcp)$/i, "");
  url = url.replace(/\/+$/, "");

  try {
    // Throws on malformed input, so setup fails loudly instead of at call time.
    new URL(url);
  } catch {
    throw new Error(`"${raw}" is not a valid workspace URL.`);
  }
  return url;
}

// Persistence

/**
 * Write the profile store.
 *
 * The file holds a plaintext API key, so it must never be group- or
 * world-readable. writeFileSync's `mode` only applies when the file is
 * created, so an existing file keeps its old (possibly 0644) permissions --
 * we therefore write to a private temp file and rename it into place. That
 * is also atomic, so a crash mid-write cannot truncate the config.
 */
function persistProfiles(): void {
  const filePath = configPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const data: OutlineProfiles = { profiles, activeProfile };
  const tmpPath = `${filePath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function loadConfig(): void {
  try {
    const filePath = configPath();
    if (!fs.existsSync(filePath)) {
      profiles = {};
      activeProfile = null;
      return;
    }

    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Tighten permissions on config files written by older versions.
    try {
      const mode = fs.statSync(filePath).mode & 0o777;
      if (mode !== 0o600) fs.chmodSync(filePath, 0o600);
    } catch {
      /* ignore */
    }

    if (raw && typeof raw === "object" && raw.apiKey && !("profiles" in raw)) {
      profiles = { default: raw as OutlineConfig };
      activeProfile = "default";
      persistProfiles();
      return;
    }

    if (raw && typeof raw === "object" && raw.profiles) {
      profiles = raw.profiles;
      if (raw.activeProfile && profiles[raw.activeProfile]) {
        activeProfile = raw.activeProfile;
      } else if (Object.keys(profiles).length > 0) {
        activeProfile = Object.keys(profiles)[0];
      } else {
        activeProfile = null;
      }
    }
  } catch {
    profiles = {};
    activeProfile = null;
  }
}

// Access

export function getConfig(): OutlineConfig | null {
  if (!activeProfile) return null;
  return profiles[activeProfile] ?? null;
}

export function getConfigOrThrow(): OutlineConfig {
  const config = getConfig();
  if (!config) {
    throw new OutlineNotConfiguredError();
  }
  return config;
}

export function getProfile(name: string): OutlineConfig | null {
  return profiles[name] ?? null;
}

/**
 * Resolve a profile parameter: if a name is given, return that profile
 * (or throw if not found). Otherwise, return the active profile or throw.
 */
export function resolveConfig(profileName?: string): OutlineConfig {
  if (profileName) {
    const config = getProfile(profileName);
    if (!config) {
      throw new Error(
        `Profile "${profileName}" not found. Available: ${Object.keys(profiles).join(", ") || "none"}`,
      );
    }
    return config;
  }
  return getConfigOrThrow();
}

export function getProfiles(): Record<string, OutlineConfig> {
  return { ...profiles };
}

export function getActiveProfile(): string | null {
  return activeProfile;
}

// Mutations

export function saveProfile(name: string, config: OutlineConfig): void {
  profiles[name] = { ...config, url: normalizeBaseUrl(config.url) };
  if (!activeProfile || Object.keys(profiles).length === 1) {
    activeProfile = name;
  }
  persistProfiles();
}

export function setActiveProfile(name: string): void {
  if (!profiles[name]) {
    throw new Error(
      `Profile "${name}" does not exist. Available: ${Object.keys(profiles).join(", ") || "none"}`,
    );
  }
  activeProfile = name;
  persistProfiles();
}

export function deleteProfile(name: string): boolean {
  if (!profiles[name]) return false;
  delete profiles[name];
  if (activeProfile === name) {
    const keys = Object.keys(profiles);
    activeProfile = keys.length > 0 ? keys[0] : null;
  }
  persistProfiles();
  return true;
}

/** @internal Reset state -- for testing only */
export function _resetForTesting(): void {
  profiles = {};
  activeProfile = null;
}
