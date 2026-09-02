/**
 * outline_status tool -- Show configuration status and verify the connection.
 */

import { Type } from "typebox";
import { getProfiles, getActiveProfile, resolveConfig } from "../config.ts";
import { getWorkspaceInfo, isTlsValidationDisabled } from "../clients/outline-client.ts";
import { formatProfileStatus, formatWorkspaceInfo } from "../formatting/formatters.ts";

export const OutlineStatusTool = {
  name: "outline_status",
  label: "Outline Status",
  description:
    "Show which Outline workspaces are configured and verify that the active API key still works.",
  parameters: Type.Object({
    profile: Type.Optional(
      Type.String({ description: "Profile to verify. Defaults to the active one." }),
    ),
  }),

  async execute(
    _toolCallId: string,
    params: { profile?: string },
    signal: AbortSignal,
  ) {
    const allProfiles = getProfiles();
    const active = getActiveProfile();
    const overview = formatProfileStatus(allProfiles, active);

    if (Object.keys(allProfiles).length === 0) {
      return {
        content: [{ type: "text" as const, text: overview }],
        details: { configured: false, profileCount: 0, activeProfile: null },
      };
    }

    let connection: string;
    let reachable = false;
    try {
      const info = await getWorkspaceInfo(resolveConfig(params.profile), signal);
      connection = formatWorkspaceInfo(info);
      reachable = true;
    } catch (err) {
      connection = `Connection test failed: ${(err as Error).message}`;
    }

    const warning = isTlsValidationDisabled()
      ? "\n\nWarning: TLS certificate validation is disabled in this pi process."
      : "";

    return {
      content: [
        { type: "text" as const, text: `${overview}\n\n${connection}${warning}` },
      ],
      details: {
        configured: true,
        profileCount: Object.keys(allProfiles).length,
        activeProfile: active,
        profiles: Object.keys(allProfiles),
        reachable,
      },
    };
  },
};
