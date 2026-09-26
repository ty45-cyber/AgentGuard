# Bob 2.0 workflow

AgentGuard is intentionally built as a Bob-native engineering workflow.

1. **Plan** — inspect the repository and agent/tool boundary before editing.
2. **Security Reviewer** — apply `.bob/rules/security-policy.md` and least-privilege constraints.
3. **Capability Audit Skill** — normalize identity, permissions, resources, descriptions, schemas and provenance.
4. **Capability Diff Skill** — compare current definitions with the approved passport.
5. **Evidence Report Skill** — produce a structured Change Passport.
6. **Verify / Rollback** — validate changes and preserve a reversible state.

The hackathon proof of concept demonstrates the configuration assets in `.bob/` and maps them directly to the product workflow.
