# Foundry Schematic Blueprint

> Generated from LLM Workbench v2.3.

**Status:** active
**Product home:** separately owned Projection product, colocated at `Schematic/`

## What This Project Is

**Product anchor:** The Schematic is the visualization of what the Foundry is going to be once it is fully built.

Foundry Schematic is a separately owned, deterministic, non-executing
future-Foundry simulator. It turns the owner's described future Foundry into an
interactive visual blueprint: The Foundry tab is its spatial, rotatable model,
and Workflow simulates how that intended system should run. A user can follow
one explanatory Job Order through Governance Planes, Halls, the workspace,
Passageways and Crossings, worker changes, evidence, and an append-only trace
without granting the app any production authority.

It is not the Foundry native product interface, not a Command Information Center
surface, and not a view of live Actuality. It does not model the present source
tree, deployment, rollout progress, or implementation gaps. Those present-state
facts do not constrain or overwrite the future model; the model changes when
the owner changes the described future Foundry.

The Schematic remains producer-only during migration. S-035 requires the next
authorized Shipping artifact to include it in the Foundry product only after
named Proof and independent Assay gates pass. Product inclusion does not merge
ownership: authoring remains here, and installed or deployed copies never write
back into producer Canon.

Its separately owned product pipeline owns `schematic-projector`. That pipeline
may consume only public-safe checked-in Canon/schema fixtures and must reject
private lifecycle refs, Journal events, Gauge feeds, CIC state, repository
topology, machine/worktree identities, operational captures, and
identity-leaking derived digests. Design may supply named inputs but does not
own or absorb this projector.

**Core promise:** explore the intended end-state Foundry as a rotatable factory
campus, then follow one deterministic Job Order through its six identical
Governance floors while structure, Plane, location, activation, evidence,
inspector, and trace stay in sync.

**Primary user:** a Foundry designer or operator exploring how a workflow should
behave before any real execution contract exists.

## Ownership And Composition Model

The stable model is the relationship grammar; component names, counts, and layouts are versioned scenario data.

- The Foundry owns and composes Halls and Modules into one portable system.
- A Hall owns its capability boundary and Socket contracts. Halls may be added,
  retired, split, or combined without changing what a Hall means.
- A Socket is a typed contract and connection boundary, never a room or product.
  The Hall owns the contract and registry; an instance owns the active binding.
- A Module is a replaceable product that implements one or more Sockets. A
  Socket may have multiple candidate Modules while an instance binds one active
  implementation at a time.
- Containment follows `Foundry → Factory → Workshop → Workbench`. That
  parent-child hierarchy is distinct from Hall ownership and Socket binding.
- The producer‑to‑product relationship is one-way: authoring happens in the
  producer; a product is its cleaned, publishable output and never authors back.
- A Job Order makes the relationships move. Workflow shows which owner receives
  it, which contract carries it, which worker acts, what product is produced or
  changed, and what evidence and passage receipts return.

The Schematic must therefore remain useful when a scenario adds or removes a
Hall, replaces a Module, rebinds a Socket, introduces another Factory, or changes
a producer/product chain. The concrete scenario changes; the relationship
grammar and simulator semantics remain legible.

## Founding Prompt

> “Build the standalone Foundry Schematic web app from the FND-05 visual baseline, starting with a playable Job Order run.”

> “I want the floor plan layout we have, but duplicated for each governance plane and stacked so you can see that they are floors of the foundry. So the foundry is more like a factory with 6 floors, where the top floor is a mirror that shows off everything that is happening in the bottom 5 floors, and the bottom floor is where the real work is being done. So the second floor would be cannon, 3rd grounding, etc.”

> “Create this inside of the foundry.”

The original six-storey concept remains accepted. The final information
architecture narrows where it appears: Workflow uses one category-only
Halls/Modules/Sockets plan, Governance alone owns the full stack and selected
top-down floor guide, and The Foundry opens on the whole multi-building campus.

## Product Map

