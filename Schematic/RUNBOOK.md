# Foundry Schematic Runbook

> Generated from LLM Workbench v2.3.

Run commands from the `Schematic/` directory.

## Prerequisites

- Node.js 18 or newer
- npm

No account, credential, environment variable, database, browser extension, or
provider connection is required.

## Launch Preflight

From the WORKSPACE worktree root, validate one local Schematic ticket before
claiming or changing behavior:

```bash
node tools/preflight.mjs \
  --root Foundry/Schematic \
  --repo . \
  --push-to BRANCH \
  --spec S-### \
  --ticket TK-###
```

`Foundry/Schematic/tools/protected-checkouts.json` keeps local-root resolution
public-safe and points the gate at the tracked Foundry skills snapshot. Replace
`BRANCH` with the explicit same-name recovery branch; never use a bare push.

## Install

```bash
npm ci
```

## Run Locally

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`. This is the test endpoint only. The development
server listens on all host interfaces, uses port 5173 exclusively, and fails
rather than silently selecting another port. The default route is The Foundry;
choose Workflow and press Run to play the default seven-stage Job Order flight.

## Targeted Verification

```bash
node --test tests/scenario-library.test.js
node --test tests/scenario-portability.test.js
node --test tests/projection-drift.test.js
npm test
npm run test:quality
npm run test:safety
```

The focused Workflow proof tests verify the default seven-stage flight map plus
four retained immutable premade simulations,
scenario identity isolation, synchronized step/Plane/Clearance presentation,
passage receipts, completion, and the Workflow-only composition boundary. The
focused scenario-library test verifies seed isolation, deterministic local
identities, full scenario and Job Order validation, atomic browser storage,
seed-default reload, explicit run selection, and the bounded Workflow controls.
The focused portability test verifies deterministic public-only JSON, the
independent transfer kind/version, exact envelope and nested field allowlists,
insert-only identity collision refusal, atomic persisted/provider state, valid
roundtrip, explicit run start, exact download bytes and deferred Blob cleanup,
visible synchronous download/file-read refusal, and retry-safe native upload.
`npm test` verifies deterministic transitions, authorization, trip holds, and
trace replay. `test:quality` fail-closes integrated drift across the exact
seven-view shell, end-state campus, six-floor Governance model, Job Order,
reference registry, run-isolation, QA receipts, and final demo path.
`test:safety` rejects side-effect-capable imports and private or host-specific
source patterns.
`projection-drift` verifies the checked-in future-model Projection signature and
that campus, reference, Atlas, Workflow, Governance, and owning controls do not
silently diverge from the declared target fixture. The roster is scenario data,
not current implementation inventory or a fixed numeric invariant; an owner-
settled future-model change updates the projection and its signature together.

## Build

```bash
npm run build
npm run preview
```

The static product is written to ignored `dist/`. A worktree preview is test
evidence only; it never satisfies production release acceptance.

## Live Deployment Contract

`http://127.0.0.1:5173/` is test only. `http://foundry.example:5173/` is the
production/presentation endpoint and final owner-acceptance target.

An adopting instance defines one configured live deployment home outside the
public source checkout. A worktree, test server, or built artifact elsewhere is
not live. Its private configuration (not tracked in Foundry) contains:

```json
{
  "schemaVersion": 1,
  "deploymentHome": "/private/instance/path"
}
```

Release through the guarded command:

```bash
npm run release -- --config /private/path/schematic-release.json
```

It refuses a test endpoint or a deployment home overlapping the source worktree, runs `npm test`,
`npm run test:quality`, `npm run test:safety`, and `npm run build`, atomically
replaces only the configured deployment home's `dist/`, and requires an HTTP
200 response with the Schematic document title from the production endpoint.
After it succeeds, browser-check that production URL at the desktop target:
the documented routes, no horizontal overflow, and no console warnings/errors.
Only then call the release live.

Do not copy dependencies, build output, logs, credentials, browser state, or
other runtime-only material back into this public product source.

## Visual Verification Target

The current Schematic presentation target is a standard 27-inch desktop
monitor. Treat desktop layout, readability, controls, and overflow behavior at
that target as the required visual gate. Verify all seven routes, the thirteen
Hall/reference/Governance surfaces, category-only Workflow, the single
Governance FactoryStack, keyboard focus, no horizontal overflow, and no
console warnings/errors.

Mobile-phone and narrow responsive testing are intentionally deferred. Do not
block Schematic work on mobile screenshots or emulation; revisit that coverage
only when the owner explicitly requests a mobile presentation. Existing mobile
screenshots and QA notes are historical evidence, not a current acceptance
requirement.

## Full Verification

```bash
npm test
npm run test:quality
npm run test:safety
npm run build
node ../tools/spec-workbench.mjs render --path .
node ../tools/spec-workbench.mjs doctor --path .
```

From the parent Foundry producer root, also run the product suite named by its
`RUNBOOK.md` and the source-root validation for the immutable producer ref.

## S-012 portability browser proof

At 1440 × 1000 in **Workflow**:

1. Duplicate and save a local scenario with one edited scenario title and one
   synchronized stage/Job Order task title. Choose **Export JSON** and confirm
   the browser downloads the deterministic
   `SCENARIO-ID.foundry-schematic.v1.json` file.
