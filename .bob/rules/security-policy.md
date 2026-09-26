# AgentGuard security policy

- Shell execution is blocked by default.
- Wildcard host access is critical.
- Access to `.env` or credential-bearing resources requires review.
- Write capabilities require human approval.
- Delete capabilities require a block policy unless explicitly approved.
- A capability-manifest change invalidates the previous approval.
- Findings must include concrete evidence and a remediation path.