```text
Schematic/
|-- src/domain/       deterministic scenarios, transitions, and replay
|-- src/store/        one shared run provider and browser-local history
|-- src/assets/       project-owned architectural floor imagery
|-- src/components/   app shell, campus, floor stack, Job Order, inspectors
|-- src/view/         validated local view-control state and display contracts
|-- src/quality/      integrated floor, fixture, view, run, and seam contracts
|-- src/pages/        seven synchronized product views
|-- tests/            focused engine, Atlas, Job Order, quality, and safety tests
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
| Storage | Immutable versioned seed data plus a browser-local scenario library and run history | Editable and portable offline without a server |
| Testing | Node built-in test runner | Deterministic domain tests with no browser dependency |
| Deployment | Static `dist/` artifact plus guarded instance release | Portable static artifact; the instance-private binding owns its live home while production endpoint proof remains mandatory |

## Release Contract

`http://127.0.0.1:5173/` is the test endpoint only. The owner-visible
production/presentation endpoint is `http://foundry.example:5173/`; no Schematic
change is accepted as released until it has been installed into the configured
instance deployment home and verified at that production URL.

The tracked product exposes a guarded release command but never tracks an
instance deployment path, service configuration, credentials, browser state,
or runtime receipt. Its instance-private configuration supplies the live home.
The command runs the source suite, builds `dist/`, replaces only the deployment
home's static artifact, and probes the production URL. A desktop browser check
for the documented routes, overflow, and console cleanliness remains the final
presentation gate.

## Six-Floor Factory

Every Governance plane derives its top-down Hall plan from the declared future-
model Projection around the central Foundry Workspace. Hall identities, names,
count, and placement come from the selected target fixture rather than the
renderer. An owner-settled change to the future model updates the declaration,
its signature, and every derived surface. The displayed Governance stack is:

1. Actuality — terminal work floor; visually weightiest.
2. Canon — issued authority and governing rules.
3. Grounding — verified placement, evidence, and receipts.
4. Enduring Context — durable meaning and boundaries.
5. Intent — requested outcome and disposition.
6. Projection — freshness-bearing view of the five floors below.

The same Job Order token moves vertically through the stack. Projection can
mirror and route; it cannot authorize. An Agent appears only after the modeled
Canon issue earns the named access.

The stack is the vertical Governance model used only by Governance, not the
Workflow or universal shell. It retains an unmistakable
2.5D-to-near-3D silhouette: all floors remain visibly separate, depth cues
survive every supported rotation, and Actuality remains the physical base.
Each floor is the same declarative plan. Selecting one can shift the explanation
to a detailed top-down view without implying a different building.

Journey-task selection is a focus-only view state. The left Job Order rail is
grouped by spec and task, highlights the current task and its owning spec, and
can focus another task without mutating the engine or hiding the live position.
The stack simultaneously highlights the live Governance Plane and Foundry
location so the rail, model, inspector, and append-only trace describe one
simulation state.

## Seven-View Information Architecture

The primary navigation is fixed and ordered:

1. **The Foundry** — opening rotatable campus showing the complete composition
   and dual-Factory deployment.
2. **Workflow** — five premade Job Order simulations, a synchronized execution
   rail, deterministic transport and trace, and one category-only
   Halls/Modules/Sockets plan.
3. **Halls** — individual Hall purposes, boundaries, and spatial maps.
4. **Sockets** — capability contracts, Hall homes, ports, bindings, and
   no-reach-around boundary.
5. **Modules** — replaceable supporting products, implemented sockets, fit,
   and installation boundary.
6. **Workbench** — one Workshop's operating surface: Contract, Canon,
   Wiki/brain, specifications, tools, skills, and tests.
7. **Governance** — the six Planes, Authority Order, Clearance, elevator
   transitions, Gatehouse checks, the sole full FactoryStack, and selected-floor explanation.

Workflow Library, Run Player, and History are regions within Workflow rather
than primary destinations. Route and selection changes preserve the same run
provider and cannot mutate Job Order state.

## End-State Foundry Campus

The Foundry view depicts the completed product rather than only currently
implemented machinery. A dominant six-storey Factory contains its native Halls
and Workshops. Replaceable Module buildings surround it. Sockets are rendered
as typed ports and connection infrastructure, never as buildings. A second
Factory shows how one portable Foundry composes across two host deployments.
Supporting facilities may make the campus believable, but visual presence does
not grant them Hall, Module, socket, or production authority.

