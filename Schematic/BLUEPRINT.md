# Foundry Schematic Blueprint

> Generated from LLM Workbench v2.3.

**Status:** active
**Product home:** `Schematic/` inside the public Foundry product

## What This Project Is

Foundry Schematic is a standalone interactive model of Foundry workflows. It
lets a user play one continuous Job Order through the Governance Planes, Halls,
workspace, candidate Passageways and Crossings, worker changes, evidence, and
an append-only trace without granting the app any production authority.

**Core promise:** press Run and visibly follow the same deterministic Job Order
from Projection toward Actuality and back while every app page stays in sync.

**Primary user:** a Foundry designer or operator exploring how a workflow should
behave before any real execution contract exists.

## Founding Prompt

> “Build the standalone Foundry Schematic web app from the FND-05 visual baseline, starting with a playable Job Order run.”

> “I want the floor plan layout we have, but duplicated for each governance plane and stacked so you can see that they are floors of the foundry. So the foundry is more like a factory with 6 floors, where the top floor is a mirror that shows off everything that is happening in the bottom 5 floors, and the bottom floor is where the real work is being done. So the second floor would be cannon, 3rd grounding, etc.”

> “Create this inside of the foundry.”

## Product Map

```text
Schematic/
|-- src/domain/       deterministic scenarios, transitions, and replay
|-- src/state/        one shared run provider and browser-local history
|-- src/components/   app shell, floor stack, journey, inspector, controls
|-- src/pages/        six synchronized product routes
|-- tests/            engine, replay, safety, and scenario tests
|-- docs/design/      accepted concept references and visual QA
|-- specs/            stable local capability records
`-- controls          AGENTS, BLUEPRINT, LEXICON, TASKBOARD, RUNBOOK, MEMORY
```

## Architecture

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Browser plus Node 18+ for tooling | Portable static product and dependency-free tests |
| Language | Modern JavaScript/JSX modules | Matches the accepted React/Vite baseline |
| Frontend | React 19 + Vite 6 | Supports a stateful multipage product surface with a small build |
| Routing | Local History API router | Keeps the first slice dependency-light and preserves one provider |
| State | React context over a pure reducer | One deterministic run state across every route |
| Storage | Versioned seed data plus browser localStorage history | Tinkerable and offline without a server |
| Testing | Node built-in test runner | Deterministic domain tests with no browser dependency |
| Deployment | Static `dist/` artifact | Portable; no backend or provider configuration |

## Six-Floor Factory

Every plane uses the same top-down floor anatomy: Gatehouse, Forge, Assay, and
Ward around the central Foundry Workspace. Candidate Shipping sits outside the
canonical four-Hall plan. The displayed stack is:

1. Actuality — terminal work floor; visually weightiest.
2. Canon — issued authority and governing rules.
3. Grounding — verified placement, evidence, and receipts.
4. Enduring Context — durable meaning and boundaries.
5. Intent — requested outcome and disposition.
6. Projection / Mirror — freshness-bearing reflection of the five floors below.

The same Job Order token moves vertically through the stack. Projection can
mirror and route; it cannot authorize. An Agent appears only after the modeled
Canon issue earns the named access.

## First Workflow

The initial public-safe Workbench Feedback audit is one deterministic scenario:

```text
Projection → Intent → Enduring Context → Grounding → Canon → Actuality
           → Grounding → Canon → Enduring Context → Intent → Projection
```

Pawns route, capture, ground, issue, retain, dispose, and project. The Agent
performs only the bounded audit work after Canon issue. A trip injection pauses
advancement and visibly records Gatehouse signal → Assay check → Ward report.

## Design Decisions

- Preserve the FND-05 dark technical-blueprint language: square geometry, thin
  cyan rules, condensed uppercase chrome, restrained Hall colors, and amber
  structural crossings.
- Use a six-storey cutaway as the primary map, never a flat Hall-by-plane matrix.
- Keep application controls and labels code-native and accessible.
- Treat generated visual concepts as QA specifications, not raster UI.
- Persist completed/reset runs only; active state remains in memory so old local
  data cannot hide seed or visual fixes.
- Keep all simulator transitions pure. A future real executor requires a new
  socket/authority design and cannot be smuggled into this engine.

## Non-Goals

- CIC integration, authentication, collaboration, server storage, or telemetry.
- Real command, repository, runtime, agent-dispatch, or publication execution.
- Settling open Gatehouse or Shipping definitions through prototype behavior.
- Replacing the Foundry reference drawing series.

## Capability Catalog

<!-- spec-catalog:start -->
| Spec | Description | Status |
|---|---|---|
| [S-001 - Playable Job Order Run](specs/S-001-playable-job-order-run/SPEC.md) | Deliver the first deterministic playable Job Order run and synchronized six-floor app surface. | active |
<!-- spec-catalog:end -->
