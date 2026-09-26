/**
 * Minimal typed client for the official GitHub MCP Server (Streamable HTTP transport).
 * https://github.com/github/github-mcp-server
 *
 * The server is remote-only (no subprocess). We call the MCP endpoint directly via
 * HTTP POST with JSON-RPC 2.0 payloads, as required by the Streamable HTTP transport.
 *
 * SECURITY: The token is read exclusively from the environment at call time.
 * It is never logged, stored in state, or serialised into any response body.
 */

export const GITHUB_MCP_ENDPOINT = "https://api.githubcopilot.com/mcp/";

export type McpHealthStatus = "HEALTHY" | "DEGRADED" | "OFFLINE";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

export interface McpHealthResult {
  status: McpHealthStatus;
  connected: boolean;
  initialized: boolean;
  toolsDiscovered: number;
  authenticatedReadOk: boolean;
  tools: McpTool[];
  error?: string;
  checkedAt: string;
}

/** Errors with deterministic, non-leaking messages. */
export class McpAuthError extends Error {
  constructor() { super("GitHub MCP authentication failed — check GITHUB_TOKEN."); this.name = "McpAuthError"; }
}
export class McpConnectionError extends Error {
  constructor(detail: string) { super(`GitHub MCP connection failed: ${detail}`); this.name = "McpConnectionError"; }
}
export class McpTimeoutError extends Error {
  constructor() { super("GitHub MCP request timed out."); this.name = "McpTimeoutError"; }
}
export class McpProtocolError extends Error {
  constructor(detail: string) { super(`GitHub MCP protocol error: ${detail}`); this.name = "McpProtocolError"; }
}
export class McpToolsUnavailableError extends Error {
  constructor() { super("GitHub MCP tools list is empty or unavailable."); this.name = "McpToolsUnavailableError"; }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type JsonRpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
type JsonRpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number; message: string } };

function tokenFromEnv(): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? "";
  if (!token) throw new McpAuthError();
  return token;
}

async function rpc(method: string, params: unknown, token: string, timeoutMs = 10_000): Promise<unknown> {
  const body: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method, params };

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(GITHUB_MCP_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
          "MCP-Protocol-Version": "2024-11-05",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new McpTimeoutError();
    throw new McpConnectionError(err instanceof Error ? err.message : String(err));
  }

  if (response.status === 401 || response.status === 403) throw new McpAuthError();
  if (!response.ok) throw new McpConnectionError(`HTTP ${response.status}`);

  // Streamable HTTP may return text/event-stream even for single responses.
  const contentType = response.headers.get("content-type") ?? "";
  let raw: string;
  try {
    raw = await response.text();
  } catch (err) {
    throw new McpConnectionError(`Failed to read response body: ${err instanceof Error ? err.message : String(err)}`);
  }

  let text = raw.trim();

  // If SSE stream: extract the first "data:" line that contains a JSON-RPC object.
  if (contentType.includes("text/event-stream") || text.startsWith("data:")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) throw new McpProtocolError("SSE stream contained no data line");
    text = dataLine.slice(5).trim();
  }

  let parsed: JsonRpcResponse;
  try {
    parsed = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new McpProtocolError(`Non-JSON response: ${text.slice(0, 120)}`);
  }

  if (parsed.error) throw new McpProtocolError(parsed.error.message);
  return parsed.result;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Send the MCP initialize handshake and return the server info result. */
export async function mcpInitialize(token: string): Promise<unknown> {
  return rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "AgentGuard", version: "1.0.0" },
  }, token);
}

/** Retrieve the full tools list from the MCP server. */
export async function mcpListTools(token: string): Promise<McpTool[]> {
  const result = await rpc("tools/list", {}, token, 30_000) as { tools?: McpTool[] };
  const tools = result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) throw new McpToolsUnavailableError();
  return tools;
}

/**
 * Perform a safe authenticated read operation — calls the get_me tool which
 * returns the authenticated user's public profile. Read-only, zero side-effects.
 */
export async function mcpAuthenticatedRead(token: string): Promise<{ login: string }> {
  const result = await rpc("tools/call", { name: "get_me", arguments: {} }, token) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
  // The response is JSON text embedded in the MCP content block.
  try {
    const data = JSON.parse(text) as { login?: string };
    if (data.login) return { login: data.login };
  } catch {
    // text may be plain prose — accept any non-empty response as success
  }
  if (text) return { login: "authenticated" };
  throw new McpProtocolError("get_me returned no content");
}

/** Run the full health check sequence. Returns a non-throwing result. */
export async function mcpHealthCheck(): Promise<McpHealthResult> {
  const checkedAt = new Date().toISOString();
  let token: string;
  try {
    token = tokenFromEnv();
  } catch {
    return { status: "OFFLINE", connected: false, initialized: false, toolsDiscovered: 0, authenticatedReadOk: false, tools: [], error: "GITHUB_TOKEN not set", checkedAt };
  }

  let initialized = false;
  let tools: McpTool[] = [];
  let authenticatedReadOk = false;

  try {
    await mcpInitialize(token);
    initialized = true;

    tools = await mcpListTools(token);  // uses 30 s timeout internally

    await mcpAuthenticatedRead(token);
    authenticatedReadOk = true;

    return { status: "HEALTHY", connected: true, initialized, toolsDiscovered: tools.length, authenticatedReadOk, tools, checkedAt };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const connected = !(err instanceof McpConnectionError || err instanceof McpTimeoutError || err instanceof McpAuthError);
    const status: McpHealthStatus = (err instanceof McpAuthError || err instanceof McpConnectionError || err instanceof McpTimeoutError) ? "OFFLINE" : "DEGRADED";
    return { status, connected, initialized, toolsDiscovered: tools.length, authenticatedReadOk, tools, error, checkedAt };
  }
}
