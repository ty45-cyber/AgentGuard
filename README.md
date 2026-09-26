# AgentGuard

> AI changes code fast. AgentGuard controls what it can do.

AgentGuard is an IBM Bob 2.0-native developer security proof of concept. It protects the boundary between AI agents and the tools they can invoke by treating tool identity, permissions, resource scope, descriptions, schemas and digests as versioned security artifacts.

## Product loop

`Plan → Audit → Capability Passport → Diff → Policy → Verify → Evidence`

The primary allow/review/block decision is deterministic. AI is used for explanation and remediation guidance, so the control itself stays reproducible and inspectable.

## What ships

- polished Next.js dashboard
- deterministic capability/security rule engine
- Capability Passport + capability drift simulation
- policy decisions: allow / review / block
- Change Passport JSON evidence export
- safe / risky / poisoned MCP fixtures
- Bob 2.0 custom mode, rules, Skills and trust-review workflow
- optional IBM watsonx.ai / Granite explanation endpoint
- standalone zero-install browser demo
- threat model, architecture, demo script and verification notes

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`. The product works without IBM cloud credentials.

## Optional IBM watsonx.ai

Copy `.env.example` to `.env.local` and provide `WATSONX_AI_URL`, `WATSONX_PROJECT_ID`, `WATSONX_API_KEY`, and an available `WATSONX_MODEL_ID`. The app calls the watsonx.ai chat-completions API only for explanation; policy decisions remain local and deterministic. IBM currently documents `/ml/v1/chat/completions` and `/ml/v1/text/chat` as supported API operations.

## Bob 2.0-native assets

The `.bob/` directory contains the project security policy, custom Security Reviewer mode, Capability Audit Skill, Capability Diff Skill, Evidence Report Skill, and Trust Review workflow. Keep these files visible in the public repository and show them in the hackathon demo.

## Demo

1. Open the dashboard.
2. Click **Run live demo**.
3. Watch the GitHub tool move from APPROVED to BLOCKED after capability drift.
4. Inspect the changed permissions, resources and digest.
5. Click **Explain with AI**.
6. Click **Remediate & re-approve**.
7. Export the **Change Passport**.

## Limitations

This is a hackathon proof of concept. Discovery uses deterministic fixtures rather than claiming universal automatic discovery. Runtime enforcement is represented by the policy decision and controlled simulator. The project is not a replacement for IAM, SIEM, CNAPP or an API gateway.

## License

MIT
