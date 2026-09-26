import { mcpHealthCheck } from "../lib/github-mcp-client";

async function run() {
  const r = await mcpHealthCheck();
  console.log(JSON.stringify(r, null, 2));
}
run().catch((e) => { console.error(e); process.exit(1); });
