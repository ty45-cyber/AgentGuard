export type Severity = "critical" | "high" | "medium" | "low";
export type ToolStatus = "approved" | "review" | "blocked";
export type FindingStatus = "open" | "resolved";

export interface Agent {
  id: string;
  name: string;
  environment: "development" | "staging" | "production";
  identity: string;
  owner: string;
}

export interface Tool {
  id: string;
  agentId: string;
  name: string;
  publisher: string;
  endpoint: string;
  version: string;
  description: string;
  permissions: string[];
  resources: string[];
  digest: string;
  status: ToolStatus;
}

export interface CapabilityManifest {
  toolId: string;
  version: number;
  description?: string;
  capabilities: string[];
  permissions: string[];
  resources: string[];
  digest: string;
  owner: string;
  approver: string | null;
  approvedAt: string | null;
  signature: string;
}

export interface Finding {
  id: string;
  toolId: string;
  ruleId: string;
  severity: Severity;
  title: string;
  evidence: string;
  recommendation: string;
  status: FindingStatus;
}

export interface CapabilityChange {
  field: string;
  before: string;
  after: string;
  impact: Severity;
}

export interface ToolAnalysis {
  tool: Tool;
  findings: Finding[];
  changeDetected: boolean;
  changes: CapabilityChange[];
  effectiveRisk: Severity;
  policyDecision: "allow" | "review" | "block";
}
