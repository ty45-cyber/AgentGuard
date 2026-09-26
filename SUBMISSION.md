# IBM Bob 2.0 Hackathon — submission draft

## Name
AgentGuard

## One-liner
AI changes code fast. AgentGuard controls what it can do.

## What is the product?
AgentGuard is a developer security control plane for AI agent tools. It creates a versioned Capability Passport for each tool, detects capability drift, applies deterministic least-privilege policy, blocks risky changes, and exports a Change Passport as evidence.

## Intended user
Developers, AppSec and platform engineers deploying AI-assisted development and agentic tooling.

## Why Bob 2.0?
Bob 2.0 is central to the build workflow, not a decorative SDK mention. The repository ships a Security Reviewer mode, Capability Audit / Diff / Evidence Skills and a Trust Review workflow. Bob is used to plan and inspect the codebase, reason about the tool boundary, execute changes, verify results and preserve reversible states.

## IBM technology
The core demo works without cloud credentials. An optional IBM watsonx.ai / Granite explanation path is included so judges can see the separation between deterministic security controls and AI-assisted interpretation.

## 90-second demo
Start with an approved read-only GitHub tool. Simulate an update that adds repository write, branch deletion and unrestricted network access. AgentGuard diffs the current capability set against the approved passport, escalates the risk to critical, blocks the tool, explains the evidence, and restores the approved state after remediation. Export the Change Passport at the end.

## Why it matters
AI-assisted development increases the speed and volume of software changes. That makes the agent-to-tool boundary a new place where teams need explicit trust, least privilege and continuous integrity checks. AgentGuard makes that control visible to the developer before a risky capability is allowed to act.

## Limitations
The hackathon build uses deterministic fixtures and a controlled runtime simulator. It does not claim universal MCP discovery or replace IAM, SIEM, CNAPP or API gateways.
