# S-001 - Hall Architecture And Identity Registry

**Spec ID:** S-001
**FUID:** 00005E
**Status:** complete
**Priority:** 0
**Owner:** Codex
**Created:** 2026-08-12
**Last worked:** 2026-08-17
**Updated:** 2026-08-17
**Catalog description:** Establish the thirteen-Hall Foundry architecture, durable identity model, and staged passage contracts.
**Blockers:** none
**Latest event:** Fresh fixed-SHA contract and release Assays passed for `a2285f1..ba8e6e4`; S-001 is complete and ready for the audited `integration` advance.
**Next gate:** none

## Outcome

The portable Foundry contains the thirteen owner-approved native Halls, a
clear producer/product separation, durable identity rules, and a staged path to
observable, traceable Job Order flow without pretending unimplemented runtime
services already exist.

## Why It Matters

The former four-Hall map overloaded Ward, Forge, and Gatehouse. A precise
product map is required before the Schematic can faithfully visualize real
Foundry workflows or CIC can expose trustworthy live activity.

## Current Verified State

- The manifest declares thirteen native Halls plus four installed Modules.
- The existing integration, transport, and health-reporting implementation is
  now under `Halls/Gauge/` with its legacy typed ID retained as an alias.
- Gatehouse has validated passage-contract definitions but no runtime service.
- Typed component and Socket IDs (`K-###`, `F-###`, `P-###`, `M-###`,
  `G-###`) remain compatibility aliases in the validated permanent registry.

## Desired Behavior

- The manifest and physical product layout declare all thirteen native Halls.
- Every Hall has a dedicated control surface. Socket contracts can be added
  incrementally rather than fabricated in advance.
- Four-character permanent identities describe Halls, Sockets, and Modules;
  six-character permanent identities describe Job Orders and passage receipts.
- Gatehouse records mandatory protected passages, Validation returns read-only
  passage findings, and Gauge derives CIC activity/targeted notifications once
  their runtime contracts are implemented.
- Forge implements the Foundry producer; Production implements produced
  products/projects; Assay audits; Ward repairs narrowly and integrates.

## Decisions And Contracts

- The native Hall roster is Intake, Validation, Gatehouse, Orchestration,
  Design, Knowledge, Scheduling, Forge, Production, Assay, Ward, Gauge, and
  Shipping. Shipping is provisional in name only.
- No Hall is a mandatory passage merely because it exists. Orchestration selects
  needed passages; Design, Knowledge, and Scheduling are optional.
- Intake creates candidate Job Orders only. Orchestration creates Specs/tasks,
  delegates, routes, and requests schedules. Scheduling executes those schedule
  rules; it does not route or assign work.
- Gatehouse is enforcement/trace infrastructure, not an authorization or
  routing decision-maker. Each protected passage produces one append-only
  receipt bound to its Job Order and names the party responsible for returning
  Grounding.
- Validation and Assay are read-only. Validation reports per-passage findings
  to Orchestration; Assay independently audits completed results.
- Ward may make one minimal in-scope repair against existing integration checks,
  then merges passing audited work into `integration`. `integration` to `main`
  remains owner-only.
- Gauge never writes Canon or Grounding. It feeds CIC every Gatehouse passage
  and notifies affected Halls/Discord only for actionable conditions.
- Shipping turns a declared producer into a clean reproducible deployable
  product. It is not a generic component-release router.
- Permanent IDs are opaque, globally unique, and never reused. Existing typed
  IDs remain compatibility aliases until all consumers migrate.

## Non-Goals

- Implementing every Hall as a daemon or automatic agent system.
- Changing installed Module source, credentials, CIC runtime, or Discord setup.
- Giving the Schematic production authority or treating it as a Foundry release
  blocker.
- Selecting Shipping's final name.

## Dependencies And Blockers

- CIC and Discord runtime consumption is a future Module-scoped implementation;
  this product spec may define its socket/event contract but does not edit those
  installed Modules.
- Existing consumers of typed component/socket IDs require compatibility aliases
  before the opaque registry can become the only public identity.

## Vertical Implementation Slices

