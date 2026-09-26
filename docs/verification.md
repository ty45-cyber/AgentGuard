# Verification record

## Passed in the build environment

- Core TypeScript security engine compiled with the system TypeScript compiler.
- Engine checks passed for:
  - clean baseline allow
  - database-read review
  - shell execution block
  - capability drift detection
  - destructive capability block
  - five-tool inventory scan
- Standalone JavaScript passed `node --check`.
- Standalone browser build served successfully over a local HTTP server and returned the AgentGuard page.
- Demo JSON fixtures parsed successfully.

## Full Next.js build

The environment could not complete `npm install` because the npm registry request timed out. The archive therefore includes both the full Next.js source and a zero-install standalone deployment under `standalone/` so the shipped demo does not depend on package installation in the judging environment.
