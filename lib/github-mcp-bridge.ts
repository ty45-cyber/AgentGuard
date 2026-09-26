/**
 * Bridges the official GitHub MCP tool list into AgentGuard's internal types,
 * then runs each tool through the existing deterministic security engine.
 *
 * No new policy logic is introduced here. All security decisions come from
 * analyzeTool() in security-engine.ts.
 */

import type { CapabilityManifest, Tool, ToolAnalysis } from "./types";
import type { McpTool } from "./github-mcp-client";
import { analyzeTool } from "./security-engine";
import crypto from "node:crypto";

const MCP_AGENT_ID = "agent-github-mcp";
const MCP_PUBLISHER = "GitHub (official MCP server)";
const MCP_ENDPOINT_BASE = "https://api.githubcopilot.com/mcp/";

/** Derive a stable deterministic digest from a tool's name + schema. */
function toolDigest(tool: McpTool): string {
  const payload = JSON.stringify({ name: tool.name, schema: tool.inputSchema ?? {} });
  return "sha256:" + crypto.createHash("sha256").update(payload).digest("hex").slice(0, 8) + "…live";
}

/**
 * Infer minimal AgentGuard permissions from an MCP tool's name and schema.
 * This is a best-effort heuristic. All results flow through the existing AG rules.
 */
function inferPermissions(tool: McpTool): string[] {
  const n = tool.name.toLowerCase();
  const perms: string[] = [];

  if (n.includes("delete") || n.includes("remove"))        perms.push("delete:repo");
  if (n.includes("create") || n.includes("update") || n.includes("push") ||
      n.includes("merge")  || n.includes("edit")   || n.includes("add"))   perms.push("write:repo");
  if (n.includes("pr") || n.includes("pull_request"))       perms.push("write:pr");
  if (n.includes("run") || n.includes("trigger") || n.includes("dispatch")) perms.push("exec:workflow");
  if (n.includes("secret"))                                  perms.push("read:secrets");
  if (perms.length === 0)                                    perms.push("read:repo");

  return perms;
}

/** Infer resource scope from an MCP tool's schema properties. */
function inferResources(tool: McpTool): string[] {
  const props = tool.inputSchema?.properties ?? {};
  const resources: string[] = [];
  if ("owner" in props && "repo" in props) resources.push("repo:{owner}/{repo}");
  if ("org" in props)                      resources.push("org:{org}");
  if (resources.length === 0)              resources.push("github.com");
  return resources;
}

/** Map one McpTool → AgentGuard Tool record. */
function mcpToolToAgentGuardTool(tool: McpTool): Tool {
  return {
    id: `mcp-${tool.name}`,
    agentId: MCP_AGENT_ID,
    name: tool.name,
    publisher: MCP_PUBLISHER,
    endpoint: MCP_ENDPOINT_BASE,
    version: "live",
    description: tool.description ?? tool.name,
    permissions: inferPermissions(tool),
    resources: inferResources(tool),
    digest: toolDigest(tool),
    status: "review",
  };
}

/** Map one McpTool → CapabilityManifest (no pre-existing baseline for live tools). */
function mcpToolToManifest(tool: Tool): CapabilityManifest {
  return {
    toolId: tool.id,
    version: 1,
    description: tool.description,
    capabilities: tool.permissions.map((p) => p.replace(":", " ")),
    permissions: tool.permissions,
    resources: tool.resources,
    digest: tool.digest,
    owner: MCP_PUBLISHER,
    approver: null,
    approvedAt: null,
    signature: "unsigned",
  };
}

export interface BridgeResult {
  tools: Tool[];
  manifests: Record<string, CapabilityManifest>;
  analyses: ToolAnalysis[];
}

/** Convert the raw MCP tool list into a full AgentGuard analysis set. */
export function bridgeMcpTools(mcpTools: McpTool[]): BridgeResult {
  const tools: Tool[] = mcpTools.map(mcpToolToAgentGuardTool);
  const manifests: Record<string, CapabilityManifest> = {};
  for (const tool of tools) {
    manifests[tool.id] = mcpToolToManifest(tool);
  }
  // analyzeTool with no manifestOverride → static rules only (no drift, no baseline)
  const analyses: ToolAnalysis[] = tools.map((tool) => analyzeTool(tool));
  return { tools, manifests, analyses };
}
