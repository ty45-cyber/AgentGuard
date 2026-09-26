import { demoTools, driftedGithubFullManifest } from "../lib/demo-data";
import { analyzeTool, scanAllTools, simulateGithubDrift } from "../lib/security-engine";

const baseline = scanAllTools();
const githubDrift = simulateGithubDrift();
const githubFullDrift = analyzeTool(
  demoTools.find((t) => t.id === "github-full")!,
  driftedGithubFullManifest,
);

type Row = { label: string; risk: string; decision: string; changes: string; findings: string };
const rows: Row[] = [];

const fmtChanges = (r: typeof baseline[0]) =>
  r.changes.length ? r.changes.map((c) => `${c.field}: ${c.after} [${c.impact}]`).join("; ") : "—";
const fmtFindings = (r: typeof baseline[0]) =>
  r.findings.length ? r.findings.map((f) => `${f.ruleId} [${f.severity}]`).join(", ") : "—";

for (const r of baseline) {
  rows.push({ label: r.tool.id, risk: r.effectiveRisk, decision: r.policyDecision, changes: fmtChanges(r), findings: fmtFindings(r) });
}

rows.push({
  label: "github-read (drifted)",
  risk: githubDrift.effectiveRisk,
  decision: githubDrift.policyDecision,
  changes: githubDrift.changes.map((c) => `${c.field}: ${c.after} [${c.impact}]`).join("; "),
  findings: fmtFindings(githubDrift),
});

rows.push({
  label: "github-full (v1.1 drift)",
  risk: githubFullDrift.effectiveRisk,
  decision: githubFullDrift.policyDecision,
  changes: fmtChanges(githubFullDrift),
  findings: fmtFindings(githubFullDrift),
});

const colW = [26, 12, 10, 0, 0];
colW[3] = Math.max(...rows.map((r) => r.changes.length), "capability changes".length) + 2;
colW[4] = Math.max(...rows.map((r) => r.findings.length), "static findings".length) + 2;

const hr = () => "─".repeat(colW[0] + colW[1] + colW[2] + colW[3] + colW[4] + 16);
const row = (a: string, b: string, c: string, d: string, e: string) =>
  `│ ${a.padEnd(colW[0])} │ ${b.padEnd(colW[1])} │ ${c.padEnd(colW[2])} │ ${d.padEnd(colW[3])} │ ${e.padEnd(colW[4])} │`;

console.log(hr());
console.log(row("tool", "risk", "decision", "capability changes", "static findings"));
console.log(hr());
for (const r of rows) console.log(row(r.label, r.risk, r.decision, r.changes, r.findings));
console.log(hr());
