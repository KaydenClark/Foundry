# Foundry Schematic

**The Schematic is the visualization of what the Foundry is going to be once it is fully built.**

Foundry Schematic is a separately owned, deterministic, non-executing future-
Foundry simulator. It turns the owner's described target into an interactive visual
blueprint: The Foundry tab shows the fully built system as a rotatable spatial
model, and Workflow simulates how those future systems should run. It does not
model the current implementation, rollout progress, deployment inventory, or
live Actuality. It is not the Foundry native product interface and not CIC. It
remains producer-only during migration. S-035 requires the
next authorized Shipping artifact to include it in the Foundry product only
after named Proof and independent Assay gates pass; installed and deployed
copies never become producer source.

The primary navigation is **The Foundry**, **Workflow**, **Halls**, **Sockets**,
**Modules**, **Workbench**, and **Governance**. The Foundry opens on a rotatable
factory campus: a dominant six-storey Factory, its native Halls, surrounding
Module buildings, visible socket infrastructure, supporting facilities, and a
second Factory showing the same Foundry deployed on another host.

Workflow contains the scenario description, player, trace, and one category-only
**Halls / Modules / Sockets** plan; it never mounts the six-floor FactoryStack.
Its architectural plan places Halls and Modules around the central Workspace;
Sockets appear only as the typed conduits and ports connecting those structures,
never as a room or building.

Workflow opens on **Job Order Flight**, which maps the intended lifecycle as
**Sitrep -> Preflight -> Launch-flight -> In-flight -> Landing-check -> Land ->
PostFlight-check**. The same explanatory Job Order and run identity cross every gate,
and each stage shows its handoff, verdict, or terminal receipt. This is a model
of Canon, not a claim that the still-open S-037 automation is implemented or
live. The normal playable path closes successfully; the stage descriptions name
the rejection, changed-candidate, delivered-unclosed, and recovery-required
returns without adding an executor.

You can also choose **Create & Assign a Job Order**, **Update a Product from its Producer**,
**Review a Harness**, or **Recover a Release**. Run, pause, step, reset, replay,
change speed, or inject a trip while the selected Job Order, ordered steps,
Governance Plane, Clearance read/write bands, worker, category route, passage
receipt, progress, and append-only trace stay synchronized.

The Workflow scenario library keeps the shipped seed immutable. Choose
**Duplicate seed**, edit the local scenario and one synchronized stage/Job Order
task title, then choose **Save local scenario**. Saving validates the complete
scenario without changing the active run; choose **Select / Start** separately
to create a new run for the saved copy. Local copies persist only in this
browser, while a reload always selects the recoverable seed by default.

Each saved local scenario exposes **Export JSON**. The deterministic document
uses transfer kind `foundry-schematic-scenario` and format version `1`, and
contains only the validated scenario and Job Order graph—not run history,
receipts, provider state, or browser/runtime data. **Import JSON** accepts one
native local file, refuses malformed, unsupported, colliding, incomplete, or
dangling data before changing the library, and leaves an accepted import
inactive until **Select / Start** explicitly creates its run.

Replay is a frozen local projection. Transport Replay or Replay from archived
Workflow history creates a new run identity, restores the selected step, trace,
Job Order, speed, and trip count, records the source run as `replayOf`, and opens
the reconstructed run paused. Before installing that state, Replay validates the
complete archived entry and every trace snapshot against its frozen source
scenario. Persisted Replay-of-Replay also requires `replayOf` to resolve one
distinct, scenario-consistent source entry with the same trace and Job Order;
missing, self-referential, or inconsistent lineage is refused. A refused record
is shown as an error and leaves the current session, history, and local scenario
library unchanged.

The left execution rail shows every step in the selected Job Order together
with its complete, active, or queued state, Governance Plane, and Clearance
read/write bands. Selecting a completed step focuses its frozen proof without
moving the live run; **Return to live step** restores the current position. The
center stage keeps one Job Order token moving through one Halls, Workspace,
Modules, and Sockets plan while Gatehouse-checked Plane transitions append
receipts and trace events.

Governance is the sole FactoryStack surface and retains an interactive Atlas
rather than a fixed plate. Every storey derives one wide Hall plan from the
declared future-model fixture. Hall identities, count, and placement are
scenario data, not renderer invariants: an owner-settled change to the future
Foundry changes the projection, signature, and all derived surfaces together.
Use the orbit and tilt controls to inspect the plan from every side. Select a
floor label, Hall/room, Crossing, or the active Job Order token to read its
details while the complete six-floor composition and live run remain visible.

The Schematic control bar exposes native sliders for rotation, view angle,
floor depth, playback speed, route intensity, Crossing intensity, and inactive-
floor emphasis. Toggles turn route, Crossing signals, room details, and inactive
floors down to structural context; **Reset View** restores the locked default
without changing the current task or trace.

Task-oriented presets put the common questions first: see the whole Factory,
follow the live Job Order, explain its next Crossing, or inspect a selected
part. A model-first Follow mode keeps the live floor, Hall, and next Crossing
prominent while the supporting rail and inspector become optional drawers.
Selecting a floor, Hall, Crossing, or token opens an explanatory spatial
inspector without changing the deterministic run.

Halls, Sockets, Modules, and Workbench provide dedicated reference views over
the future model's relationships, ownership boundaries, contracts, and
composition. Governance explains the Authority Order and lets a viewer compare
its full stack with one selected top-down floor.

The durable model is relational rather than roster-shaped. The Foundry composes
Halls and Modules; Halls own capability boundaries and Socket contracts; Modules
implement those contracts as replaceable products; instances own bindings; and
`Foundry → Factory → Workshop → Workbench` expresses containment. Workflow
then shows a Job Order moving through those owners, children, contracts,
producers, and products. Concrete names and counts belong to the selected future
scenario and can change without redefining the Schematic.

The simulator cannot execute commands, access repositories, dispatch workers,
publish artifacts, or change Actuality. See [RUNBOOK.md](RUNBOOK.md) to run it
locally and [BLUEPRINT.md](BLUEPRINT.md) for the six-floor model.

## Access

Run `npm run dev`, then open `http://127.0.0.1:5173/` for local test
validation. The development server is intentionally bound to all host
interfaces on the fixed port, while the application itself remains a local
deterministic simulation with no network adapter.

An adopting instance may designate a separate configured live deployment home.
A worktree or preview elsewhere is not a live release; the instance's private
runbook owns the concrete path and the served-process verification. The
owner-visible production endpoint is `http://foundry.example:5173/`. Release it
only with `npm run release -- --config /private/path/schematic-release.json`,
then perform the required production browser check at that URL.