The campus is declarative and public-safe. Rotation, selection, and camera
state are explanatory only. The generated end-state concept under
`docs/design/` is Grounding for composition and atmosphere; this Blueprint and
the stable specs remain architecture Canon.

## Schematic Controls

Sliders and toggles are part of the product model, not developer-only debug
controls. The core control surface provides resettable, keyboard-operable
controls for:

- campus or Factory horizontal rotation and vertical viewing angle;
- floor separation/depth emphasis where the Governance stack is present;
- playback speed;
- route, Crossing, label/detail, and inactive-floor visibility or intensity;
- reduced-motion-safe run, pause, step, replay, reset, and deterministic trip
  injection.

Every visual control changes browser-local explanatory state only. No control
may read live Foundry state, issue authority, or perform an Actuality change.

Task-oriented presets remain available where they answer the current view:
Factory Overview, Follow Job Order, Explain Crossing, and Inspect Selection.
Raw sliders and toggles stay under Advanced. Every mode is explanatory
browser-local state and cannot change the run, trace, authority, evidence,
focused task, or selected component.

## Modularity Contract

Atlas structure, the 2.5D renderer and view controls, deterministic runtime,
Job Order fixtures, inspectors, and quality gates communicate through explicit
data contracts. A Foundry component, floor, workflow, spec, or task fixture can
change without requiring a rewrite of the renderer or engine. The stable seams
are verified independently before the integrated browser gate runs.

## Workflow Proof Simulations

Workflow ships five immutable public-safe simulations. The default maps the
Canonical flight cycle exactly: Sitrep, Preflight, Launch-flight, In-flight,
Landing-check, Land, and PostFlight-check. The four retained examples create and
assign a Job Order, update a product from its producer, review a harness, and
recover a release. Each scenario drives the same deterministic Run and persistent Job
Order through its own ordered steps. The left execution rail derives every
step's complete/active/queued state, Governance Plane, and Clearance read/write
bands from that Run. The center plan places Halls and Modules around the central
Workspace and draws Sockets only as typed conduits and ports between them; it
shows the current route, worker, passage receipt, progress, and append-only event
trace without turning a Socket into a room.

The flight-cycle scenario keeps one Job Order identity through all seven gates.
Its evidence exposes the outgoing handoff or terminal receipt at each boundary;
Landing-check rejection returns to In-flight, a moved Land target produces a
new candidate and repeats Landing-check, and PostFlight-check names closed,
delivered-unclosed, or recovery-required truth. The playable seed follows the
normal closed path and describes the returns without pretending the Schematic
contains a branching executor or that S-037's unfinished automation is live.

The harness-review scenario retains the original full governance journey:

```text
Projection → Intent → Enduring Context → Grounding → Canon → Actuality
           → Grounding → Canon → Enduring Context → Intent → Projection
```

Pawns route, capture, ground, issue, retain, dispose, and project. The Agent
performs only the bounded audit work after Canon issue. A trip injection pauses
advancement and visibly records Gatehouse signal → Assay check → Ward report.

## Local Scenario Portability

The shipped Workbench Feedback audit remains an immutable seed. A user may
duplicate it into a browser-local scenario, edit the copy through validated UI,
select it, and run it through the same deterministic engine and Job Order
projection. Local scenario state never grants authority and never reaches a
server, repository, CIC, Module, provider, or executor.

Portable scenarios use one explicit versioned JSON codec. Export produces a
validated public-safe document. Import parses and validates the version,
scenario shape, identifiers, steps, and Job Order graph before committing any
browser-local change. Malformed input, unsupported versions, duplicate
identities, and dangling spec/task/step relationships are refused visibly and
atomically; the immutable seed and existing local scenarios remain unchanged.
A scenario may declare one public-safe `terminalResult`; the engine persists it
only at the final step. Existing version-1 documents that omit the field retain
their prior `audit-complete` result for backward compatibility.

## Design Decisions

- Keep the product anchor future-facing: The Foundry tab visualizes the fully
  built target and Workflow simulates how that target system should run. Never
  derive Schematic direction from current implementation or rollout state.
- Preserve the FND-05 dark technical-blueprint language: square geometry, thin
  cyan rules, condensed uppercase chrome, restrained Hall colors, and amber
  structural crossings.
