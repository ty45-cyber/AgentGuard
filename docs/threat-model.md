# AgentGuard threat model

## Trust boundary

The security boundary is the agent-to-tool connection. A model may be authorized to reason, but a tool determines what external action the agent can perform.

## Threats covered by the hackathon MVP

- Over-privileged shell execution
- Wildcard filesystem or host scope
- Sensitive-resource access
- Destructive permissions
- Silent capability changes
- Approval drift after a tool update

## Design principle

Deterministic rules make the allow/block decision. AI is used to explain and contextualize the evidence rather than to replace the primary control.
