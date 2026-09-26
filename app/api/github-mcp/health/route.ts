import { NextResponse } from "next/server";
import { mcpHealthCheck } from "../../../../lib/github-mcp-client";

export async function GET() {
  const result = await mcpHealthCheck();
  const httpStatus = result.status === "HEALTHY" ? 200 : result.status === "DEGRADED" ? 207 : 503;
  return NextResponse.json(result, { status: httpStatus });
}
