import { scanAllTools } from "../lib/security-engine";

const results = scanAllTools().map((analysis) => ({
  tool: analysis.tool.name,
  risk: analysis.effectiveRisk,
  decision: analysis.policyDecision,
  findings: analysis.findings.map((finding) => ({
    rule: finding.ruleId,
    severity: finding.severity,
    title: finding.title,
  })),
}));

console.log(JSON.stringify({ scanner: "agentguard", version: "1.0.0", results }, null, 2));
