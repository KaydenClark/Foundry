## Undeployed recovery mode

This is archived development source. Historical release procedures below do not
authorize deployment. No service or configured deployment home is supplied.

# Foundry Schematic Agent Contract

> Generated from LLM Workbench v2.3.

This folder owns the standalone future-Foundry simulator and visual blueprint.
Product direction lives in `BLUEPRINT.md`, executable commands in `RUNBOOK.md`,
current work in stable `specs/` projected to `TASKBOARD.md`, and shared terms
in `LEXICON.md`.

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
- Product anchor: The Schematic is the visualization of what the Foundry is
  going to be once it is fully built. The Foundry tab is the spatial future
  model; Workflow simulates how those intended systems should run.
- Current implementation, rollout progress, deployments, and gaps never define
  or constrain the Schematic model. Change it only when the owner changes the
  described future Foundry. It is not the native product interface or CIC.
- The Schematic remains producer-only during migration. S-035 requires the next
  authorized Shipping artifact to include it in the Foundry product only after
  named Proof and independent Assay gates pass; this project never self-
  authorizes Foundry Shipping or treats an installed/deployed copy as producer
  source.
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
6. Verify the visible app in a browser at the desktop target described in
   `RUNBOOK.md`. Mobile-phone testing is deferred and is not a required gate
   unless the owner explicitly requests a mobile presentation.
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
