# Foundry design concepts retained from the developing instance

These are historical accepted designs, not evidence of implemented behavior.
The source is preserved with portable terminology; the template remains broken
and undeployed. ADRs narrow older statements where their dates conflict.

## Foundry Concept Refinements (2026-07-18)

Accepted in the 2026-07-18 concept-alignment brainstorm (`/make-it-so`); the
buildable parts are owned by **S-008**. These sharpen — not replace — the
accepted direction above.

- **The Foundry is a governance system, not a brain.** It connects a Workbench's
  sockets to modules and monitors/maintains the rooms. Recall is *constitutive*
  ("without it, just a Workbench with a dashboard") but no *specific* module is
  required — module identity is agnostic; a *filled* socket is what makes it a
  Foundry. The requirement lives on the socket; the module is swappable.
- **Every Workbench has a Wiki document store.** The **Forge ships a template
  Wiki**, and every room gets its durable `MEMORY.md` router and flat notes.
  Project detail stays in the room's own `BLUEPRINT`/`README`/specs; the root
  Wiki keeps project notes as navigational pointers. The Wiki is the Workbench's
  documentary and navigational source for the Foundry's contents, relationships,
  history, rationale, and Grounding. It is not part of Canon and is not a
  Governance Plane; individual notes are classified by role when needed.
- **Workbench vs. Hall.** A **Workbench** is one room's operating
  surface; the **Halls** scale that machinery across rooms and
  expose contracts that Modules fill. "A Foundry contains Workbenches" (root +
  one per room).
- **The Foundry owns the sockets; no reach-arounds.** Socket contract + registry
  are core; the binding (which module, its config) is instance; the module
  implements. An agent or room reaches a module *only* through its socket.
- **Traverse, don't search.** The whole deployment is one link-navigable graph;
  the **WORKSPACE root is one Obsidian vault** (moved up from `Wiki/`-only). Agents
  reach information by following wikilinks, never by broad search; specs/tickets
  link to the Wiki and back. Because the vault is now the whole repo, Captain and
  agents navigate by links and must not load the tree broadly.
- **Everything gets a FUID.** The earlier typed namespace remains as
  compatibility aliases, while one permanent, never-reused uppercase base36
  FUID becomes primary. Four-character FUIDs cover Halls, Modules, Sockets, and
  Projects/Workshops; six-character FUIDs cover Specs, Tickets, Intent requests,
  Job Orders, and passage receipts. All-zero is reserved; allocation advances
  one canonical high-water mark per width in `0-9A-Z` order and skips every
  active, retired, or grandfathered opaque identity. Type and parentage remain
  registry metadata. Git Canon allocates; freshness-verified Recall may resolve
  but never allocate. Existing paths and typed IDs are not bulk-renamed. S-036
  supersedes only S-008's forward identity representation.
- **The Ward is a Hall** (a room health/integration checker, like the Assay);
  its deployment-specific config is instance data. **Workbench Factory → the
  Forge** ("the Forge builds the Workbench"); **`HARNESS_FEEDBACK.md` → Workbench
  Feedback**. Those two renames were carried by S-008, now complete; the
  2026-07-25 Hall renames are carried by the promotion recorded below.


## Current Hall Roster

The currently declared Hall roster has thirteen Halls: Intake, Validation,
Gatehouse, Orchestration, Design, Knowledge, Scheduling, Forge, Production,
Assay, Ward, Gauge, and provisional Shipping. Thirteen is the current Canon
roster, not a permanent product invariant. An explicit Canon amendment may add,
retire, merge, or split Halls; the identity registry and migration evidence must
then move with that amended roster.

Foundry Schematic is the separately owned, deterministic, non-executing
Projection product that serves as the interactive visual blueprint of Canon and
the intended end-state design. It is not the Foundry native product interface,
not a Command Information Center, and not a representation of current
Actuality. Its workflow runs are explanatory simulations only. Under S-035,
the separately produced Schematic is included in the clean Foundry Shipping
artifact only after its named Proof and independent Assay gates; that inclusion
does not make it a CIC, a live inventory, or a source of Actuality.


## Historical: The Original Four Halls (2026-07-25)

This is a preserved historical record, **not current Canon**. S-001 established
the current thirteen-Hall architecture; the old four-Hall terminology below
explains why legacy paths and references exist but must not direct new work.

