import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeTool, simulateGithubDrift } from "../lib/security-engine";
import { baseManifests, demoTools, driftedManifest } from "../lib/demo-data";

const PASS = (msg: string) => console.log(`  PASS  ${msg}`);
const FAIL = (msg: string) => { console.error(`  FAIL  ${msg}`); process.exitCode = 1; };

console.log("\n── GitHub MCP integration audit ──\n");

// 1. Fixture files on disk match engine data
const safeFixture = JSON.parse(readFileSync(join("examples","safe-mcp","tool.json"),"utf8"));
const poisonedBefore = JSON.parse(readFileSync(join("examples","poisoned-mcp","before.json"),"utf8"));
const poisonedAfter  = JSON.parse(readFileSync(join("examples","poisoned-mcp","after.json"),"utf8"));

const githubTool = demoTools.find(t => t.id === "github-read")!;
const githubManifest = baseManifests["github-read"];

safeFixture.digest === githubTool.digest
  ? PASS("safe-mcp/tool.json digest matches engine baseline")
  : FAIL(`safe-mcp digest mismatch: fixture=${safeFixture.digest} engine=${githubTool.digest}`);

poisonedBefore.digest === githubManifest.digest
  ? PASS("poisoned-mcp/before.json digest matches approved manifest")
  : FAIL(`poisoned before digest mismatch`);

poisonedAfter.digest === driftedManifest.digest
  ? PASS("poisoned-mcp/after.json digest matches driftedManifest")
  : FAIL(`poisoned after digest mismatch`);

JSON.stringify(poisonedAfter.permissions.sort()) === JSON.stringify([...driftedManifest.permissions].sort())
  ? PASS("poisoned-mcp/after.json permissions match driftedManifest")
  : FAIL(`poisoned after permissions mismatch: fixture=${JSON.stringify(poisonedAfter.permissions)} engine=${JSON.stringify(driftedManifest.permissions)}`);

poisonedAfter.resources.includes("network:*") && driftedManifest.resources.includes("network:*")
  ? PASS("network:* resource present in both poisoned fixture and driftedManifest")
  : FAIL("network:* resource mismatch between fixture and driftedManifest");

// 2. Baseline analysis — github-read should be clean
const baseline = analyzeTool(githubTool);
baseline.policyDecision === "allow"   ? PASS("Baseline policy decision: allow") : FAIL(`Expected allow, got ${baseline.policyDecision}`);
baseline.effectiveRisk === "low"      ? PASS("Baseline effective risk: low")    : FAIL(`Expected low, got ${baseline.effectiveRisk}`);
baseline.findings.length === 0        ? PASS("Baseline has zero findings")      : FAIL(`Expected 0 findings, got ${baseline.findings.length}`);
baseline.changeDetected === false     ? PASS("Baseline changeDetected: false")  : FAIL("Baseline should not detect changes");

// 3. Drift simulation — should block
const drift = simulateGithubDrift();
drift.policyDecision === "block"      ? PASS("Drift policy decision: block")    : FAIL(`Expected block, got ${drift.policyDecision}`);
drift.effectiveRisk === "critical"    ? PASS("Drift effective risk: critical")  : FAIL(`Expected critical, got ${drift.effectiveRisk}`);
drift.changeDetected === true         ? PASS("Drift changeDetected: true")      : FAIL("Drift should detect changes");

const hasWriteChange = drift.changes.some(c => c.after.includes("write repository"));
hasWriteChange ? PASS("Drift changes include write repository") : FAIL("Missing write repository change");

const hasDeleteChange = drift.changes.some(c => c.after.includes("delete branch") && c.impact === "critical");
hasDeleteChange ? PASS("Drift changes include delete branch (critical)") : FAIL("Missing critical delete branch change");

const hasNetworkChange = drift.changes.some(c => c.after.includes("network:*"));
hasNetworkChange ? PASS("Drift changes include network:* resource expansion") : FAIL("Missing network:* resource change");

const hasDigestChange = drift.changes.some(c => c.field === "digest" && c.after === driftedManifest.digest);
hasDigestChange ? PASS("Drift changes include digest mismatch") : FAIL("Missing digest change");

// 4. Drift findings include AG-003 (write) and AG-004 (delete)
const driftFindings = drift.findings.map(f => f.ruleId);
driftFindings.includes("AG-003") ? PASS("Drift findings include AG-003 (write capability)") : FAIL("Missing AG-003 in drift findings");
driftFindings.includes("AG-004") ? PASS("Drift findings include AG-004 (destructive capability)") : FAIL("Missing AG-004 in drift findings");

// 5. Manifest integrity — baseline digest matches across all three sources
const allDigestsMatch =
  githubTool.digest === githubManifest.digest &&
  githubManifest.digest === safeFixture.digest &&
  githubManifest.digest === poisonedBefore.digest;
allDigestsMatch
  ? PASS("Digest consistent across tool, manifest, safe fixture, and poisoned-before")
  : FAIL("Digest inconsistency detected across sources");

// 6. Drifted manifest is structurally different from baseline
assert.notEqual(driftedManifest.digest, githubManifest.digest);
assert.notEqual(driftedManifest.signature, githubManifest.signature);
assert.ok(driftedManifest.capabilities.length > githubManifest.capabilities.length);
PASS("driftedManifest is structurally distinct from baseline manifest");

console.log("\n── GitHub MCP audit complete ──\n");
