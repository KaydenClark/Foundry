# Captain Scheduling Core

This directory owns reusable Captain scheduling policy. It contains no host
paths, workflow allowlist, generated queue, campaign assignment, approval
receipt, handoff, or runtime state.

Producer source for the engines lives at `Foundry/tools/`; the packaged product
places those engines at root `tools/`. An adopting instance supplies its
bindings at `Scheduled/Captain/`. An embedded producer instance may keep thin
root `tools/captain-*.mjs` adapters so existing commands continue to work while
the implementation has one Foundry-owned source.

Verify a packaged product or composed producer instance from its root. Explicit
bindings keep these commands valid with or without an embedded adapter:

```bash
node tools/captain-core.mjs verify --instance-root .
FOUNDRY_CAPTAIN_BINDINGS=Scheduled/Captain/workflow-bindings.json \
  node tools/captain-automation.mjs validate-registry Scheduled/Captain/workflows.json
node tools/captain-ready-queue.mjs --root . --plan
```
