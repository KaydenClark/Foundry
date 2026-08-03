# Foundry Schematic Agent Contract

> Generated from LLM Workbench v2.3.

This folder owns the standalone Foundry Schematic product interface. Product
direction lives in `BLUEPRINT.md`, executable commands in `RUNBOOK.md`, current
work in stable `specs/` projected to `TASKBOARD.md`, and shared terms in
`LEXICON.md`.

## Authority And Scope

Use this order: current user request; this file; verified source, tests, and
runtime; the assigned stable spec; Blueprint, Lexicon, Taskboard, and Runbook;
README and older evidence.

Agents may edit:

- `src/`, `tests/`, and root build configuration in this folder;
- `docs/design/` when preserving or comparing approved visual references;
- this project's controls and assigned stable spec;
- the parent Foundry product routing and source-root contract when the owning
  root spec explicitly includes those files.

Agents must not edit installed Modules, CIC, private instance data, credentials,
databases, runtime receipts, generated dependencies, or unrelated Foundry
components.

## Product Boundary

- The Schematic is a local deterministic simulator. It never executes commands,
  accesses repositories, dispatches workers, publishes, or changes Actuality.
- No network, filesystem, subprocess, Git, provider, Module, or CIC adapter may
  be added without a separately approved spec and public-boundary review.
- Public source and seed data describe Foundry mechanisms only. Never include
  private instance paths, filenames, task state, project contents, or secrets.
- Gatehouse Passageways, Gatehouse Crossings, tripped-Crossing behavior, and
  Shipping are reversible model language until Canon settles them.

## Engineering Workflow

1. Load one stable spec and claim one eligible ticket.
2. Add the smallest behavioral test at the pure engine or public UI seam.
3. Confirm red for the expected reason.
4. Implement the smallest complete vertical behavior.
5. Run targeted tests, then the full `RUNBOOK.md` suite.
6. Verify the visible app in a browser at desktop and mobile sizes.
7. Compare the accepted design references and final screenshots with
   `view_image`; record the fidelity ledger in the owning spec.
8. Close with named proof, documentation status, and remaining gap.

Prefer focused components and pure domain functions. Keep the run engine
separate from React, use deterministic identifiers and elapsed times, validate
scenario inputs, and fail visibly on refused transitions. Respect
`prefers-reduced-motion`.

## Verification Contract

Behavior changes require red/green tests. Before handoff run:

```bash
npm test
npm run test:safety
npm run build
node ../tools/spec-workbench.mjs render --path .
node ../tools/spec-workbench.mjs doctor --path .
```

Do not claim browser behavior, visual fidelity, or publication safety unless
those checks were actually run.