Tickets are temporary tracer bullets within this stable capability record.

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | 00005F | Declare the thirteen-Hall product map, migrate legacy Ward source to Gauge, and scaffold the new native Halls. | done | none | 2026-08-12 | 2026-08-12 | Red-green manifest roster test passed; manifest validation and harness-only doctor recognize 13 native Halls and 4 Modules. |
| TK-002 | 00005G | Add the permanent identity registry with typed-ID compatibility aliases and validation. | done | TK-001 | 2026-08-12 | 2026-08-12 | Identity registry tests passed; doctor validates 18 four-character Hall/Module/Socket identities, legacy aliases, and the six-character runtime policy. |
| TK-003 | 00005H | Define and validate Gatehouse passage, Validation finding, and Gauge activity Socket contracts. | done | TK-002 | 2026-08-12 | 2026-08-12 | Passage-contract tests reject wrong ID width, missing scanner metadata, Validation actions, and Gauge writes while accepting receipt/finding/activity evidence. |
| TK-004 | 00005I | Define the Orchestration-to-Production/Forge-to-Assay-to-Ward workflow contract and integration handoff. | done | TK-003 | 2026-08-12 | 2026-08-12 | Workflow handoff tests enforce Forge versus Production routing, optional Scheduling, Assay pass before Ward integration, one bounded repair, and Shipping metadata for a declared producer. |
| TK-005 | 00005J | Repair the Phase A promotion boundary end to end: classify stable Foundry specs for immutable product-source validation, preserve Schematic as a separately owned non-executing Projection product despite repository colocation, and require the responsible party in Job Order passage and workflow contracts. | done | none | 2026-08-12 | 2026-08-12 | Red/green contract parity checks passed; complete Foundry and Schematic suites passed; fixed-SHA contract Assay PASS and release Assay GO at `ba8e6e4`; remote candidate/base/main refs and private visibility verified live. |

## Acceptance Criteria

- [x] Manifest validation and harness-only doctor recognize every native Hall.
- [x] Existing Ward transport/health source is available under Gauge and a new
  Ward boundary owns repair/integration controls.
- [x] All Halls, Sockets, Modules, Job Orders, and receipts have a documented
  permanent identity migration path with no reuse.
- [x] Passage, validation, Gauge, routing, scheduling, production, audit, and
  Ward responsibilities are separately named without Gatehouse taking routing
  or policy-decision authority.
- [x] Product documentation and Schematic source model have an explicit,
  testable conformance route; the Schematic remains a non-executing Projection
  product and is not a release blocker.

## Testing Seams

- A loaded manifest rejects a missing native Hall control surface or duplicate
  component identity.
- The native-Hall fixture recognizes the complete product roster without a
  remote clone.
- Future registry tests reject duplicate/reused IDs and a runtime record using a
  four-character architectural identity.

## Verification Procedure

```bash
node tools/test-foundry.mjs
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/spec-workbench.mjs render
node tools/spec-workbench.mjs doctor
git diff --check
```

## Documentation Impact

- Root `BLUEPRINT.md`, `LEXICON.md`, `README.md`, `AGENTS.md`, `RUNBOOK.md`,
  manifest, and Hall-local controls describe the actual roster and boundaries.
- Schematic conformance work updates its own controls when the executable model
  is ready; it is not silently claimed by this initial physical-layout slice.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-12 | spec | Owner-approved Hall architecture promoted from grilling. | Verified current four-Hall manifest, Ward implementation, Gatehouse scaffold, and typed-ID contracts before promotion. | Root Blueprint, Lexicon, README, and this stable spec created/updated. | TK-001 must make the new map physically verifiable; later contracts remain blocked. |
