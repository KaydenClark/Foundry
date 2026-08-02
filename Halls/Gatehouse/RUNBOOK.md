# Gatehouse Runbook

## Current Verification

Until a Gatehouse implementation spec lands, verification is structural:

```bash
node ../../../tools/test-hall-paths.mjs
```

There is no Gatehouse service to install, run, deploy, or recover yet.

## Safety

- Do not copy implementation or Canon from a product checkout.
- Do not add credentials or deployment configuration.
- Use root S-027 and an approved Gatehouse-local spec before executable work.
