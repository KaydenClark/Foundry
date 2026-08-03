# Foundry Schematic Runbook

> Generated from LLM Workbench v2.3.

Run commands from the `Schematic/` directory.

## Prerequisites

- Node.js 18 or newer
- npm

No account, credential, environment variable, database, browser extension, or
provider connection is required.

## Install

```bash
npm ci
```

## Run Locally

```bash
npm run dev -- --host 127.0.0.1
```

Open the printed local URL. The default route is Factory Overview; choose Run
Player and press Run to play the complete seed workflow.

## Targeted Verification

```bash
npm test
npm run test:safety
```

`npm test` verifies deterministic transitions, authorization, trip holds, and
trace replay. `test:safety` rejects side-effect-capable imports and private or
host-specific source patterns.

## Build

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

The static product is written to ignored `dist/`.

## Full Verification

```bash
npm test
npm run test:safety
npm run build
node ../tools/spec-workbench.mjs render --path .
node ../tools/spec-workbench.mjs doctor --path .
```

From the parent Foundry producer root, also run the product suite named by its
`RUNBOOK.md` and the source-root validation for the immutable producer ref.

## Under-One-Minute Demo

1. Open `/run`.
2. Press **Run** and change speed to **4×**.
3. Watch the Job Order descend to Actuality, change Pawn → Agent only after
   Canon, then return to the Projection mirror.
4. Reset, step to Grounding, press **Inject Trip**, and confirm the trace shows
   Gatehouse signal → Assay check → Ward report without moving floors.
5. Open Governance and History; confirm the same active run and trace remain.

## Recovery

- Bad local history: use **Clear history** on the History page. Seed workflow
  and active run are unaffected.
- Stuck run: press **Pause**, then **Reset**. Both are local reducer events.
- Build output drift: remove ignored `dist/` and rerun `npm run build`.
- The app has no production adapter to recover. If one appears, stop and treat
  it as a safety-boundary violation.
