# Foundry Schematic

Human-facing, local simulations for understanding designed Foundry workflows.
The current schematic is a playable 2D diorama of designed Job Order journeys;
it is not connected to a Foundry deployment, health surface, or control plane.

## Schematic Entry Point

[`foundry-schematic.html`](foundry-schematic.html) opens directly into the
**Run Player**: a six-storey Factory view with a journey rail, governance-plane
floors, a Job Order inspector, and transport controls. The Blueprint Atlas is
available under the **Factory** tab. Pick any designed workflow, then run, step,
pause, reset, or inspect its simulated route. All actors, packets, Taskboard,
Grounding, and Projection-plane states are local simulation data; the page does
not make network requests or read or change Foundry state.

[`top-down-floor-plan-studies.html`](top-down-floor-plan-studies.html) is a
historical FND-04 reversible visual-selection study. It compares three flat 2D
treatments against one fixed historical room footprint; it is not current
Foundry Canon or a topology-adoption decision.

## Playable Scenarios

Each scenario simulates a Projection-plane signal, an Intent candidate, and a
Canon-issued bounded Job Order, then returns named Grounding and a simulated
Projection capture. These are designed example states, not observations of a
running Foundry.

| Scenario | What to inspect |
|---|---|
| Foundry adoption | Product installation preserves the Factory instance boundary and binds Modules only through declared sockets. |
| Foundry release | Forge packages a generic artifact, Assay judges it independently, and only product `integration` is targeted. |
| Independent project Assay | Assay reads a scoped Workshop, returns a verdict, and hands repair back as a new ticket. |
| New Workshop | Projects, Wiki, and Workbench establish a separately owned project route. |
| Project update | Captain routes canonical work to a bounded Agent slice and records proof. |
| Daily Captain pass | A scheduled pass selects eligible capacity and reports every lane's disposition. |
| Module integration | Ward checks a Hall-housed socket contract and returns fit/health evidence without a reach-around. |

## Controls And Verification

- **Blueprint Atlas:** select a room to inspect its owner, inputs/outputs,
  boundary, proof role, and linked scenarios. Left/Right Arrow moves between
  rooms after focusing one.
- **Run Player:** select a scenario from the journey rail, then use Run/Pause,
  Back, Step, or Reset. The active step lights one governance floor and one
  Job Order token; reduced motion keeps the full route available as manual
  steps.
- **Local quality gate:** run `node reference/verify-schematic.mjs`
  from the Foundry product root. It validates structural coverage, all seven
  routes, authority-safe local data, no-network content, and this reference
  guide.

## Sub-Minute Demo

1. Open `foundry-schematic.html` in a modern browser.
2. In the default **Run Player**, inspect the six governance floors, journey
   rail, Job Order inspector, and safety boundary.
3. Select **Module integration**, then press **Run** or **Step** until the Pawn
   reaches the simulated Projection-capture step.
4. Press **Reset**, enable **reduced motion**, and press **Play** once to see a
   single manual step. The view never reads or alters Foundry state.

The complete local quality command uses the installed Google Chrome headless
binary and a temporary `127.0.0.1` server. It needs no dependency install,
network connection, account, credential, or production service.

## Historical Drawing Index

| Drawing | What it shows |
|---|---|
| [Original concept plate](foundry-schematic-FND-01.html) | The original 2026-07-20 drafting plate: two host buildings, conversational doors, three wired helpers, a Git cord, and the L0-L3 light dimmer. It is preserved as design history rather than rewritten to match the later architecture. |
| [Original concept PDF](foundry-schematic-FND-01.pdf) | The existing print/share rendering of the original concept plate. |
| [Architecture plate](foundry-schematic-FND-02.html) | The 2026-08-02 historical plate: one portable product, the then-current four native Halls, socket contracts, optional installed Modules, generic Projects/Wiki, reusable Roles/Captain/tools, private instance boundaries, and the Forge-to-Assay publication line. It is superseded by the thirteen-Hall Canon in S-001. |
| [Architecture PDF](foundry-schematic-FND-02.pdf) | The print/share rendering of the architecture plate. |

The architecture plate deliberately uses generic Module and instance labels
because the Foundry product is public; populated project/memory data,
credentials, local paths, and private task state do not belong in the drawing.

## Rendering

HTML is canonical. Regenerate a PDF after changing its matching HTML:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=foundry-schematic-FND-02.pdf \
  foundry-schematic-FND-02.html
```

The original PDF is intentionally retained with its matching historical plate.
