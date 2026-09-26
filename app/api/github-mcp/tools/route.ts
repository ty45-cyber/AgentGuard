import { NextResponse } from "next/server";
import { mcpInitialize, mcpListTools, McpAuthError, McpConnectionError, McpTimeoutError, McpToolsUnavailableError } from "../../../../lib/github-mcp-client";
import { bridgeMcpTools } from "../../../../lib/github-mcp-bridge";

export async function GET() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";

  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not set", source: "DEMO FALLBACK" as const, tools: [], analyses: [] },
      { status: 503 },
    );
  }

  try {
    await mcpInitialize(token);
    const mcpTools = await mcpListTools(token);
    const { tools, analyses } = bridgeMcpTools(mcpTools);
    return NextResponse.json({ source: "REAL GITHUB MCP" as const, toolCount: tools.length, tools, analyses });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuth = err instanceof McpAuthError;
    const isConn = err instanceof McpConnectionError || err instanceof McpTimeoutError;
    const isTools = err instanceof McpToolsUnavailableError;

    return NextResponse.json(
      {
        error: message,
        errorType: isAuth ? "AUTH_FAILURE" : isConn ? "CONNECTION_FAILURE" : isTools ? "TOOLS_UNAVAILABLE" : "PROTOCOL_ERROR",
        source: "DEMO FALLBACK" as const,
        tools: [],
        analyses: [],
      },
      { status: isAuth ? 401 : 503 },
    );
  }
}
