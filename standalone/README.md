# AgentGuard zero-install demo

This is the self-contained browser build for the hackathon demo. It requires no Node.js, package manager, API keys, database or backend.

## Run

Either open `index.html` directly, or serve this directory:

```bash
python3 -m http.server 8080 -d standalone
```

Then visit `http://localhost:8080`.

## Demo flow

1. Review `github.read_repo` and its approved capability passport.
2. Click **Simulate capability drift**.
3. Show added write, delete and unrestricted network capabilities.
4. Show the deterministic **BLOCK** decision.
5. Click **Explain finding**.
6. Click **Restore approved state**.
7. Click **Export evidence**.

The standalone build intentionally uses the same deterministic security story as the Next.js source. The optional watsonx route in the full source can provide a live IBM Granite explanation when configured.