The Foundry had an **organizational tier**, decided by the owner in the reserved
S-024 TK-002 grilling and promoted here. It supersedes the capitalized-plural
**Foundry Sockets** family term, which named the tier after its contents and
left one word carrying two meanings. `LEXICON.md` owns the vocabulary; this
section owns the architecture.

- **The tier is a Hall, and there are exactly four.** **The Forge** builds the
  Workbench. **The Assay** (was Audit Engine) judges quality. **The Ward** (was
  PIP) checks fit. **The Gatehouse** (was Orchestration Engine) owns the
  containment boundary. The register is metal casting, matching the Foundry
  itself; a casting hall and a melting hall are genuine foundry rooms, and the
  owner's own framing was *"very large factory floor house rooms."*
- **A Hall is a complete vertical boundary** — its own Pawns, its own skills,
  its own lifecycle. This is why the tier matters across the roster: it is
  where ownership sits, where encapsulation sits, and where **context scoping**
  sits.
  An agent entering a Hall loads that Hall's skills and no others, so it is
  *unloaded as it travels* rather than carrying every tool in the Foundry.
- **Tickets are the sole interface between Halls.** A Hall knows *what it
  needs*, never *how another Hall does it*, and never loads another Hall's
  skills. The Forge finishing a harness files a ticket asking the Assay to
  verify it; neither Hall ever needs to know anything about the Ward. **Zero
  cross-Hall knowledge** is the load-bearing property — Halls are encapsulation
  boundaries, and structure is not declared, it is **requested as routed work**.
- **Gatehouse authorizes nothing.** It owns walls, floors, doors, security
  gates, mandatory scans, clearance infrastructure, and append-only passage
  receipts. It does not route, validate, assign work, authorize work, or make
  policy decisions. Halls request passage infrastructure through ordinary
  routed work; the Gatehouse supplies the deterministic infrastructure and
  traceability.