2. Choose **Import JSON** and upload that same file twice. Both attempts must
   visibly refuse the existing local identity, including scenario id, shortId,
   and Job Order id collisions. The second attempt proves the native file input
   permits same-file retry. Confirm the selected scenario, active run, trace,
   history, and listed local records are unchanged.
3. From copies of the exported public-safe file, upload each refusal fixture:
   malformed JSON, `formatVersion: 2`, a missing scenario title, a duplicated
   step id, and a task `stepId` that names no step. Each must show an actionable
   alert and preserve the same active state and local library.
4. Keep the exported file, clear only
   `localStorage["foundry-schematic.scenarios.v1"]` using the Recovery command
   below, and reload. Confirm the immutable seed is active; import the valid
   file and confirm the local scenario appears without starting or selecting
   it. Choose **Select / Start**, run at **4×**, and confirm the imported title,
   synchronized Job Order task, inspector, and trace complete without semantic
   drift.
5. Confirm no console warning/error, no horizontal page overflow, and no
   network request or server/provider interaction during download, refusal,
   import, selection, or playback.

## Workflow proof demo

At 1536 × 1024 in **Workflow**:

1. Confirm **Job Order Flight** is selected and the execution rail lists exactly
   **Sitrep**, **Preflight**, **Launch-flight**, **In-flight**,
   **Landing-check**, **Land**, and **PostFlight-check**. The boundary must say the
   simulation is modeled and not live automation.
2. Choose **4×**, press **Run**, and confirm one Job Order/run identity reaches
   **PostFlight-check**, progress reads **7 / 7**, the terminal Plane is Projection,
   the status is completed, and the trace has one initialization plus six
   advancement events. Inspect the stage descriptions for the rejection,
   changed-candidate, delivered-unclosed, and recovery-required return paths.
3. Select **Update a Product from its Producer** and press **Step** twice.
   Confirm the left rail shows two complete steps and **Verify producer and
   target** active on **F3 Grounding**, with Projection-through-Grounding read
   clearance and Grounding write clearance.
4. Confirm the same Job Order token is in Halls, the latest append-only receipt
   records the Gatehouse-checked Crossing, progress reads **2 / 8**, and the
   trace contains the initialization plus both completed transitions.
5. Continue to **Integrate the product update**. Confirm the Job Order token
   moves onto the highlighted Socket conduit between Halls and Workspace, and
   that Sockets are labeled as typed conduits/ports rather than drawn as a room.
6. Select **Recover a Release**, choose **4×**, and press **Run**. Confirm all
   eight steps complete, the order returns to Projection, and the transport
   reports `COMPLETED`.
7. Select **Create & Assign a Job Order** and press **Inject Trip**. Confirm the
   held trace reads Gatehouse signal → Assay check → Ward report and no step is
   dispatched.
8. Confirm zero Workflow `FactoryStack` instances, no horizontal page overflow,
   legible keyboard focus, and no console warning/error. Repeat the selector and
   rail smoke check at 390 × 844.

## Final seven-view demo

1. At 1440 × 1000, open **Workflow** and choose **Duplicate seed**. Clear the
   local scenario title and confirm **Save local scenario** visibly refuses it
   without changing the active seed run. Enter a distinct scenario title, edit
   one stage/task title, save, reload, and confirm the seed is active while the
   saved local copy remains listed. Choose **Select / Start**, choose **4×**,
   run to completion, and confirm the edited title appears in the synchronized
   Job Order, Workflow, inspector, and trace while the seed remains unchanged.
2. Open **The Foundry** and rotate the campus. Identify the dominant Factory,
   the second deployment, surrounding Module buildings, and visible Socket
   conduits. Press **Home** to reset the view.
3. Open **Workflow**, select one premade simulation, choose **4×**, and press
   **Run**. Watch one Job Order move through the category-only Foundry plan while
   its left-side steps, Governance Plane, Clearance bands, passage receipts,
   progress, and trace remain synchronized.
4. Confirm the completed order returns to Projection with its append-only trace;
   then reset, step to Grounding, and press **Inject Trip**. Confirm the held
   trace reads Gatehouse signal → Assay check → Ward report.
5. Reset a nonzero run into Workflow history, select its **Replay** action, and
   confirm a new run ID opens paused at the archived step with the archived
   trace and Job Order. Repeat with Transport **Replay** and confirm it restores
   the current frozen run rather than returning to Projection step zero.
6. Open **Halls**, **Sockets**, **Modules**, and **Workbench**. Inspect one typed
   relationship and confirm the same run ID and state persist across all four
   reference views.
7. Open **Governance**. Select Grounding and confirm the full six-floor stack,
   factory-floor metaphor, Authority Order, Gatehouse transition rule, and one
   selected top-down copy of the identical floor plan remain visible.

The deterministic baseline completes in well under one minute at 4× on the
required desktop target. No step dispatches work or changes Actuality.

## Recovery

- Bad local scenarios: in the browser console run
  `localStorage.removeItem("foundry-schematic.scenarios.v1")`, then reload. This
  removes only the versioned local scenario library; it does not clear run
  history or alter the shipped seed. The product intentionally exposes no
  scenario deletion or reset control.
- Bad local history: use **Clear history** in the Workflow inspector. Seed
  workflow and active run are unaffected.
- Stuck run: press **Pause**, then **Reset**. Both are local reducer events.
- Build output drift: remove ignored `dist/` and rerun `npm run build`.
- The app has no production adapter to recover. If one appears, stop and treat
  it as a safety-boundary violation.
