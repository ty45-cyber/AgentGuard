"use client";

import { useMemo, useState, useEffect } from "react";
import { baseManifests, demoTools } from "../lib/demo-data";
import { analyzeTool, simulateGithubDrift } from "../lib/security-engine";
import type { Severity, ToolAnalysis } from "../lib/types";
import type { McpHealthResult } from "../lib/github-mcp-client";

const severityClass: Record<Severity, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

type McpSource = "REAL GITHUB MCP" | "DEMO FALLBACK" | "checking" | "";

export default function Home() {
  const [selectedToolId, setSelectedToolId] = useState("github-read");
  const [drifted, setDrifted] = useState(false);
  const [remediated, setRemediated] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explanationSource, setExplanationSource] = useState<"fallback" | "granite" | "">("");
  const [explaining, setExplaining] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState("Scan workspace");
  const [activeView, setActiveView] = useState<"overview" | "agent-tools" | "findings" | "changes" | "policies" | "evidence">("overview");
  const [mcpHealth, setMcpHealth] = useState<McpHealthResult | null>(null);
  const [mcpSource, setMcpSource] = useState<McpSource>("");

  // Check MCP health on mount and expose result without blocking UI.
  useEffect(() => {
    setMcpSource("checking");
    fetch("/api/github-mcp/health")
      .then((r) => r.json() as Promise<McpHealthResult>)
      .then((data) => {
        setMcpHealth(data);
        setMcpSource(data.status === "HEALTHY" ? "REAL GITHUB MCP" : "DEMO FALLBACK");
      })
      .catch(() => {
        setMcpSource("DEMO FALLBACK");
      });
  }, []);

  const analyses = useMemo<ToolAnalysis[]>(() => {
    return demoTools.map((tool) => {
      if (tool.id === "github-read" && drifted && !remediated) return simulateGithubDrift();
      return analyzeTool(tool);
    });
  }, [drifted, remediated]);

  const selected = analyses.find((analysis) => analysis.tool.id === selectedToolId) ?? analyses[0];
  const selectedManifest = baseManifests[selected.tool.id] ?? baseManifests["github-read"];
  const driftActive = drifted && selected.tool.id === "github-read" && !remediated;
  const status = driftActive ? "blocked" : selected.policyDecision === "allow" ? "approved" : selected.policyDecision;

  const counts = useMemo(() => {
    const critical = analyses.filter((item) => item.effectiveRisk === "critical").length;
    const review = analyses.filter((item) => item.policyDecision === "review").length;
    const blocked = analyses.filter((item) => item.policyDecision === "block").length;
    return { critical, review, blocked };
  }, [analyses]);

  async function scanWorkspace() {
    setScanning(true);
    setScanLabel("Scanning…");
    setMcpSource("checking");
    const [healthData] = await Promise.allSettled([
      fetch("/api/github-mcp/health").then((r) => r.json() as Promise<McpHealthResult>),
      new Promise((resolve) => window.setTimeout(resolve, 750)),
    ]);
    if (healthData.status === "fulfilled") {
      const data = healthData.value;
      setMcpHealth(data);
      setMcpSource(data.status === "HEALTHY" ? "REAL GITHUB MCP" : "DEMO FALLBACK");
    } else {
      setMcpSource("DEMO FALLBACK");
    }
    setScanning(false);
    setScanLabel("Scan complete");
    window.setTimeout(() => setScanLabel("Scan workspace"), 1700);
  }

  function simulateDrift() {
    setSelectedToolId("github-read");
    setDrifted(true);
    setRemediated(false);
    setExplanation("");
    setExplanationSource("");
  }

  function approveAfterRemediation() {
    setRemediated(true);
    setExplanation("Re-review complete. The demo tool is back inside the signed baseline: read-only repository and issue access, named resources, and the previously approved digest.");
    setExplanationSource("fallback");
  }

  async function explainFinding() {
    setExplaining(true);
    setExplanation("");
    try {
      const finding = selected.findings.map((item) => `${item.title}: ${item.evidence}`).join("; ") || selected.changes.map((item) => `${item.field}: ${item.before} → ${item.after}`).join("; ");
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding }),
      });
      const data = (await response.json()) as { text?: string; live?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Explanation unavailable.");
      setExplanation(data.text ?? "No explanation available.");
      setExplanationSource(data.live ? "granite" : "fallback");
    } catch (error) {
      setExplanation(error instanceof Error ? error.message : "Explanation unavailable.");
      setExplanationSource("fallback");
    } finally {
      setExplaining(false);
    }
  }

  function exportEvidence() {
    const payload = {
      product: "AgentGuard",
      purpose: "AI-assisted development trust control",
      generatedAt: new Date().toISOString(),
      decision: status.toUpperCase(),
      tool: selected.tool,
      approvedManifest: selectedManifest,
      capabilityChanges: selected.changes,
      findings: selected.findings,
      policy: {
        deterministic: true,
        rules: [
          "AG-001: shell execution is blocked",
          "AG-002: wildcard / credential-bearing scope requires block or review",
          "AG-003: writes require explicit approval",
          "AG-004: destructive capabilities are blocked by default",
          "AG-005: database reads require explicit data scope",
        ],
      },
      bobWorkflow: ["Plan", "Security Reviewer", "Capability Audit", "Capability Diff", "Evidence", "Verify / Rollback"],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `agentguard-change-passport-${selected.tool.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AG</div>
          <div>
            <div className="brand-name">AgentGuard</div>
            <div className="brand-sub">v1.0 · IBM Bob 2.0</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          <button className={`nav-item ${activeView === "overview" ? "active" : ""}`} onClick={() => setActiveView("overview")}><Icon>⌂</Icon><span>Overview</span></button>
          <button className={`nav-item ${activeView === "agent-tools" ? "active" : ""}`} onClick={() => setActiveView("agent-tools")}><Icon>◈</Icon><span>Agent tools</span><b>5</b></button>
          <button className={`nav-item ${activeView === "findings" ? "active" : ""}`} onClick={() => setActiveView("findings")}><Icon>!</Icon><span>Findings</span><b className="alert">{counts.critical + counts.review}</b></button>
          <button className={`nav-item ${activeView === "changes" ? "active" : ""}`} onClick={() => setActiveView("changes")}><Icon>↔</Icon><span>Changes</span><b>1</b></button>
          <button className={`nav-item ${activeView === "policies" ? "active" : ""}`} onClick={() => setActiveView("policies")}><Icon>✓</Icon><span>Policies</span></button>
          <button className={`nav-item ${activeView === "evidence" ? "active" : ""}`} onClick={() => setActiveView("evidence")}><Icon>▣</Icon><span>Evidence</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="system-status"><span className="status-dot" /> AgentGuard engine ready</div>
          {mcpSource === "checking" && <div className="mcp-source-badge checking">● Checking MCP…</div>}
          {mcpSource === "REAL GITHUB MCP" && <div className="mcp-source-badge real">● REAL GITHUB MCP</div>}
          {mcpSource === "DEMO FALLBACK" && <div className="mcp-source-badge fallback">● DEMO FALLBACK</div>}
          <div className="sidebar-note">Designed around IBM Bob 2.0 workflows</div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="breadcrumb">
              <span className="breadcrumb-root">AgentGuard</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{activeView === "overview" ? "Overview" : activeView === "agent-tools" ? "Agent Tools" : activeView === "findings" ? "Findings" : activeView === "changes" ? "Changes" : activeView === "policies" ? "Policies" : "Evidence"}</span>
            </div>
            <div className="topbar-meta">
              <span className="env-badge">PRODUCTION</span>
              <span className="topbar-divider" />
              <span className="topbar-org">Acme Corp</span>
              <span className="topbar-divider" />
              <span className="topbar-engine"><span className="status-dot" /> Engine active</span>
              <span className="topbar-divider" />
              {mcpSource === "checking" && <span className="mcp-topbar-badge checking">MCP: checking…</span>}
              {mcpSource === "REAL GITHUB MCP" && <span className="mcp-topbar-badge real" title={`Tools: ${mcpHealth?.toolsDiscovered ?? "?"} · Checked: ${mcpHealth?.checkedAt ?? ""}`}>MCP: HEALTHY ✓</span>}
              {mcpSource === "DEMO FALLBACK" && <span className="mcp-topbar-badge fallback" title={mcpHealth?.error ?? "GitHub MCP unavailable"}>MCP: DEMO FALLBACK</span>}
            </div>
          </div>
          <div className="top-actions">
            <button className="button secondary" onClick={scanWorkspace} disabled={scanning}><Icon>↻</Icon>{scanLabel}</button>
            <div className="user-menu">
              <div className="avatar" title="Demo operator">AG</div>
              <div className="user-info">
                <span className="user-name">Alex Garcia</span>
                <span className="user-role">Security Engineer</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content">
          {activeView === "agent-tools" && (
            <section className="view-section">
              <div className="view-header"><div className="panel-kicker">Agent tools</div><h2>Tool inventory</h2><p>All monitored agent tools and their current capability passport status.</p></div>
              <section className="workspace-grid">
                <div className="panel inventory-panel">
                  <div className="panel-head"><div><div className="panel-kicker">Live inventory</div><h3>Agent tools</h3></div><span className="small-chip">5 monitored</span></div>
                  <div className="tool-list">
                    {analyses.map((analysis) => (
                      <button key={analysis.tool.id} className={`tool-row ${analysis.tool.id === selected.tool.id ? "selected" : ""}`} onClick={() => setSelectedToolId(analysis.tool.id)}>
                        <div className="tool-icon">{iconFor(analysis.tool.name)}</div>
                        <div className="tool-main"><strong>{analysis.tool.name}</strong><span>{analysis.tool.publisher}</span></div>
                        <span className={`severity-badge ${severityClass[analysis.effectiveRisk]}`}>{analysis.effectiveRisk}</span>
                        <span className={`status-text ${analysis.policyDecision}`}>{analysis.policyDecision}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="panel detail-panel">
                  <div className="panel-head detail-head"><div><div className="panel-kicker">Capability passport</div><h3>{selected.tool.name}</h3></div><span className={`status-pill ${status}`}>{status === "blocked" ? "BLOCKED" : status === "review" ? "REVIEW" : "APPROVED"}</span></div>
                  <div className="passport-grid">
                    <Info label="Publisher" value={selected.tool.publisher} />
                    <Info label="Version" value={driftActive ? "1.5.0" : selected.tool.version} />
                    <Info label="Owner" value={selectedManifest.owner} />
                    <Info label="Digest" value={driftActive ? "sha256:f921…8ac0" : selectedManifest.digest} />
                  </div>
                  <div className="capability-box">
                    <div className="cap-title">Declared capabilities</div>
                    <div className="cap-list">
                      {selectedManifest.capabilities.map((capability) => (<span key={capability} className="cap">{capability}</span>))}
                    </div>
                  </div>
                  <div className="capability-box">
                    <div className="cap-title">Permissions</div>
                    <div className="cap-list">
                      {selected.tool.permissions.map((p) => (<span key={p} className="cap">{p}</span>))}
                    </div>
                  </div>
                  <div className="capability-box">
                    <div className="cap-title">Resources</div>
                    <div className="cap-list">
                      {selected.tool.resources.map((r) => (<span key={r} className="cap">{r}</span>))}
                    </div>
                  </div>
                </div>
              </section>
            </section>
          )}

          {activeView === "findings" && (
            <section className="view-section">
              <div className="page-header">
                <div><div className="panel-kicker">Security findings</div><h2 className="page-title">Open findings</h2></div>
                <div className="page-actions">
                  <span className="small-chip">{analyses.flatMap(a => a.findings).length} total</span>
                </div>
              </div>
              <div className="panel">
                <table className="audit-table">
                  <thead><tr><th>Severity</th><th>Rule</th><th>Tool</th><th>Finding</th><th>Evidence</th><th>Recommendation</th></tr></thead>
                  <tbody>
                    {analyses.flatMap((analysis) =>
                      analysis.findings.map((finding) => (
                        <tr key={finding.id}>
                          <td><span className={`severity-badge ${severityClass[finding.severity]}`}>{finding.severity}</span></td>
                          <td><span className="finding-rule">{finding.ruleId}</span></td>
                          <td><span className="finding-tool">{analysis.tool.name}</span></td>
                          <td><strong style={{fontSize:"11px"}}>{finding.title}</strong></td>
                          <td style={{color:"var(--muted)",fontSize:"10px",maxWidth:"220px"}}>{finding.evidence}</td>
                          <td style={{color:"var(--accent)",fontSize:"10px",maxWidth:"220px"}}>{finding.recommendation}</td>
                        </tr>
                      ))
                    )}
                    {analyses.flatMap(a => a.findings).length === 0 && (
                      <tr><td colSpan={6} className="empty-state">No open findings.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "changes" && (
            <section className="view-section">
              <div className="page-header">
                <div><div className="panel-kicker">Capability diff</div><h2 className="page-title">Capability changes</h2></div>
                <div className="page-actions">
                  {!drifted && <button className="button secondary btn-sm" onClick={simulateDrift}>Simulate drift</button>}
                  {drifted && !remediated && <button className="button primary btn-sm" onClick={approveAfterRemediation}>Remediate &amp; re-approve</button>}
                </div>
              </div>
              {drifted && !remediated ? (
                <div className="panel">
                  <div className="panel-head">
                    <div><div className="panel-kicker">github.read_repo · v1.4.2 → v1.5.0</div><h3>Capability drift detected</h3></div>
                    <span className="status-pill blocked">BLOCKED</span>
                  </div>
                  <table className="audit-table">
                    <thead><tr><th>Field</th><th>Approved baseline</th><th>Current value</th><th>Impact</th></tr></thead>
                    <tbody>
                      {analyses.find((a) => a.tool.id === "github-read")?.changes.map((change) => (
                        <tr key={`${change.field}-${change.after}`}>
                          <td><span className="finding-rule">{change.field}</span></td>
                          <td style={{color:"var(--muted)",fontSize:"10px"}}>{change.before}</td>
                          <td style={{color:"#f2c7cc",fontSize:"10px"}}>{change.after}</td>
                          <td><span className={`severity-badge ${severityClass[change.impact]}`}>{change.impact}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="policy-decision"><span>Policy decision</span><b>BLOCK</b><small>Write + destructive capabilities and scope expansion require a new approval.</small></div>
                </div>
              ) : (
                <div className="panel"><div className="empty-state">{remediated ? "Drift remediated. Tool restored to approved baseline." : "No capability changes detected. Use \"Simulate drift\" to run the demo."}</div></div>
              )}
            </section>
          )}

          {activeView === "policies" && (
            <section className="view-section">
              <div className="page-header">
                <div><div className="panel-kicker">Policy engine</div><h2 className="page-title">Policy rules</h2></div>
                <span className="small-chip">Deterministic · 5 active rules</span>
              </div>
              <div className="panel">
                <table className="audit-table">
                  <thead><tr><th>Rule</th><th>Severity</th><th>Title</th><th>Enforcement</th><th>Detail</th></tr></thead>
                  <tbody>
                    {([
                      { id:"AG-001", severity:"critical" as Severity, title:"Shell execution blocked", enforcement:"block", detail:"Any tool declaring exec:shell is blocked by default. Constrain to a sandbox with an explicit allowlist." },
                      { id:"AG-002", severity:"critical" as Severity, title:"Wildcard / credential scope", enforcement:"block", detail:"host:* triggers a critical block. .env or credential-bearing resources trigger a high review." },
                      { id:"AG-003", severity:"high" as Severity, title:"Write capabilities", enforcement:"review", detail:"Any write: permission requires human approval scoped to named resources." },
                      { id:"AG-004", severity:"critical" as Severity, title:"Destructive capabilities", enforcement:"block", detail:"Any delete: permission is blocked unless a separate approval policy is in place." },
                      { id:"AG-005", severity:"medium" as Severity, title:"Database access scope", enforcement:"review", detail:"read:db must be restricted to named reporting datasets with explicit data classification." },
                    ] as {id:string;severity:Severity;title:string;enforcement:string;detail:string}[]).map((rule) => (
                      <tr key={rule.id}>
                        <td><span className="finding-rule">{rule.id}</span></td>
                        <td><span className={`severity-badge ${severityClass[rule.severity]}`}>{rule.severity}</span></td>
                        <td><strong style={{fontSize:"11px"}}>{rule.title}</strong></td>
                        <td><span className={`rule-status ${rule.enforcement}`}>{rule.enforcement}</span></td>
                        <td style={{color:"var(--muted)",fontSize:"10px",maxWidth:"280px"}}>{rule.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "evidence" && (
            <section className="view-section">
              <div className="page-header">
                <div><div className="panel-kicker">Change Passport</div><h2 className="page-title">Evidence export</h2></div>
                <div className="page-actions">
                  <button className="button primary btn-sm" onClick={exportEvidence}>Export JSON</button>
                </div>
              </div>
              <div className="bottom-grid">
                <div className="panel">
                  <div className="panel-head"><div><div className="panel-kicker">Passport fields</div><h3>{selected.tool.name}</h3></div><span className={`status-pill ${status}`}>{status.toUpperCase()}</span></div>
                  <table className="audit-table">
                    <thead><tr><th>Field</th><th>Value</th></tr></thead>
                    <tbody>
                      <tr><td>Identity</td><td>{selected.tool.name}</td></tr>
                      <tr><td>Publisher</td><td>{selected.tool.publisher}</td></tr>
                      <tr><td>Version</td><td>{selected.tool.version}</td></tr>
                      <tr><td>Endpoint</td><td style={{fontFamily:"monospace",fontSize:"10px"}}>{selected.tool.endpoint}</td></tr>
                      <tr><td>Baseline version</td><td>v{selectedManifest.version}</td></tr>
                      <tr><td>Digest</td><td style={{fontFamily:"monospace",fontSize:"10px"}}>{selectedManifest.digest}</td></tr>
                      <tr><td>Signature</td><td style={{fontFamily:"monospace",fontSize:"10px"}}>{selectedManifest.signature}</td></tr>
                      <tr><td>Owner</td><td>{selectedManifest.owner}</td></tr>
                      <tr><td>Approver</td><td>{selectedManifest.approver ?? <span style={{color:"var(--muted)"}}>Pending</span>}</td></tr>
                      <tr><td>Approved at</td><td>{selectedManifest.approvedAt ?? <span style={{color:"var(--muted)"}}>Not yet approved</span>}</td></tr>
                      <tr><td>Policy decision</td><td><span className={`status-text ${status}`}>{status.toUpperCase()}</span></td></tr>
                      <tr><td>Decision source</td><td>Deterministic rules</td></tr>
                      <tr><td>AI role</td><td>Explain + remediate only</td></tr>
                      <tr><td>Approval state</td><td>{status === "blocked" ? <span style={{color:"var(--critical)"}}>Invalidated</span> : "Recorded"}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="panel">
                  <div className="panel-head"><div><div className="panel-kicker">Select tool</div><h3>Tool inventory</h3></div></div>
                  <div className="tool-list">
                    {analyses.map((analysis) => (
                      <button key={analysis.tool.id} className={`tool-row ${analysis.tool.id === selected.tool.id ? "selected" : ""}`} onClick={() => setSelectedToolId(analysis.tool.id)}>
                        <div className="tool-icon">{iconFor(analysis.tool.name)}</div>
                        <div className="tool-main"><strong>{analysis.tool.name}</strong><span>{analysis.tool.publisher}</span></div>
                        <span className={`severity-badge ${severityClass[analysis.effectiveRisk]}`}>{analysis.effectiveRisk}</span>
                        <span className={`status-text ${analysis.policyDecision}`}>{analysis.policyDecision}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{padding:"16px"}}>
                    <button className="button primary" style={{width:"100%"}} onClick={exportEvidence}>Export Change Passport JSON</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === "overview" && (<>

          {drifted && !remediated && (
            <div className="alert-banner">
              <span className="alert-icon">!</span>
              <div><strong>Capability drift detected</strong><span>github.read_repo has exceeded its approved capability passport. Policy decision: BLOCK. Immediate review required.</span></div>
              <button className="button primary btn-sm" onClick={() => setActiveView("changes")}>View changes →</button>
            </div>
          )}

          <div className="page-header">
            <div>
              <div className="panel-kicker">Security posture</div>
              <h2 className="page-title">Overview</h2>
            </div>
            <div className="page-actions">
              <button className="button ghost btn-sm" onClick={exportEvidence}>Export Change Passport</button>
              <button className="button primary btn-sm" onClick={simulateDrift}>Run live demo</button>
            </div>
          </div>

          <section className="metrics-grid">
            <MetricCard label="Monitored tools" value="5" foot="Across 2 agents" icon="◈" />
            <MetricCard label="Critical findings" value={counts.critical.toString()} foot={counts.critical > 0 ? "Immediate action required" : "No critical issues"} tone="critical" icon="!" />
            <MetricCard label="Pending review" value={counts.review.toString()} foot="Awaiting explicit approval" tone={counts.review > 0 ? "high" : ""} icon="△" />
            <MetricCard label="Manifest integrity" value="100%" foot="All baselines verified" tone="good" icon="✓" />
          </section>

          <div className="posture-grid">
            <div className="panel">
              <div className="panel-head"><div><div className="panel-kicker">Trust workflow</div><h3>IBM Bob 2.0 pipeline</h3></div><span className="small-chip">Active</span></div>
              <div className="workflow-steps">
                {(["Plan","Audit","Diff","Policy","Verify","Evidence"] as const).map((step, i) => (
                  <div key={step} className="workflow-step">
                    <div className="workflow-num">{String(i+1).padStart(2,"0")}</div>
                    <div className="workflow-label">{step}</div>
                    <div className="workflow-dot active" />
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><div><div className="panel-kicker">Policy engine</div><h3>Rule enforcement</h3></div><span className="small-chip">Deterministic</span></div>
              <div className="rule-summary">
                {([{id:"AG-001",label:"Shell execution",status:"blocking"},{id:"AG-002",label:"Wildcard scope",status:"blocking"},{id:"AG-003",label:"Write capabilities",status:"review"},{id:"AG-004",label:"Destructive ops",status:"blocking"},{id:"AG-005",label:"Database access",status:"review"}]).map(r => (
                  <div key={r.id} className="rule-row">
                    <span className="rule-id">{r.id}</span>
                    <span className="rule-label">{r.label}</span>
                    <span className={`rule-status ${r.status}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><div><div className="panel-kicker">AI integration</div><h3>Explanation engine</h3></div><span className="small-chip">IBM Granite</span></div>
              <div className="ai-summary">
                <div className="ai-row"><span>Decision source</span><strong>Deterministic rules</strong></div>
                <div className="ai-row"><span>AI role</span><strong>Explain + remediate only</strong></div>
                <div className="ai-row"><span>Model</span><strong>ibm/granite-3-8b-instruct</strong></div>
                <div className="ai-row"><span>Fallback</span><strong>Evidence-bound text</strong></div>
                <div className="ai-row"><span>Credentials</span><strong>Via .env.local</strong></div>
              </div>
            </div>
          </div>

          <section className="workspace-grid" style={{marginTop:"14px"}}>
            <div className="panel inventory-panel">
              <div className="panel-head"><div><div className="panel-kicker">Live inventory</div><h3>Agent tools</h3></div><span className="small-chip">5 monitored</span></div>
              <div className="tool-list">
                {analyses.map((analysis) => (
                  <button key={analysis.tool.id} className={`tool-row ${analysis.tool.id === selected.tool.id ? "selected" : ""}`} onClick={() => setSelectedToolId(analysis.tool.id)}>
                    <div className="tool-icon">{iconFor(analysis.tool.name)}</div>
                    <div className="tool-main"><strong>{analysis.tool.name}</strong><span>{analysis.tool.publisher}</span></div>
                    <span className={`severity-badge ${severityClass[analysis.effectiveRisk]}`}>{analysis.effectiveRisk}</span>
                    <span className={`status-text ${analysis.policyDecision}`}>{analysis.policyDecision}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel detail-panel">
              <div className="panel-head detail-head">
                <div><div className="panel-kicker">Capability passport</div><h3>{selected.tool.name}</h3></div>
                <span className={`status-pill ${status}`}>{status === "blocked" ? "BLOCKED" : status === "review" ? "REVIEW" : "APPROVED"}</span>
              </div>
              <div className="change-request">
                <div><span className="label">Developer request</span><strong>Add a GitHub agent tool for repository analysis</strong></div>
                <span className="request-state">{driftActive ? "Capability drift detected" : "Baseline approved"}</span>
              </div>
              <div className="passport-grid">
                <Info label="Publisher" value={selected.tool.publisher} />
                <Info label="Version" value={driftActive ? "1.5.0" : selected.tool.version} />
                <Info label="Owner" value={selectedManifest.owner} />
                <Info label="Digest" value={driftActive ? "sha256:f921…8ac0" : selectedManifest.digest} />
              </div>
              <div className="capability-box">
                <div className="cap-title">Declared capabilities</div>
                <div className="cap-list">
                  {(driftActive ? ["read repository","read issues","write repository","delete branch","network access"] : selectedManifest.capabilities).map((c) => (
                    <span key={c} className={driftActive && ["write repository","delete branch","network access"].includes(c) ? "cap danger" : "cap"}>{c}</span>
                  ))}
                </div>
              </div>
              {driftActive ? (
                <div className="drift-callout">
                  <div className="drift-head"><span className="warning-icon">!</span><div><strong>Approved capability set changed</strong><span>The tool is no longer equivalent to what security approved.</span></div></div>
                  <div className="diff-list">
                    {selected.changes.map((change) => (
                      <div className="diff-row" key={`${change.field}-${change.after}`}>
                        <div><span className="diff-field">{change.field}</span><span className="old-value">{change.before}</span></div>
                        <div><span className={`diff-impact ${severityClass[change.impact]}`}>{change.impact}</span><span className="new-value">{change.after}</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="policy-decision"><span>Policy decision</span><b>BLOCK</b><small>Write + destructive capabilities and scope expansion require a new approval.</small></div>
                </div>
              ) : (
                <div className={status === "approved" ? "clean-callout" : "review-callout"}>
                  <span className={status === "approved" ? "checkmark" : "warning-icon"}>{status === "approved" ? "✓" : "△"}</span>
                  <div><strong>{status === "approved" ? "Trust boundary intact" : "Review required"}</strong><span>{status === "approved" ? "Current capabilities match the signed baseline." : "The current tool exceeds the low-risk baseline and needs explicit approval."}</span></div>
                </div>
              )}
              <div className="detail-actions">
                {driftActive ? <button className="button primary" onClick={approveAfterRemediation}>Remediate &amp; re-approve</button> : <button className="button secondary" onClick={simulateDrift}>Simulate capability drift</button>}
                <button className="button ghost" onClick={explainFinding} disabled={explaining}>{explaining ? "Explaining…" : "Explain with AI"}</button>
              </div>
              {explanation && (
                <div className="explanation">
                  <div className="explanation-head"><span>Decision context</span><span className="small-chip">{explanationSource === "granite" ? "IBM Granite · live" : "Evidence-bound fallback"}</span></div>
                  <p>{explanation}</p>
                </div>
              )}
            </div>
          </section>

          <section className="panel timeline-panel" style={{marginTop:"14px"}}>
            <div className="panel-head"><div><div className="panel-kicker">Audit trail</div><h3>Recent trust decisions</h3></div><span className="small-chip">Demo workspace</span></div>
            <table className="audit-table">
              <thead><tr><th>Time</th><th>Tool</th><th>Event</th><th>Decision</th><th>Rule</th></tr></thead>
              <tbody>
                <tr><td>14:32</td><td>github.read_repo</td><td>Baseline signed · read-only repository access</td><td><span className="status-text approved">approved</span></td><td>—</td></tr>
                <tr><td>14:18</td><td>filesystem.read</td><td>Review opened · credential-bearing resource scope</td><td><span className="status-text review">review</span></td><td>AG-002</td></tr>
                <tr><td>13:54</td><td>shell.execute</td><td>Policy blocked · unrestricted shell execution</td><td><span className="status-text blocked">blocked</span></td><td>AG-001</td></tr>
                <tr><td>12:47</td><td>postgres.query</td><td>Manifest recorded · reporting database only</td><td><span className="status-text approved">approved</span></td><td>—</td></tr>
              </tbody>
            </table>
          </section>

          <footer className="footer-note">
            <span>AGENTGUARD</span>
            <span>IBM Bob 2.0 · Deterministic policy engine · optional IBM Granite explanation</span>
            <span>Demo fixtures · not production data</span>
          </footer>
          </>)}
        </div>
      </section>
    </main>
  );
}

function iconFor(name: string): string {
  if (name.startsWith("github")) return "GH";
  if (name.startsWith("filesystem")) return "FS";
  if (name.startsWith("shell")) return "$";
  if (name.startsWith("slack")) return "SL";
  if (name.startsWith("postgres")) return "DB";
  return name.slice(0, 2).toUpperCase();
}

function MetricCard({ label, value, foot, tone = "", icon }: { label: string; value: string; foot: string; tone?: string; icon: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-block"><span>{label}</span><strong>{value}</strong></div>;
}
