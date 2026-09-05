# Gauge

Gauge is the native observe-and-notify Hall. Its current compatibility source
is the Personal Intelligence Platform integration and verification layer for
OpenBrain and Command Information Center.

The source projects remain separate repositories under GPT_OS: this integration
project lives in `Projects/`, while OpenBrain and CIC live in `Foundry/`. This
repository provides shared architecture, an OpenBrain-owned contract
compatibility check, portable health reporting, and the cached health summary
rendered by CIC.

```bash
npm run doctor
npm test
npm run health
```

Open `personal-intelligence-platform.code-workspace` to work with all three repositories. Local reports and credentials are ignored and must never be committed. The future Gatehouse passage and CIC activity contracts are staged in root `S-001`.