- Use the full campus as the opening structural map; use the six-storey cutaway
  only for Governance; keep Workflow category-only and use one top-down floor
  plan for Governance spatial explanation.
- Keep application controls, labels, focus, and run state code-native and
  accessible; project-owned raster assets supply the architectural glass and
  industrial depth that code-native rectangles cannot reproduce faithfully.
- Persist completed/reset runs only; active state remains in memory so old local
  data cannot hide seed or visual fixes.
- Treat persisted history as untrusted input: Replay validates every archived
  transition and snapshot against its frozen scenario before changing selected
  scenario or run state. A persisted paused Replay overlay must resolve one
  distinct, recursively valid source entry with consistent scenario, trace, and
  Job Order content; only the provider's exact live Run bypasses persisted
  lineage resolution for immediate Transport Replay. Refusal is atomic across
  session and local storage.
- Keep the shipped seed immutable. Editable scenarios are explicit local copies;
  selecting a copy changes the deterministic scenario input, not the simulator's
  authority or public-safety boundary.
- Version scenario export/import independently from run-history storage and
  fail closed before any local-library mutation.
- Keep all simulator transitions pure. A future real executor requires a new
  socket/authority design and cannot be smuggled into this engine.

## Non-Goals

- CIC integration, authentication, collaboration, server storage, or telemetry.
- Real command, repository, runtime, agent-dispatch, or publication execution.
- Settling open Gatehouse or Shipping definitions through prototype behavior.
- Replacing the Foundry reference drawing series.

## Capability Catalog

