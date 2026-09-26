import assert from "node:assert/strict";
import { baseManifests, demoTools, driftedGithubFullManifest, driftedManifest, silentDriftManifest } from "../lib/demo-data";
import { analyzeTool, scanAllTools, simulateGithubDrift, simulateSilentDrift } from "../lib/security-engine";

const baseline = analyzeTool(demoTools[0]);
assert.equal(baseline.changeDetected, false);
assert.equal(baseline.policyDecision, "allow");
assert.equal(baseline.effectiveRisk, "low");

const shell = analyzeTool(demoTools.find((tool) => tool.id === "shell-execute")!);
assert.equal(shell.policyDecision, "block");
assert.equal(shell.effectiveRisk, "critical");
assert.ok(shell.findings.some((finding) => finding.ruleId === "AG-001"));

const drift = simulateGithubDrift();
assert.equal(drift.changeDetected, true);
assert.equal(drift.policyDecision, "block");
assert.equal(drift.effectiveRisk, "critical");
// simulateGithubDrift hardcodes its own changes array — still contains delete branch
assert.ok(drift.changes.some((change) => change.after.includes("delete branch")));

assert.equal(scanAllTools().length, 6);

// github-full: read + write + delete + network — must block
const githubFull = analyzeTool(demoTools.find((tool) => tool.id === "github-full")!);
assert.equal(githubFull.policyDecision, "block");
assert.equal(githubFull.effectiveRisk, "critical");
// AG-002 does NOT fire: repo:acme/* is not host:*, network:* and contains no .env
assert.ok(!githubFull.findings.some((finding) => finding.ruleId === "AG-002"));
// AG-003: write:repo + write:pr
assert.ok(githubFull.findings.some((finding) => finding.ruleId === "AG-003"));
// AG-004: delete:branch
assert.ok(githubFull.findings.some((finding) => finding.ruleId === "AG-004"));
// read-only rules must NOT fire
assert.ok(!githubFull.findings.some((finding) => finding.ruleId === "AG-001")); // no shell
assert.ok(!githubFull.findings.some((finding) => finding.ruleId === "AG-005")); // no db
// no drift against its own baseline
assert.equal(githubFull.changeDetected, false);

// github-read (baseline): read-only → allow
const githubRead = analyzeTool(demoTools.find((tool) => tool.id === "github-read")!);
assert.equal(githubRead.policyDecision, "allow");
assert.equal(githubRead.effectiveRisk, "low");
assert.equal(githubRead.findings.length, 0);

// github-full v1.1 (fixed): delete:repo + network:* removed → no new critical changes
const githubFullTool = demoTools.find((tool) => tool.id === "github-full")!;
const githubFullDrift = analyzeTool(githubFullTool, driftedGithubFullManifest);
// digest matches baseline so no changes detected
assert.equal(githubFullDrift.changeDetected, false);
// static findings still block: AG-003 (write) + AG-004 (delete:branch in baseline)
assert.equal(githubFullDrift.policyDecision, "block");
assert.equal(githubFullDrift.effectiveRisk, "critical");
// no critical-impact drift changes remain
assert.ok(!githubFullDrift.changes.some((c) => c.impact === "critical"));
// approved baseline must be unchanged
assert.equal(driftedGithubFullManifest.approver, null);

// AG-002 extended: network:* in resources triggers critical finding
const githubReadTool = demoTools.find((tool) => tool.id === "github-read")!;
const networkDrift = analyzeTool(githubReadTool, driftedManifest);
const ag002 = networkDrift.findings.find((f) => f.ruleId === "AG-002");
assert.ok(ag002, "AG-002 must fire when network:* appears in resources");
assert.equal(ag002!.severity, "critical");

// AG-002 extended: tool with network:* permission fires critical finding
const networkPermTool = {
  ...githubReadTool,
  id: "test-network-perm",
  permissions: [...githubReadTool.permissions, "network:*"],
  resources: githubReadTool.resources,
};
const networkPermAnalysis = analyzeTool(networkPermTool);
const ag002perm = networkPermAnalysis.findings.find((f) => f.ruleId === "AG-002");
assert.ok(ag002perm, "AG-002 must fire when network:* appears in permissions");
assert.equal(ag002perm!.severity, "critical");

// Description-mutation detection: driftedManifest has mutated description
const descDrift = analyzeTool(githubReadTool, driftedManifest);
assert.ok(descDrift.changeDetected, "changeDetected must be true when description is mutated");
const descChange = descDrift.changes.find((c) => c.field === "description");
assert.ok(descChange, "a description change must be recorded");
assert.equal(descChange!.impact, "high");
assert.notEqual(descChange!.before, descChange!.after);

// Description-mutation does NOT fire when descriptions match (driftedGithubFullManifest retains same description)
const noDescDrift = analyzeTool(githubFullTool, driftedGithubFullManifest);
assert.ok(!noDescDrift.changes.some((c) => c.field === "description"),
  "no description change must be recorded when description is unchanged");

// Silent drift: postgres-query gains read:db:pii + read:db:secrets with digest unchanged
const silent = simulateSilentDrift();
// digest matches baseline → no digest change recorded
assert.ok(!silent.changes.some((c) => c.field === "digest"),
  "digest must not change in a silent drift scenario");
// but capability + permission changes ARE detected
assert.ok(silent.changeDetected, "changeDetected must be true despite digest match");
assert.ok(silent.changes.some((c) => c.after.includes("read pii")),
  "read pii capability change must be recorded");
assert.ok(silent.changes.some((c) => c.after.includes("read:db:pii")),
  "read:db:pii permission change must be recorded");
assert.ok(silent.changes.some((c) => c.after.includes("read:db:secrets")),
  "read:db:secrets permission change must be recorded");
// all added permissions are non-write/delete → medium impact
assert.ok(silent.changes.every((c) => c.impact === "medium"),
  "all silent drift changes must have medium impact");
// effective risk from changes alone → medium → review (no critical static finding added)
assert.equal(silent.policyDecision, "review");
assert.equal(silent.effectiveRisk, "medium");
// silentDriftManifest digest must still equal the baseline digest
assert.equal(silentDriftManifest.digest, baseManifests["postgres-query"].digest,
  "silent drift fixture must carry the unmodified baseline digest");

console.log("AgentGuard security-engine tests passed.");