- **The Job Order carries the operation checklist and authority references.**
  It coordinates work across chats; current Canon, Clearance, and owner scope
  authorize the work. The order is scanned at protected passages; scanning it is
  what *produces* the audit trail. Both the Gatehouse and the Assay read that
  trail — the Gatehouse for deterministic verification ("did the diff stay
  inside the clearance band, did the agent do what it declared"), the Assay for
  model-driven evaluation ("is this work good"). Same word *audit*, two
  activities, now cleanly separated by the rename.
- **Each Hall builds its own Pawns.** The Gatehouse owns its passage machinery
  and *own* Pawn workforce, not the Foundry's entire workforce — the Assay,
  Forge, Ward, and every other Hall retain their own bounded responsibilities.
- **Three layers live inside the Gatehouse:** the **domain core** (pure,
  zero-dependency, hosts the zero-token CLI) ▸ the **engine** (domain-blind
  sandbox/worktree/branch mechanics) ▸ the **orchestrator** (compiles Clearance
  and Job Orders into engine policy). **Standing rule: the orchestrator imports
  core and engine; the core never imports the engine.** The L0 no-model path and
  the cleaned Workbench export both depend on the core being importable without
  the sandbox mechanics. Naming the Hall *the Gatehouse* is what freed the word
  "engine" for layer 2 and keeps this rule readable exactly as written.
- **A socket is not a Hall.** Sockets are capability connection contracts
  *housed inside* Halls — the Halls are "the places the sockets are created and
  housed." Any text calling the Forge, the Assay, or the Ward a "native socket"
  is using retired vocabulary.


## Accepted Foundry Governance Planes Direction

Governance Planes classify the roles artifacts play in one operation. The
changed target is **Actuality**, the authorizing rule **Canon**, the evidence
**Grounding**, the durable reference **Enduring Context**, the request **Intent**,
and the report **Projection**; no file has a permanent plane. Complete binding
definitions live together in [the Lexicon governance section](LEXICON.md#governance),
with ADRs recording rationale and supersession history.

- **Authority Order and selective passage.** Actuality is most protected,
  followed by Canon, Grounding, Enduring Context, Intent, and Projection; this
  expresses earned access, not truth precedence. Work follows applicable ordered
  edges inward through Projection → Intent → Enduring Context → Grounding →
  Canon → Actuality and outward through Actuality → Grounding → Canon →
  Enduring Context → Intent → Projection. Explicitly skipping an inapplicable
  plane requires no new artifact, approval, or gate; provenance and any evidence
  required by the destination still apply.
- **Binding requirements stay current.** Canon carries every binding
  current-state rule needed to execute and verify work. ADRs and SPECs supply
  Grounding about the intended truth; the promoted grilling notepad rests as
  Enduring Context. A Taskboard reports as Projection and cannot create a gate
  or blocker. Blueprint summarizes architecture rather than making a reader
  reconstruct it from decision history.
- **Adjudication has a warrant.** Correcting a stale source, resolving a
  contradiction, or stating a rule already implied by settled sources is
  permitted; inventing an unsupported requirement is not. Record what the
  ruling supersedes, and keep unsettled questions explicit.
- **Operations carry conditions.** All six planes support full CRUD.
  Append-only journals, superseding ADRs, retained Lexicon terms, and generated
  views are artifact conventions, not restrictions on an entire plane; they
  do not override an owner-authorized operation on the artifact.
- **One structured policy source.** Extend Gatehouse's existing
  `Foundry/Halls/Gatehouse/contracts/clearance-policy.json` with operation-based
  roles and conditions; any matrix is rendered from the data. Do not assign
  planes to paths, build a per-file plane registry, or create a second policy
  store. This records the decision only: the implementation slice is deferred.
- **Encoding does not confer enforcement.** Prose is an encoding independent
  of plane. Structured data is necessary for machine enforcement but only
  running code that reads the policy, evaluates the rule, and controls the
  attempted operation enforces it. No new enforcement is claimed here.
- **Verbs are operations.** Promote, ground, settle, project, and related verbs
  describe work by its target and required evidence. Promote moves an artifact
  to its place in the Workbench Contract and does not inherently increase its
  authority; promotion is explicit, per-item, and preserves provenance.
  Unpromoted decisions cannot authorize work.
- **Generated Projection captures are Pawn-written and freshness-visible.**
  A plane's state is knowable only by investigating it, so a projection records
  what the state *was* at the moment it was last captured — an approximation,
  because something may have changed since or nobody captured it on the way out.
  That makes the write a **deterministic capture at a boundary** (the put-down),
  never a model-authored summary: the Projection write band belongs to **Pawns**
  only for these generated artifacts. This is their capture convention, not a
  permanent plane assignment for every report. Two invariants keep it honest:
  a projection read may **route** but never grant scope or open a work lane (the
  Canon issuance grants scope; Preflight validates; Steward-accepted
  Launch-flight opens the lane), and staleness **fails closed** — an
  uncaptured lane reports when it was last captured rather than vanishing.
  Consequences: a **Sitrep** is a read of Projection spoken into the
  conversation, and the **Steward's Summary** is a Pawn capture at activation
  boundaries, which is how the Servitor stays asleep-but-continuous. The
  Foundry-wide value is not the human-facing report but the shared **cold-start
  substrate** every activation reads first, instead of each agent re-deriving
  root, branch, upstream, dirty state, doctor, and `next` live. (Deterministic-
  gates items 14, 23; which boundaries fire a capture remains open.)
- **CIC work is projected; movement is Intent.** Canonical Project/Workshop,
  Spec, and Ticket records deterministically rebuild a provenance-bearing SQLite
  Work-item Projection. CIC may group and query that read model, but it cannot
  mutate projected canonical status. A requested board movement creates a
  separately stored, validated Intent request and a pending overlay. Only later
  authorized execution under current Canon, Clearance, and owner scope can
  make the requested change, with a Job Order when work exceeds one chat; a
  refresh then captures the result. Personal CIC tasks remain a separate store.
- **Work-item dates are lifecycle metadata.** Every Spec and Ticket records
  immutable `Created` and substantive `Last worked` dates. Claim, close,
  completion, and explicit content mutation advance Last worked; deterministic
  rendering, projection capture, lookup, and polling do not. `Updated` remains a
  compatibility field while consumers migrate. (S-036.)
- **Job Orders carry coordination across chats.** A Job Order is the form an
  Intent spanning chats takes when one is in force, never a precondition for
  that work existing; without one, the handoff and its session notepad carry
  continuity, and human-led chat work under direct owner instruction is the
  ordinary operating path ([ADR-0021](workbench/docs/adr/0021-job-orders-are-a-form-not-a-precondition.md)).
  Direct owner instruction assigns roles. The order is an operation checklist
  linking the Workbench Contract, Clearance band, goal, and required evidence,
  so an assignee can reach everything needed without duplicated authority text.
  Its effective authority is the intersection of current Canon, issuer
  Clearance, assignee/tool permissions, and explicit owner scope. It cannot
  create or waive Canon, import Intent as a requirement, or require an
  unavailable future mechanism. Packet rewriting follows this definition pass.
- **The Wiki is not a Governance Plane.** Governance Planes are abstract
  classifications of operating reality, not physical folders or storage
  locations. The Wiki is the Workbench's durable, navlinked document store and
  knowledge base: the documentary and navigational source for understanding the
  Foundry's contents, relationships, history, rationale, and Grounding. It owns
  no plane, Actuality, or Canon. Canon may reference Wiki documents, and Wiki
  documents may explain or support Canon, but Wiki content cannot by itself
  authorize an Actuality change. Individual notes are classified by role when
  needed, most commonly as Enduring Context or Grounding. (the owner correction,
  2026-08-12.)
- **Servitor vs. Engine.** A **Servitor** is the per-host emergent whole (one per
  host, including a spun-up cloud instance); the **Engine** is the replaceable
  model powering it. This supersedes the earlier fused host+model "Servitor seat"
  identity: the seat label's host digit is the durable Servitor and the letter is
  the floating Engine.
- **Minimum operational ledger: the Grounding Journal.** An append-only record of
  Intent disposition; Job Order creation/claim/handoff/block/completion;
  Pawn/Agent run start/activation/outcome; Grounding receipts and verification
  verdicts; and Mirror source/freshness metadata. It duplicates no Intent or
  Canon content; the live view (Mirror) renders it, while ADRs serve as
  Grounding decision records. S-037/TK-008 assigns its schema, digest chain, replay,
  retention, and recovery custody to Knowledge through the
  `grounding-journal` socket. In lifecycle schema v2 the Journal event and
  lifecycle state share one private authoritative commit/tree; no live Journal
  implementation is claimed until TK-012 passes.
- **Three shipping gate types.** **Proof** (repeatable mechanical evidence),
  **Audit** (an independent Auditor verdict on Grounding), and **Owner Command**
  (the owner's explicit Intent-plane authorization for a protected transition).
  Owner Commands cannot be created by an Agent or Pawn; Proof and Audit outcomes
  live in Grounding. A requirement is not a gate — the gate verifies whether its
  condition is met.
- **Durable packets (provisional).** Before implementation, Agents and Pawns
  communicate only through fixed records: **Intent**, **Job Order**, **Claim**,
  **Handoff / Blocker**, **Grounding Receipt**, and **Audit Verdict**. The live
  view derives status from these; it is not another packet type. This set is
  intentionally provisional for the first implementation boundary.
- **Open (not promoted): role→plane authority + Canon-amendment gate (item 6).**
  Only the Auditor slice is settled — it reads Actuality/Canon/Enduring Context,
  writes Grounding findings/receipts/verdicts, and may propose but not dispatch
  rework. The general plane-scoped authority map for every role, and the gate by
  which Canon itself is amended, remain under grilling. Item 35 explicitly
  permits this correction under owner authorization while that gate remains
  open; settling it first is not a prerequisite.
- **Open and deferred.** Cross-plane policy treatment (C), domain verbs under
  CRUD (D), missing-entry behavior (E), and reusable operation catalog versus
  per-order definitions remain unresolved. The save skill's file-type
  classification and the Job Order validator's required Plane stamp are named
  follow-ons; do not remove packet fields without their schema change. The
  reported observer/auditor read-policy discrepancy also remains a runtime
  follow-on. Definition repairs do not fix state-writing failures such as the
  reported JO-00009Y claim mismatch, nor prove a completed flight.

**Superseded wording, preserved as history:** The 2026-07-24 statement that
every piece of operating reality "sits in exactly one plane" is superseded by
notepad items 33/49. Fixed ADR-as-Enduring-Context wording is superseded by R3;
the blanket Job Order authorization requirement is superseded by item 50.
The operative rules above were promoted from the 2026-09-01–03 notepad under
the owner's direct authorization on 2026-09-03.


## Accepted Foundry Flight Workflow Direction

Promoted on 2026-08-19 from the audited Sitrep-to-End-of-Flight review and
the owner's explicit `/make-it-so`. S-037 owns implementation and proof; this
section owns the cross-cutting architecture. The complete flight is:

`/sitrep` → `/preflight` → `/launch-flight` → `/in-flight` → `/landing-check` → `/land` → `/postflight-check`

- **A Job Order carries the flight's assigned roles and authority references.**
  The current packet records its FUID/revision, result, responsible party,
  scope, proof, recovery, and destination. Authorization comes from Canon,
  Clearance, and explicit owner scope, not the Spec or packet's location;
  the packet's operation checklist and reference-only rewrite remain follow-ons.
- **The [Job Order Workflow Runbook](RUNBOOK.md#job-order-workflow-runbook) is the binding procedure.** Every Job Order creation, execution, and completion uses it. It owns the exact stage procedure and current fail-closed boundaries; this architecture does not imply that unavailable lifecycle automation exists.
- **The Job Order is the cross-chat workspace.** Beneath its owning Spec it
  contains `JOB_ORDER.md`, `CONTEXT.md`, `CLAIM.md`, and uniquely ordered
  append-only `handoffs/`. Context is a bounded message board, never a second
  task tracker, proof archive, transcript, secret store, or authority source.
- **Every stage is separately invokable and freshness-bound.** Each stage
  consumes the accepted prior handoff, revalidates race-sensitive facts, and
  appends its own receipt. The Preflight receipt is its outgoing handoff.
  Handoffs preserve context and evidence bindings but grant nothing.
- **Launch-flight is the takeoff transition.** Preflight tests the exact order,
  repositories, live state, recovery, and attainable landing/closure path.
  Historical schema v1 is Steward-serialized. Schema v2 requires a
  Steward-authenticated request and one Orchestration-owned lifecycle commit on
  the private `instance-flights` ref. Until TK-012 implements and proves that
  path, current execution remains Steward-serialized and fails closed.
- **Authority stays bounded in flight.** In-flight implements only the accepted
  lane and cannot self-claim, self-accept, widen scope, or merge. S-037/TK-004
  defines the fail-closed Clearance contract: the Gatehouse compiler intersects
  actor class, exact Job Order scope, and named owner gates at every protected
  transition and emits a redacted denial receipt. A bounded Owner Command is
  the only override route; the class itself never grants work. TK-012 must ship
  this compiler before any actor claims machine enforcement exists.
- **Landing-check is independent and immutable-revision bound.** It judges the
  exact remotely recoverable candidate SHA. Any candidate change invalidates
  the verdict and returns through Landing-check.
- **Landing is delivery, not closure.** Land consumes the accepted verdict,
  revalidates the target, tests the exact integration candidate, and advances
  only the authorized remote `integration` with an explicit non-force
  mechanism. A changed merge candidate reruns Landing-check. No agent infers
  `integration` to `main`.
- **PostFlight-check is the outward terminal integrity gate after every Land
  outcome.** Starting from verified post-Land Actuality, it proves that Canon,
  Grounding, Enduring Context, Intent, Projection, recovery, claims,
  activation, and handoffs represent the exact landed state. When Integration
  lacks its required PR or merge, it hands that bounded repair to a fresh chat,
  waits, and rechecks fresh refs before proceeding. A terminal order
  freezes as Enduring Context; a safely blocked unfinished order remains active
  Intent without a live claim. Outcomes distinguish closed-complete,
  closed-blocked, closed-aborted, delivered-unclosed, and recovery-required.
- **Plane ownership stays exact.** Orchestration owns lifecycle transition and
  `lifecycle-projector`; Knowledge owns Journal custody and
  `journal-health-projector`; Gatehouse owns passage receipts and
  `passage-projector`. **Gatehouse authorizes nothing.** Gauge owns the redacted
  `activity-feed-projector` supplied through the interface socket; CIC renders
  the private Mirror without capture authority; the separately owned Schematic
  pipeline owns its public-safe `schematic-projector`. Capture is post-commit
  and idempotent; failure may block closure but never rolls back authority.
- **Implementation remains honest.** `/sitrep`, `/preflight`, `/handoff`, and
  `/land` exist only as partial scaffolding; `/landing-check` is a fixture-only
  bootstrap and `/postflight-check` is now a small outward-reconciliation
  bootstrap. `/launch-flight` and `/in-flight` are not yet enforced shared
  skills, and no current skill supplies deterministic close mutation.
  The S-037/TK-004 Clearance contract is accepted but awaits TK-012's
  implementation. TK-005 through TK-011 now define the private unified
  lifecycle/Journal tree, cooperative exact-tip CAS, fact-bound Preflight,
  Orchestration close authority, one-repair routing, coordination-only parent,
  and Projection/privacy boundaries. They remain unimplemented until TK-012
  and downstream tickets pass; public repositories receive only schemas,
  validators, mechanism documentation, and synthetic redacted fixtures.


## Accepted Foundry Facility And Surface Direction

Promoted 2026-07-24 from the `[locked]` and `[soft-locked]` decisions in the
`foundry-rework-2026-07-23.md` notepad (disposition noted in the previous
section). Open and tentative items from that session stay in grilling and are
**not** represented here.

**The facility hierarchy.**

- **Foundry → Factory → Workshop → Workbench.** The Foundry is the portable
  product; a **Factory** is a host-scoped deployment of it; a **Workshop** is one
  project inside a Factory; the **Workbench** is that project's harness. A
  Factory connects outward through sockets and modules. (Items 1B, 4.)
- **One Servitor, one Steward, per Factory.** The persistent living operating
  identity that emerges when an engine activates a Factory is its Servitor; its
  model-neutral, human-facing, activation-continuous identity is the **Facility
  Steward**. The model is a replaceable **Engine** chosen by routing policy, not
  a second Servitor. Provider-specific behavior belongs in a provider profile or
  adapter, never in competing Servitor state. (Items 1, 1A.)
- **Roles are stances, not beings.** Captain, Engineer, Auditor, and Planner are
  temporary role skills adopted for one task under the one persistent Steward.
  (Item 17. Whether Captain and Chain Engineer retire outright is an *open*
  grilling question and is deliberately not settled here.)
- **Four distinct things.** A **role skill** is bounded guidance for how to act;
  a **Job** is the durable assigned outcome, scope, and acceptance criteria; an
  **Agent** is a disposable model worker assigned to a Job; a **Run** is one
  attempt by that Agent. Durable continuity lives in the Factory's canonical
  stores and records, never in an Agent's chat or session context. (Item 3.)
- **Pawns automate, Agents deliberate.** A **Pawn** is a deterministic non-model
  actor executing bounded triggers or Job Orders. Neither Pawn nor Agent holds
  ambient authority over Actuality. (Item 27.)

**The Entrance.**

- **An Entrance is the channel-neutral human surface** through which the owner
  communicates Intent into a Factory and wakes it. It formally replaces the
  earlier term *Door*. A provider desktop app is a direct engine Entrance; CIC
  is the preferred typed or voiced Entrance. The Factory visibly shows which
  engine or side it wakes. A microphone is a voice control inside an Entrance,
  not the concept. (Items 2, 29.)
- **CIC exposes explicit selectors** for target entrance/engine and effort, while
  **Auto** delegates routing to the Facility Steward. The selected or resolved
  route is visible both before and after send. (Item 2A.)
- **Every CIC task has a Factory home.** Its default target is the Factory where
  it originated or last ran; changing model, engine, or effort preserves that
  home. A task moves only by explicit redirect, and Auto resolves to the existing
  home before considering any other placement. (Item 2B.)
- **Native voice and dictation are out of scope.** CIC never transcribes and
  never auto-sends. (Item 10.)

**The Job Order flight lifecycle.** Compose at an Entrance → **Send** → triage
into Intent → issue the Canon-backed Job Order → Sitrep → Preflight →
Launch-flight → In-flight → Landing-check → Land → PostFlight-check. This
circuit governs flight-mode Job Orders; work fitting one chat follows the direct
owner instruction rule above. Put down Grounding and do not call delivery closure. S-037 owns the executable decomposition; the
older six-step summary is superseded. (Items 9, 18.)

**Liveness and activation surfaces.**

- **Three independent Mirror dimensions** — liveness, activation level, and
  operational state — none inferred from another. (Items 11, 34.)
- **A monitored heartbeat.** Pulse present means alive; pulse absent means
  **down**, a first-class alarm distinct from L0 asleep, which brightness alone
  cannot disambiguate. Watchdog sensitivity scales with activation, so a single
  missed beat at L2/L3 is an immediate alarm. (Item 34.)
- **Announced Activation (No Silent Wake).** Every activation transition is
  announced to the Mirror socket before or as it happens, and an activation
  observed but never announced is itself an anomaly. These are Grounding Journal
  events; the failsafe rides the existing ledger. (Item 35.)
- **Lighting is drillable.** A Factory displays the highest active level anywhere
  beneath it, and that aggregate must be explorable down to the responsible
  Workshop and the exact Job Order, Pawn, or Agent, each keeping its own level.
  Every Workshop and agent-workable scope shows its own light — Off when nothing
  is active, otherwise its highest active descendant. The Mirror drill-down
  hierarchy is sufficient; no separate lighting-only surface is needed.
  (Items 30A, 30B.)
- **Lighthouse is the unifying image** (locked 2026-08-30): sweep is the live pulse,
  brightness is the static level, dark-and-still is down. The pulse complements
  and never replaces brightness, so the encoding survives reduced motion,
  screenshots, and print. The facility-lighting names sit under it as room-level
  labels. (Item 37.)
- **Heartbeat is a declared Gauge socket, not an alias or animation.** Portable
  FUID `000M` is reserved for Heartbeat Socket with no K alias; existing `6A9G`
  remains Activity Signal and K-002 remains messaging. The blocked Foundry
  S-003 registry slice owns materializing `000M`; Steps 1-3 do not mutate that
  registry. Each two-way exchange carries one atomic L0-L3 load, active-worker,
  average/peak reasoning, cadence, sequence, emitted-time, source, and freshness
  snapshot; CIC acknowledges the exact sequence and returns observer health and
  freshness. Exact cadence is L0=60s, L1=15s, L2=5s, L3=1s. One missed expected
  beat immediately makes Lighthouse dark/still while preserving last-received
  time. PID or HTTP health is not lifecycle Actuality.
- **Flight Rack is downstream of Lighthouse acceptance.** Foundry S-004 joins
  lifecycle, Journal-health, and passage projections into a redacted observation
  feed. CIC S-030 renders all seven stages and blocked, repair, recovery,
  delivered-unclosed, and terminal state without write authority. Root S-038
  owns the coordination-only parent, repository-separated child Job Orders,
  private bindings/install/auth evidence, exact source-install-runtime proof,
  rollback, and final PostFlight reconciliation. Public repositories contain
  mechanisms and synthetic fixtures only.

**CIC splits Blueprint from Mirror.**

- **Blueprint** is the stable map of how the Foundry is built; **Mirror** is the
  live view of what is happening now. One top-level **The Foundry** tab carries
  both, with a Factory selector. (Items 7, 8.)
- Blueprint's at-a-glance story is a prompt flow annotated with its plane
  transitions, and every Blueprint element exposes plane, owner, freshness, and
  whether it is a Projection or a Mirror on hover. (Items 7A, 7B.)
- **First implementation is a minimum approved design package plus one
  read-only, fixture-backed slice** — no live mutation in the first cut.
  (Item 16.)

**Verification scales with risk** (item 19). Low-risk reversible work closes on
repeatable mechanical proof. Ordinary implementation adds an independent audit.
Contract, release, credential, privacy, and destructive changes additionally
require the owner's own verdict.


## Core Logic And Invariants

- Verify live paths, branch/runtime state, and freshness before acting.
- The nearest project-local instructions control project work after root safety
  and routing rules are honored.
- Keep one active harness dialect per project.
- Keep the tracked WORKSPACE control-plane structure and shared files aligned
  through the same private repository. Put host-specific paths and runtime facts
  in host-qualified fields or Machine Wiki notes that can exist in both clones;
  do not fork shared controls merely because the operating systems differ.
- Treat direct cross-host communication as transport. Durable team handoffs
  still identify the owning repository, branch or commit, spec evidence,
  freshness, and any dirty or unpushed work.
- Documentation is part of done and is updated by the agent making the change.
- Every durable change leaves proof in the owning stable spec.
- Root-level files serve the whole workspace; project-specific truth stays in
  the project.
- Sensitive content stays local and is not copied into public docs or responses.
- Derived systems degrade visibly rather than presenting old or fabricated data
  as current.
- WORKSPACE is a disposable sandbox whose recoverable source belongs in project
  GitHub repositories; canonical project folders are protected, while verified
  duplicate checkouts and stale worktrees may be merged or removed.