| 2026-08-12 | TK-001 | Ticket closed | Red-green manifest roster test passed; manifest validation and harness-only doctor recognize 13 native Halls and 4 Modules. | Updated manifest, root controls, Gauge/Gatehouse controls, new Hall control surfaces, and historical reference labeling. | TK-002 must add the permanent opaque identity registry and aliases. |
| 2026-08-12 | TK-002 | Ticket closed | Identity registry tests passed; doctor validates 18 four-character Hall/Module/Socket identities, legacy aliases, and the six-character runtime policy. | Added manifest identity registry, validator, test, Runbook command, and updated S-001 current state/acceptance. | TK-003 must define the Gatehouse, Validation, and Gauge passage contracts. |
| 2026-08-12 | TK-003 | Ticket closed | Passage-contract tests reject wrong ID width, missing scanner metadata, Validation actions, and Gauge writes while accepting receipt/finding/activity evidence. | Added Gatehouse, Validation, and Gauge Socket contract artifacts, validator, test, permanent Socket identities, and Runbook command. | TK-004 must define the Orchestration-to-implementation-to-Assay-to-Ward handoff contract. |
| 2026-08-12 | TK-004 | Ticket closed | Workflow handoff tests enforce Forge versus Production routing, optional Scheduling, Assay pass before Ward integration, one bounded repair, and Shipping metadata for a declared producer. | Added Orchestration workflow Socket contract and Runbook coverage; recorded the Schematic conformance gap. | Schematic-local visual alignment still needs its own implementation slice. |
| 2026-08-12 | Phase A Assay | Fixed-SHA review blocked integration of `a2285f1..1c8a9e7`. | Manifest, Foundry doctor, identity, passage, workflow, Captain, spec-workbench, Projects, Wiki, Forge source-root/publisher self-tests, Schematic 115/115, quality 11/11, safety 4/4, build, both lifecycle doctors, project-index checks, privacy visibility, and diff check passed; immutable `foundry-source-root validate --ref 1c8a9e7` failed on unclassified `Foundry/specs/S-001-hall-architecture-and-identity-registry/SPEC.md`. Review also found that root Canon/source-root still owns and publishes Schematic as a native Foundry interface despite the locked separate Projection-product boundary, and the promoted Job Order contracts omit the locked responsible-owner field. | Findings recorded without changing completed ticket proof or merging the audited head. | One bounded Ward repair must classify the stable spec path, settle Schematic colocation without Foundry dependency/publication ownership, and encode responsible-party ownership in Canon/contract tests; then a new fixed-SHA Assay must pass before integration. |
| 2026-08-12 | TK-005 Ward repair | Implemented the single bounded Phase A repair at `27c6f4e`. | Red confirmed all three audited breaks; focused source-root, passage, and workflow tests passed. Full Foundry manifest/doctor/identity/contract/Captain/spec/Projects/Wiki/source-root/publisher checks passed; separate Schematic 115/115, quality 11/11, safety 4/4, and build passed; root lifecycle and project-index checks plus `git diff --check` passed. | Updated Foundry Canon, source-root publication boundary, Job Order contracts/tests, Runbook, README, Lexicon, and S-001. | Fresh fixed-SHA Assay of the pushed feature head is required before TK-005 may close or integration may advance. |
| 2026-08-12 | Phase A Assay | Fixed-SHA review blocked integration of `a2285f12b97d60e7adba095cdc0df182ff2e30dc..b00961d2f704d08b026b028e9caf78c833a0ccb6`. | The complete Foundry Runbook suite passed; immutable source-root validation reported 360/780 publishable paths and 0 errors; Schematic passed 115/115 tests, 11/11 quality, 4/4 safety, build, render, and doctor; GPT_OS remained PRIVATE; `git diff --check` passed. Finding: `Halls/Gatehouse/contracts/passage-receipt.json` omits `responsibleParty` from its public `required` list even though Canon and `tools/passage-contracts.mjs` require it, and the regression suite does not compare the declared contract metadata to the runtime validator. | Assay finding recorded without changing product source or merging the audited head. | On a later wakeup, one bounded Ward repair must add `responsibleParty` to the declared receipt contract and add a contract-metadata regression assertion; then a new immutable Assay must pass. |
| 2026-08-12 | TK-005 Ward repair | Aligned the Gatehouse receipt and Orchestration workflow public metadata with their runtime-required responsible-party fields. | Red: the new metadata/runtime parity assertions failed on Gatehouse's missing `responsibleParty` and Orchestration's absent required-field declaration. Green: passage, workflow, and identity checks passed; the complete Foundry Runbook suite passed; Schematic passed 115/115 tests, 11/11 quality, 4/4 safety, build, render, and doctor; `git diff --check` passed. | Updated only the two declared Socket contracts, their focused regression tests, and S-001 evidence. | Fresh fixed-SHA Assay of the repaired pushed head is required before TK-005 closes or integration advances. |
| 2026-08-12 | TK-005 Assay | Independent fixed-SHA acceptance passed for `a2285f12b97d60e7adba095cdc0df182ff2e30dc..ba8e6e41fefb6525a425999d1a6334a4206d5cbe`. | Contract Assay found no blocking findings; release Assay verified strict ancestry, full Foundry suite, immutable source-root `360/780` with zero errors, publisher boundary, Schematic 115/115 plus quality 11/11, safety 4/4, build/doctor, diff check, exact remote candidate/base/main refs, and PRIVATE repository visibility. | Completion result and closed ticket recorded without changing accepted Actuality. | none |

## Completion Result

Complete. The thirteen-Hall Foundry architecture, permanent identity registry,
passage/workflow contracts, responsible-party boundary, public source-root
classification, and separate non-executing Schematic Projection boundary are
implemented, remotely recoverable, and independently accepted. Runtime Module
bindings remain deliberately out of scope.

## Remaining Limitations Or Follow-Up Specs

- Shipping's final name remains provisional.
- Additional Halls remain possible only when real work proves a separate durable
  owner and Socket family.
- S-017 completed thirteen-Hall Projection conformance in the local Schematic.
  This root architecture record does not assert a deployed artifact's source or
  ref freshness; any public product or Schematic runtime release remains the
  separately gated S-034/TK-005 lane.

## Supersession

- Supersedes: none
- Superseded by: none
