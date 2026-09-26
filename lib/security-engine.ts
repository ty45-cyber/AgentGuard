import { baseManifests, demoTools, driftedManifest, silentDriftManifest } from "./demo-data";
import type { CapabilityChange, Finding, Severity, Tool, ToolAnalysis } from "./types";

const severityWeight: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxSeverity(values: Severity[]): Severity {
  return [...values].sort((a, b) => severityWeight[b] - severityWeight[a])[0] ?? "low";
}

export function analyzeTool(tool: Tool, manifestOverride?: typeof baseManifests[string]): ToolAnalysis {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  // When a manifest override is supplied (drift scenario), evaluate against
  // the manifest's permissions and resources — not the stale tool record.
  const effectivePermissions = manifestOverride?.permissions ?? tool.permissions;
  const effectiveResources   = manifestOverride?.resources   ?? tool.resources;
  if (effectivePermissions.some((permission) => permission.includes("exec:shell"))) {
    add({
      id: `${tool.id}-shell`,
      toolId: tool.id,
      ruleId: "AG-001",
      severity: "critical",
      title: "Shell execution capability",
      evidence: "The tool can execute arbitrary shell commands on its host.",
      recommendation: "Remove shell access or constrain execution to a dedicated sandbox with an explicit allowlist.",
      status: "open",
    });
  }

  const hasWildcardNetwork = effectivePermissions.some((p) => p === "network:*") ||
    effectiveResources.some((r) => r === "network:*");
  if (effectiveResources.some((resource) => resource === "host:*" || resource.includes(".env")) || hasWildcardNetwork) {
    const isCritical = effectiveResources.includes("host:*") || hasWildcardNetwork;
    add({
      id: `${tool.id}-scope`,
      toolId: tool.id,
      ruleId: "AG-002",
      severity: isCritical ? "critical" : "high",
      title: "Over-broad resource scope",
      evidence: `The tool reaches ${[...effectivePermissions, ...effectiveResources].filter((s) => s === "host:*" || s === "network:*" || s.includes(".env")).join(", ")}.`,
      recommendation: "Replace wildcard access with the smallest resource set required by the workflow.",
      status: "open",
    });
  }

  if (effectivePermissions.some((permission) => permission.startsWith("write:"))) {
    add({
      id: `${tool.id}-write`,
      toolId: tool.id,
      ruleId: "AG-003",
      severity: "high",
      title: "Write capability requires explicit approval",
      evidence: `The tool declares ${effectivePermissions.filter((permission) => permission.startsWith("write:")).join(", ")}.`,
      recommendation: "Require human approval and scope writes to named resources.",
      status: "open",
    });
  }

  if (effectivePermissions.some((permission) => permission.startsWith("delete:"))) {
    add({
      id: `${tool.id}-delete`,
      toolId: tool.id,
      ruleId: "AG-004",
      severity: "critical",
      title: "Destructive capability",
      evidence: `The tool declares ${effectivePermissions.filter((permission) => permission.startsWith("delete:")).join(", ")}.`,
      recommendation: "Block by default and require a separate approval policy for destructive operations.",
      status: "open",
    });
  }

  if (effectivePermissions.some((permission) => permission.startsWith("read:db"))) {
    add({
      id: `${tool.id}-data`,
      toolId: tool.id,
      ruleId: "AG-005",
      severity: "medium",
      title: "Operational database access",
      evidence: "The tool can read operational database data.",
      recommendation: "Restrict access to named reporting datasets and keep the data classification explicit.",
      status: "open",
    });
  }

  const manifest = manifestOverride ?? baseManifests[tool.id];
  const change = manifestOverride ? getManifestChanges(tool.id, manifest) : [];
  const effectiveRisk = maxSeverity(findings.map((finding) => finding.severity).concat(change.map((item) => item.impact)));
  const policyDecision = effectiveRisk === "critical" ? "block" : effectiveRisk === "high" || effectiveRisk === "medium" ? "review" : "allow";

  return {
    tool,
    findings,
    changeDetected: change.length > 0,
    changes: change,
    effectiveRisk,
    policyDecision,
  };
}

function getManifestChanges(toolId: string, current: typeof baseManifests[string]): CapabilityChange[] {
  const baseline = baseManifests[toolId];
  if (!baseline) return [];

  const changes: CapabilityChange[] = [];
  const addedCapabilities = current.capabilities.filter((capability) => !baseline.capabilities.includes(capability));
  for (const capability of addedCapabilities) {
    changes.push({
      field: "capabilities",
      before: baseline.capabilities.join(", "),
      after: `+ ${capability}`,
      impact: capability.includes("delete") ? "critical" : capability.includes("write") ? "high" : "medium",
    });
  }

  if (baseline.description !== undefined && current.description !== undefined &&
      baseline.description !== current.description) {
    changes.push({
      field: "description",
      before: baseline.description,
      after: current.description,
      impact: "high",
    });
  }

  if (baseline.digest !== current.digest) {
    changes.push({ field: "digest", before: baseline.digest, after: current.digest, impact: "high" });
  }

  const newResources = current.resources.filter((resource) => !baseline.resources.includes(resource));
  for (const resource of newResources) {
    changes.push({
      field: "resources",
      before: baseline.resources.join(", "),
      after: `+ ${resource}`,
      impact: resource.includes("*") ? "critical" : "high",
    });
  }

  const newPermissions = current.permissions.filter((permission) => !baseline.permissions.includes(permission));
  for (const permission of newPermissions) {
    changes.push({
      field: "permissions",
      before: baseline.permissions.join(", "),
      after: `+ ${permission}`,
      impact: permission.startsWith("delete:") ? "critical" : permission.startsWith("write:") ? "high" : "medium",
    });
  }

  return changes;
}

export function scanAllTools(): ToolAnalysis[] {
  return demoTools.map((tool) => analyzeTool(tool));
}

export function simulateGithubDrift(): ToolAnalysis {
  const tool = demoTools.find((candidate) => candidate.id === "github-read");
  if (!tool) {
    throw new Error("Demo tool github-read is missing.");
  }

  const changes: CapabilityChange[] = [
    { field: "capabilities", before: "read repository, read issues", after: "+ write repository", impact: "high" },
    { field: "capabilities", before: "read repository, read issues", after: "+ delete branch", impact: "critical" },
    { field: "resources", before: "named repositories", after: "+ network:*", impact: "high" },
    { field: "digest", before: "sha256:8fa2…31d2", after: "sha256:f921…8ac0", impact: "high" },
  ];

  const analysis = analyzeTool(tool, driftedManifest);
  return {
    ...analysis,
    changeDetected: true,
    changes,
    effectiveRisk: "critical",
    policyDecision: "block",
  };
}

export function simulateSilentDrift(): ToolAnalysis {
  const tool = demoTools.find((candidate) => candidate.id === "postgres-query");
  if (!tool) {
    throw new Error("Demo tool postgres-query is missing.");
  }

  // The digest matches the baseline — a naive hash check would pass.
  // getManifestChanges() detects the added permissions regardless.
  return analyzeTool(tool, silentDriftManifest);
}
