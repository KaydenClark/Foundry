# S-001 - Playable Job Order Run

> Generated from LLM Workbench v2.3. This stable path never moves.

**Spec ID:** S-001
**Status:** active
**Priority:** 0
**Owner:** codex
**Updated:** 2026-08-03
**Catalog description:** Deliver the first deterministic playable Job Order run and synchronized six-floor app surface.
**Blockers:** none
**Latest event:** TK-001 closed with proof.
**Next gate:** Complete TK-002.

## Outcome

A user can press Run and follow one continuous public-safe Workbench Feedback
audit through all six Governance floors to Actuality and back to the Projection
mirror. Every route reads the same run, controls are real, trace is append-only,
and the simulator cannot perform production work.

## Current Verified State

- The accepted FND-05 visual and new six-floor Run Player concept are preserved
  in `docs/design/`.
- The deterministic engine, six product routes, synchronized run provider,
  responsive Factory stack, transport controls, trip response, and local run
  history are implemented.
- App, safety, build, browser, and visual checks pass; the simulator exposes no
  side-effect-capable adapter.

## Decisions And Contracts

- The stable public engine seam is `createRun`, `transitionRun`, and
  `replayTrace` in `src/domain/engine.js`.
- Semantic run time, identifiers, traces, and replay are deterministic.
- An injected trip holds the current floor and records Gatehouse signal, Assay
  check, and Ward report before a separate resume event.
- React consumes the engine through one provider above route selection.
- Local history is optional projection data; it never changes scenario or run
  semantics.

## Non-Goals

- Editable workflows, import/export, servers, collaboration, CIC, or execution.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Deliver the seed scenario, pure engine, replay, shared provider, six product routes, six-floor Factory, transport controls, responsive styles, and local history as one playable path. | done | none | Engine, safety, build, browser desktop/mobile, route synchronization, trip/replay, and visual fidelity checks passed; see docs/design/QA.md. |
| TK-002 | Add editable scenario duplication and versioned JSON import/export after the seed contract is accepted. | ready | TK-001 | Schema/round-trip tests and browser demo |

## Acceptance Criteria

- [x] Exact six-floor order and repeated floor plan are visible.
- [x] All required controls change deterministic run state.
- [x] Pawn cannot become Agent before Canon issue.
- [x] Trip injection holds position and records the three-part response.
- [x] Replay reproduces the same run snapshots.
- [x] Six routes preserve one active run.
- [x] Public safety, build, responsive, accessibility, and visual checks pass.

## Testing Seams

- Pure reducer input/output and trace fold.
- Static safety scan over shipped source.
- Browser controls, navigation, and responsive screenshots.

## Verification Procedure

```bash
npm test
npm run test:safety
npm run build
```

## Documentation Impact

- Project controls, user README, and visual QA ledger are part of this slice.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-03 | genesis | Created the public-safe project control surface and first local spec under the parent S-029 authorization. | Pending red test. | AGENTS, Blueprint, Lexicon, Taskboard, Runbook, Memory, README, S-001. | Engine and app implementation. |
| 2026-08-03 | TK-001 | Delivered the pure deterministic run engine and one shared React run surface across six routes. The complete audit descends from Projection to Actuality and returns; an injected trip holds its floor while recording Gatehouse, Assay, and Ward evidence. | Red test failed on the missing engine; green `npm test` passed 9/9, `npm run test:safety` passed 3/3, and `npm run build` passed. Browser QA passed at 1536 × 1024 and 375 × 844 with all routes, controls, trip/resume, completion, replay, zero console errors, and no horizontal overflow. Final renders were compared directly with the accepted baseline and generated concept. | Filled project controls, README, Runbook, source comments, and `docs/design/QA.md`; preserved baseline, concept, and checkable screenshots. | Editable scenario duplication/import/export remains TK-002. |
| 2026-08-03 | TK-001 | Ticket closed | Engine, safety, build, browser desktop/mobile, route synchronization, trip/replay, and visual fidelity checks passed; see docs/design/QA.md. | Project controls, README, Runbook, local spec, and visual QA ledger updated. | TK-002 remains ready for editable scenario duplication and versioned import/export after owner acceptance. |

## Completion Result

In progress.

## Supersession

- Supersedes: none.
- Superseded by: none.
