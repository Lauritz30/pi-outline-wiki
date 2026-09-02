/**
 * outline_setup tool -- Configure an Outline workspace.
 *
 * Stores a named profile. A profile is automatically set as active
 * if it's the first one. Use outline_status to see all profiles and
 * outline_profile to switch between them.
 */

import { Type } from "typebox";
import { saveProfile, normalizeBaseUrl, resolveConfig } from "../config.ts";
import { getWorkspaceInfo } from "../clients/outline-client.ts";
import { formatWorkspaceInfo } from "../formatting/formatters.ts";
import type { OutlineConfig, SetupParams } from "../types.ts";

export const OutlineSetupTool = {
  name: "outline_setup",
  label: "Outline Setup",
  description:
    "Configure an Outline workspace (URL + API key). Call this first before using any other outline tool. The API key is created in Outline under Settings -> API & Apps and starts with 'ol_api_'. Credentials are stored in ~/.pi/outline-config.json (readable only by you). Works with both cloud (yourteam.getoutline.com) and self-hosted installations.",
  parameters: Type.Object({
    name: Type.String({
      description:
        "Profile name, e.g. 'work', 'company-wiki'. Use a short, memorable name.",
    }),
    url: Type.String({
      description:
        "Workspace URL, e.g. https://acme.getoutline.com or https://wiki.example.com. A trailing /api or /mcp is stripped automatically.",
    }),
    apiKey: Type.String({
      description: "Outline API key from Settings -> API & Apps (starts with ol_api_).",
    }),
    insecureTls: Type.Optional(
      Type.Boolean({
        description:
          "Skip TLS certificate validation. Only for self-hosted instances with a self-signed certificate; this disables validation for the whole pi process.",
      }),
    ),
  }),

  async execute(_toolCallId: string, params: SetupParams, signal: AbortSignal) {
    const config: OutlineConfig = {
      url: normalizeBaseUrl(params.url),
      apiKey: params.apiKey.trim(),
      ...(params.insecureTls !== undefined && { insecureTls: params.insecureTls }),
    };

    saveProfile(params.name, config);

    // Verify immediately: a typo in the URL or key is much cheaper to find
    // here than inside the first real document call.
    let verification: string;
    let verified = false;
    try {
      const info = await getWorkspaceInfo(resolveConfig(params.name), signal);
      verification = formatWorkspaceInfo(info);
      verified = true;
    } catch (err) {
      verification = `Saved, but the connection test failed: ${(err as Error).message}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Outline profile "${params.name}" saved and set as active (${config.url}).\n\n${verification}`,
        },
      ],
      details: { profileName: params.name, url: config.url, verified },
    };
  },
};
