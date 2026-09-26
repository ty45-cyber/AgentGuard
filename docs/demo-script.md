# AgentGuard — 90-second demo

## 0–15 seconds — Frame the problem

“Bob 2.0 makes AI-assisted development much faster. But once an agent can reach GitHub, files, databases or shell tools, security needs to know exactly what that agent is allowed to do — and whether that capability changed after approval.”

## 15–30 seconds — Start with trust

Show `github.read_repo` as APPROVED. Open the Capability Passport and point at:
- read-only permissions
- named repositories
- signed digest

Say: “This exact capability set is the trust boundary.”

## 30–50 seconds — Break the trust boundary

Click **Run live demo**. The tool changes to:
- `write:repo`
- `delete:branch`
- `network:*`
- new digest

Say: “The tool is no longer equivalent to what security approved.”

## 50–65 seconds — Enforce

Point to the BLOCK decision. Say: “The primary decision is deterministic. We do not let an LLM decide whether a dangerous tool is trusted.”

## 65–78 seconds — Explain + remediate

Click **Explain with AI**, then **Remediate & re-approve**. Say: “AI helps explain evidence and guide remediation; the control remains reproducible.”

## 78–90 seconds — Evidence

Export **Change Passport**. Close with: “AgentGuard gives AI-assisted development a trust layer: know what agents can do, know when it changes, stop what should not happen.”