<!-- spec-catalog:start -->
| FUID | Spec alias | Description | Status | Created | Last worked |
|---|---|---|---|---|---|
| unassigned | [S-001 - Playable Job Order Run](specs/S-001-playable-job-order-run/SPEC.md) | Deliver the first deterministic playable Job Order run and synchronized six-floor app surface. | complete | unassigned | unassigned |
| unassigned | [S-002 - Rotatable Stacked Foundry Atlas](specs/S-002-rotatable-stacked-foundry-atlas/SPEC.md) | Make the six-floor Atlas a rotatable spatial factory where a Job Order moves within each floor before changing Governance Planes. | complete | unassigned | unassigned |
| unassigned | [S-003 - Structured Job Order Navigator](specs/S-003-structured-job-order-navigator/SPEC.md) | Synchronize grouped specs and tasks with the current simulation floor and location. | complete | unassigned | unassigned |
| unassigned | [S-004 - Schematic Control Surface](specs/S-004-schematic-control-surface/SPEC.md) | Provide task-oriented view presets plus resettable advanced controls for view, intensity, visibility, and playback. | complete | unassigned | unassigned |
| unassigned | [S-005 - Modular Simulator Quality Gate](specs/S-005-modular-simulator-quality-gate/SPEC.md) | Prove module boundaries, readable interface scale, 2.5D fidelity, synchronized state, accessibility, responsiveness, and public safety. | complete | unassigned | unassigned |
| unassigned | [S-006 - End-State Foundry Campus Atlas](specs/S-006-model-first-foundry-exploration/SPEC.md) | Open the Schematic on a rotatable end-state Foundry campus showing a dual-Factory deployment, Halls, Module buildings, socket connections, Workshops, and Workbenches. | complete | unassigned | unassigned |
| unassigned | [S-007 - Seven-View Product Shell](specs/S-007-seven-view-product-shell/SPEC.md) | Establish the exact seven primary Schematic views and preserve one deterministic Run while navigating among them. | complete | unassigned | unassigned |
| unassigned | [S-008 - Spatial Job Order Workflow](specs/S-008-spatial-job-order-workflow/SPEC.md) | Unite scenario selection, Job Order playback, Governance-floor movement, activation timing, and trace inside the singular Workflow view. | complete | unassigned | unassigned |
| unassigned | [S-009 - Foundry Component Reference](specs/S-009-foundry-component-reference/SPEC.md) | Power the Halls, Sockets, Modules, and Workbench tabs from one validated public-safe component registry. | complete | unassigned | unassigned |
| unassigned | [S-010 - Governance Floor Guide](specs/S-010-governance-floor-guide/SPEC.md) | Explain the six Governance Planes through the complete factory-floor stack and one selectable top-down repeated floor plan. | complete | unassigned | unassigned |
| unassigned | [S-011 - Final Schematic Quality Gate](specs/S-011-final-schematic-quality-gate/SPEC.md) | Prove the final seven-view end-state Schematic is structurally complete, deterministic, readable, accessible, public-safe, and demoable. | complete | unassigned | unassigned |
| unassigned | [S-012 - Local Editable Scenario Portability](specs/S-012-local-editable-scenario-portability/SPEC.md) | Duplicate, edit, run, export, and import validated deterministic scenarios through a local-only versioned boundary. | complete | unassigned | unassigned |
| unassigned | [S-013 - Final Audit Remediation](specs/S-013-final-audit-remediation/SPEC.md) | Close the final audit gaps in Replay snapshot validation, local identity allocation, and the opening-view lifecycle contract. | complete | unassigned | unassigned |
| unassigned | [S-017 - Thirteen-Hall Projection Conformance](specs/S-017-thirteen-hall-projection-conformance/SPEC.md) | Conform the local Schematic projection to the public-safe thirteen-Hall Foundry architecture and its identity, passage, and workflow contracts. | complete | unassigned | unassigned |
| unassigned | [S-018 - Guarded Schematic Production Release](specs/S-018-guarded-production-release/SPEC.md) | Release the Schematic through a guarded static-artifact flow that distinguishes its test and production endpoints. | complete | unassigned | unassigned |
| unassigned | [S-019 - Workflow Proof Simulator](specs/S-019-workflow-proof-simulator/SPEC.md) | Turn Workflow into a selectable deterministic proof surface where one Job Order visibly completes its governed Foundry journey. | complete | unassigned | unassigned |
| unassigned | [S-020 - Workflow Production Fidelity](specs/S-020-workflow-production-fidelity/SPEC.md) | Match the approved Workflow simulation concept, model Sockets as connections rather than a room, and prove the result on the configured production URL. | complete | unassigned | unassigned |
| unassigned | [S-021 - Foundry Campus Atlas](specs/S-021-foundry-campus-atlas/SPEC.md) | Add a rotatable whole-Foundry campus view that distinguishes the central Factory, external Module buildings, sockets, and instance doors. | planned | unassigned | unassigned |
| unassigned | [S-022 - Contextual Facility Navigation](specs/S-022-contextual-facility-navigation/SPEC.md) | Separate Foundry, Factory, Workflow, Workbench, and integration views while preserving the selected place and live run across drilldowns. | planned | unassigned | unassigned |
| unassigned | [S-023 - Spatial Job Order Workflow](specs/S-023-spatial-job-order-workflow/SPEC.md) | Make Workflow a focused spatial journey in which one Job Order visibly travels through the six-floor Factory without importing facility detail onto the page. | planned | unassigned | unassigned |
| unassigned | [S-024 - Workbench Facility Explorer](specs/S-024-workbench-facility-explorer/SPEC.md) | Provide a dedicated detail view for a selected floor, Hall, workspace, and Workbench without exposing live project data or crowding Workflow. | planned | unassigned | unassigned |
| unassigned | [S-025 - Canonical Integration Topology](specs/S-025-canonical-integration-topology/SPEC.md) | Visualize sockets, Module buildings, bindings, and the exterior Mirror/CIC relationship from current Canon without inheriting historical FND facts. | planned | unassigned | unassigned |
| 00007C | [S-026 - Job Order Flight Cycle](specs/S-026-job-order-flight-cycle/SPEC.md) | Map the Canonical seven-stage Foundry flight cycle into Workflow so one continuous explanatory Job Order visibly advances from Sitrep through End-flight. | complete | 2026-08-19 | 2026-08-19 |
| 00007M | [S-027 - PostFlight-check Projection](specs/S-027-postflight-check-projection/SPEC.md) | Supersede the terminal End-flight label with PostFlight-check throughout the current Job Order Flight Projection while preserving completed S-026 evidence. | complete | 2026-08-20 | 2026-08-20 |
<!-- spec-catalog:end -->
