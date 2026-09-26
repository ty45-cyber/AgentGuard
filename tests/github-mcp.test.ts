/**
 * tests/github-mcp.test.ts
 *
 * Tests covering:
 *  1. Healthy real MCP connection (live, skipped if GITHUB_TOKEN absent)
 *  2. Authenticated GitHub read (live, skipped if GITHUB_TOKEN absent)
 *  3. Capability discovery — tool count (live, skipped if GITHUB_TOKEN absent)
 *  4. MCP failure → explicit DEMO FALLBACK (no token → deterministic error)
 *  5. No silent fallback — error field always present when offline
 *  6. Bridge: McpTool → AgentGuard Tool mapping
 *  7. Bridge: security engine runs on bridged tools without throwing
 */

import assert from "node:assert/strict";
import {
  mcpHealthCheck,
  mcpInitialize,
  mcpListTools,
  mcpAuthenticatedRead,
  McpAuthError,
  GITHUB_MCP_ENDPOINT,
  type McpTool,
} from "../lib/github-mcp-client";
import { bridgeMcpTools } from "../lib/github-mcp-bridge";

const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
const LIVE = TOKEN.length > 0;

function skip(label: string) {
  console.log(`  SKIP  ${label} (GITHUB_TOKEN not set)`);
}

async function main() {

  // -------------------------------------------------------------------------
  // 4 + 5 — No token → explicit OFFLINE result, never silent, never throws
  // -------------------------------------------------------------------------
  {
    const saved  = process.env.GITHUB_TOKEN;
    const saved2 = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    const result = await mcpHealthCheck();

    process.env.GITHUB_TOKEN = saved;
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = saved2;

    assert.equal(result.status, "OFFLINE", "4a: health status must be OFFLINE when token absent");
    assert.equal(result.connected, false,   "4b: connected must be false");
    assert.equal(result.initialized, false, "4b: initialized must be false");
    assert.equal(result.toolsDiscovered, 0, "4b: toolsDiscovered must be 0");
    assert.equal(result.authenticatedReadOk, false, "4b: authenticatedReadOk must be false");
    assert.ok(result.error && result.error.length > 0, "5: error must be present — no silent fallback");
    if (saved) assert.ok(!result.error!.includes(saved), "5: error must not leak token value");

    console.log("  PASS  4a: OFFLINE when no token");
    console.log("  PASS  4b: connected/initialized/toolsDiscovered all clear");
    console.log("  PASS  5:  error field present — no silent fallback");
  }

  // -------------------------------------------------------------------------
  // McpAuthError constructor is non-leaking and correctly named
  // -------------------------------------------------------------------------
  {
    const err = new McpAuthError();
    assert.equal(err.name, "McpAuthError");
    assert.ok(err.message.includes("GITHUB_TOKEN"));
    console.log("  PASS  4c: McpAuthError is correct and non-leaking");
  }

  // -------------------------------------------------------------------------
  // GITHUB_MCP_ENDPOINT points to the official server
  // -------------------------------------------------------------------------
  {
    assert.equal(GITHUB_MCP_ENDPOINT, "https://api.githubcopilot.com/mcp/");
    console.log("  PASS  endpoint: GITHUB_MCP_ENDPOINT is correct");
  }

  // -------------------------------------------------------------------------
  // 6 — Bridge: McpTool → AgentGuard Tool shape
  // -------------------------------------------------------------------------
  {
    const fakeMcpTools: McpTool[] = [
      {
        name: "get_me",
        description: "Returns the authenticated user profile.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "list_repositories",
        description: "Lists repositories for the authenticated user.",
        inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" } } },
      },
      {
        name: "delete_branch",
        description: "Deletes a branch from a repository.",
        inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" } } },
      },
      {
        name: "create_issue",
        description: "Creates an issue in a repository.",
        inputSchema: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" } } },
      },
    ];

    const { tools, manifests, analyses } = bridgeMcpTools(fakeMcpTools);

    assert.equal(tools.length, fakeMcpTools.length, "6a: one Tool per McpTool");
    assert.ok(tools.every((t) => t.id.startsWith("mcp-")), "6b: ids prefixed mcp-");
    assert.ok(tools.every((t) => t.publisher === "GitHub (official MCP server)"), "6c: publisher correct");
    for (const tool of tools) {
      assert.ok(tool.id in manifests, `6d: manifest missing for ${tool.id}`);
    }

    const deleteTool = tools.find((t) => t.name === "delete_branch")!;
    assert.ok(deleteTool.permissions.some((p) => p.startsWith("delete:")), "6e: delete_branch infers delete:");

    const createTool = tools.find((t) => t.name === "create_issue")!;
    assert.ok(createTool.permissions.some((p) => p.startsWith("write:")), "6f: create_issue infers write:");

    const getMeTool = tools.find((t) => t.name === "get_me")!;
    assert.ok(getMeTool.permissions.some((p) => p.startsWith("read:")), "6g: get_me infers read:");

    console.log("  PASS  6a–6g: bridge tool mapping correct");

    // 7 — security engine on bridged tools
    assert.equal(analyses.length, fakeMcpTools.length, "7a: one ToolAnalysis per bridged tool");

    const deleteAnalysis = analyses.find((a) => a.tool.name === "delete_branch")!;
    assert.equal(deleteAnalysis.policyDecision, "block", "7b: delete_branch → block");
    assert.ok(deleteAnalysis.findings.some((f) => f.ruleId === "AG-004"), "7b: AG-004 fires on delete_branch");

    const createAnalysis = analyses.find((a) => a.tool.name === "create_issue")!;
    assert.ok(["review", "block"].includes(createAnalysis.policyDecision), "7c: create_issue → review/block");
    assert.ok(createAnalysis.findings.some((f) => f.ruleId === "AG-003"), "7c: AG-003 fires on create_issue");

    const getMeAnalysis = analyses.find((a) => a.tool.name === "get_me")!;
    assert.equal(getMeAnalysis.policyDecision, "allow", "7d: get_me → allow");

    console.log("  PASS  7a–7d: security engine correct on bridged tools");
  }

  // -------------------------------------------------------------------------
  // 1–3 — Live tests (only run when GITHUB_TOKEN is set)
  // -------------------------------------------------------------------------
  if (!LIVE) {
    skip("1: healthy real MCP connection");
    skip("2: authenticated GitHub read");
    skip("3: capability discovery — tool count");
  } else {
    // TEST 1
    const initResult = await mcpInitialize(TOKEN);
    assert.ok(initResult !== null && initResult !== undefined, "1: initialize must return a result");
    console.log("  PASS  1: MCP initialize succeeded");

    // TEST 2
    const readResult = await mcpAuthenticatedRead(TOKEN);
    assert.ok(readResult.login && readResult.login.length > 0, "2: authenticated read must return a login");
    console.log(`  PASS  2: authenticated read — login: ${readResult.login}`);

    // TEST 3
    const tools = await mcpListTools(TOKEN);
    assert.ok(tools.length > 0, "3: tool list must be non-empty");
    console.log(`  PASS  3: discovered ${tools.length} tools from real GitHub MCP`);

    // Full health check
    const health = await mcpHealthCheck();
    console.log(`  INFO  health: ${health.status} · tools: ${health.toolsDiscovered} · readOk: ${health.authenticatedReadOk} · checked: ${health.checkedAt}`);
    if (health.error) console.log(`  INFO  health.error: ${health.error}`);
  }

  console.log("\nAgentGuard GitHub MCP tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
