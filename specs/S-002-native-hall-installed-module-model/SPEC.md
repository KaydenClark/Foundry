# S-002 - Native-Hall / Installed-Module Composition Model

**Spec ID:** S-002
**Status:** active
**Priority:** 1
**Owner:** claude
**Updated:** 2026-07-28
**Catalog description:** Record the native-Hall / installed-Module composition model as a durable capability of this repository — what each tier means, why the fold happened, the manifest schema shape that already implements it, and acceptance criteria for landing the pending branch and for the Gatehouse's first real slice.
**Blockers:** none
**Latest event:** Authored this spec on `claude/foundry-canon-refresh`, closing the WORKBENCH_FEEDBACK.md gap that flagged S-001's supersession note as the only record of the native-Hall shape. `pip/LEXICON.md` was authored in the same pass (TK-001 proof).
**Next gate:** TK-002 — land `claude/foundry-canon-refresh` on this repository's own `integration` (tracks GPT_OS `S-024-native-socket-foundry`/TK-005, scoped to this repository).

## Outcome

Anyone reading this repository's `specs/` — without also having GPT_OS's root
spec catalog open — can answer three questions: what a native Hall is versus
an installed Module, why three of the four Halls stopped being separate
remotes, and what "done" looks like for the two pieces of work still ahead of
this model (landing the branch that implements it, and the Gatehouse's first
real capability). Before this spec, that knowledge existed only as a
supersession paragraph bolted onto S-001 plus scattered `BLUEPRINT.md` prose —
adequate for `BLUEPRINT.md`'s job of stating current architecture, but not a
durable, acceptance-bearing capability record of its own.

## Why It Matters

S-001 proved and shipped an "every component is cloned by the manifest, none
vendored" harness. That contract described seven components: the Forge, the
Assay (née Audit Engine), the Ward (née Personal Intelligence Platform),
OpenBrain, Command Information Center, Slack, and Discord. GPT_OS root
`specs/S-024-native-socket-foundry/SPEC.md` is the decision that changed this:
on Kayden's explicit direction, the three fundamental components — without
which a Foundry cannot be a Foundry at all — folded into `KaydenClark/Foundry`
as tracked source instead of remote installs, and a fourth (`gatehouse/`) was
scaffolded native from the start. This spec does not re-litigate or duplicate
S-024's reasoning; it is the record, owned by this repository, of what that
decision means here: the manifest schema it requires, the acceptance bar for
landing the branch that implements it, and the acceptance bar for the one Hall
that still has no working capability behind its scaffold.

Without this spec, "how does Foundry composition actually work today" lived
only in `BLUEPRINT.md` prose (which is architecture description, not a
requirements/acceptance/evidence record) and a Supersession addendum on S-001
(whose own evidence log still proves the pre-fold, seven-component contract
and is deliberately not rewritten). `WORKBENCH_FEEDBACK.md` (2026-07-28,
`specs/S-001-portable-foundry-harness/SPEC.md` supersession row) recorded this
exact gap and proposed opening a spec "mirroring GPT_OS
`S-024-native-socket-foundry`." This is that spec.

## Decisions And Contracts

- **Native Hall.** Tracked source living directly inside this repository —
  `forge/`, `audit-engine/`, `pip/`, `gatehouse/` — that arrives with an
  ordinary `git clone` of the Foundry itself. No remote, ref, or install
  destination of its own; it is reached and edited as this repository's own
  source, following that Hall's nearest `AGENTS.md` once inside it. A Foundry
  is definitionally incomplete without its native Halls present.
- **Installed Module.** A genuinely optional, separately owned, independently
  releasable capability — OpenBrain, Command Information Center, Servitor
  Slack, Servitor Discord — that keeps its own repository and release history
  and is cloned by the adoption manifest to an ignored destination beneath the
  harness root. No-vendoring applies to Modules only; it never applied to
  native Halls because they were never a separate install to begin with.
- The full compact comparison (examples, necessity, location, arrival
  mechanism, no-vendoring applicability, ownership, manifest fields) is
  maintained once, in root `BLUEPRINT.md` under "Native Halls versus installed
  Modules." This spec does not duplicate that table; it is the capability
  record that the table's shape is required to satisfy, and the table is the
  living detail.
- **Why the fold happened.** GPT_OS root `specs/S-024-native-socket-foundry/SPEC.md`
  is the originating decision (owner: Kayden, "FULL SEND ... put them all under
  the foundry as sockets", corrected mid-flight to Hall vocabulary — see that
  spec's Vocabulary Repair section). This spec references that decision and
  does not restate its grilling, blockers, or evidence log; GPT_OS root remains
  the durable owner of *why* Kayden decided this. This repository owns *what it
  means here*: the manifest schema, the doctor gates, and the two pieces of
  follow-up work below.
- **Manifest schema shape.** `manifest/foundry.json` components declare
  `tier: "native-hall"` or `tier: "installed-module"`, validated by
  `validateManifest()` in `tools/foundry.mjs`:
  - `native-hall` requires `family: "Halls"` and a safe relative `path` (not
    under `Modules/`); it must **not** declare `remote`, `ref`, or
    `destination`. An optional `foldedFrom` records the historical former
    remote for the three folded Halls (`forge`, `audit-engine`, `pip`); the
    Gatehouse has none, having never been a separate repository.
  - `installed-module` requires `family: "Modules"` and `remote`/`ref`/
    `destination` (destination must live under `Modules/`); it must **not**
    declare `path` or `foldedFrom`.
  - Every component also carries `status`: `active` (working today), `paused`
    (was active, temporarily off — Discord), or `planned` (exists but has
    never had an implementation — the Gatehouse). `planned` and `paused` are
    deliberately distinct states, not degrees of the same thing.
  - `componentLocation()` resolves a component's on-disk path from `path` for
    native Halls or `destination` for installed Modules — the two tiers are
    never read from the same field.
  - Foundry doctor's `nativeHallErrors()` proves every native Hall is present
    on disk and carries `NATIVE_HALL_CONTROL_DOCS`
    (`AGENTS.md`, `BLUEPRINT.md`, `RUNBOOK.md`, `TASKBOARD.md`, `CLAUDE.md`,
    `README.md`). `LEXICON.md` is deliberately excluded from that required set
    because `pip/` predated the gate without one — a pre-existing, honestly
    recorded gap the gate does not fail on. This spec's companion change
    (`pip/LEXICON.md`) closes that specific gap without changing the doctor
    gate's required-docs list, since the gate's job is "what every existing
    Hall actually has," not "what every Hall should aspire to have."
- Root `LEXICON.md` already carries the Hall-tier vocabulary
  (`Hall`, `native Hall`, `installed Module`, `install manifest`, `instance
  binding`, `no reach-around`) pointing to GPT_OS root `LEXICON.md` for the
  full definitions; this spec does not redefine those terms either.

## Non-Goals

- Restating or re-deciding GPT_OS `S-024-native-socket-foundry`'s grilling,
  blockers, or rationale. That spec's evidence log is the historical record;
  this spec only references its outcome.
- Rewriting or superseding S-001's own evidence log. S-001's TK-001/TK-002
  proof stands as performed for the seven-component shape that existed at the
  time; this spec formally succeeds its *forward-looking* install-all contract
  for the three folded Halls only, exactly as S-001's own Supersession section
  already states.
- Building any Gatehouse implementation. Root `BLUEPRINT.md`'s Non-Goals and
  `gatehouse/BLUEPRINT.md`'s own Non-Goals already say this is out of scope
  for the current pass; this spec's Gatehouse acceptance criteria describe the
  bar for *later* work, not authorize starting it now.
- Reconciling "Servitor" terminology (GPT_OS `S-024`/TK-006) or recording the
  physical-gap evidence pass (GPT_OS `S-024`/TK-007) — both are GPT_OS-owned
  tickets on the originating spec, not this repository's concern.
- Changing `tools/foundry.mjs`'s validation, doctor gates, or the manifest
  itself. That implementation already exists on this branch (TK-001 below is
  documentation-only against already-shipped code); this spec records the
  contract, it does not re-implement it.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Author this spec: capture the native-Hall/installed-Module model, why the fold happened (by reference), the manifest tier schema already shipped on this branch, and acceptance criteria for TK-002 and TK-003 below. Author `pip/LEXICON.md` in the same pass to close the companion WORKBENCH_FEEDBACK.md gap. | done | none | This `SPEC.md` and `pip/LEXICON.md` committed; `node tools/spec-workbench.mjs doctor` and `render` both pass; no source in `tools/foundry.mjs` or `manifest/foundry.json` changed. |
| TK-002 | Land `claude/foundry-canon-refresh` on this repository's own `integration`, satisfying the Branch-Landing Acceptance Criteria below. Tracks GPT_OS `S-024-native-socket-foundry`/TK-005, scoped to this repository's own staging branch rather than GPT_OS's. | ready | TK-001 | pending |
| TK-003 | The Gatehouse's first real implementation slice (its first working Job Order primitive), satisfying the Gatehouse First-Slice Acceptance Criteria below. | deferred | TK-002 | pending |

## Acceptance Criteria

### Branch-landing acceptance (TK-002)

- [ ] Full `RUNBOOK.md` verification passes on the merge candidate commit:
      `tools/test-foundry.mjs`, `tools/test-captain.mjs`,
      `foundry.mjs validate-manifest`, `foundry.mjs doctor --harness-only`,
      `spec-workbench.mjs render`, `spec-workbench.mjs doctor`, and
      `git diff --check`.
- [ ] A real cold adoption from an empty temporary instance installs the four
      Modules only, verifies all four native Halls present with their
      required control docs (including this spec and `pip/LEXICON.md`), and
      the instance-scoped Foundry doctor passes with K-002/K-003 truthfully
      reported pending and K-004 unbound.
- [ ] The installed Assay (`audit-engine/`) produces a fresh, trusted-provenance
      read-only healthy report against the cold checkout.
- [ ] The merge lands on this repository's `integration` only — never `main` —
      by an explicit merge or fast-forward that a subsequent `git fetch`
      confirms is present at `origin/integration` at the exact reported SHA.
- [ ] No native Hall's source content changes as a side effect of the merge
      beyond what TK-002's own diff already contains; a native Hall is never
      "re-cloned" to land this ticket.

### Gatehouse first-slice acceptance (TK-003)

- [ ] Kayden (or an owner-authorized dispatch) explicitly lifts the
      "no Gatehouse implementation this pass" non-goal before any Gatehouse
      source beyond the scaffold is written — the scaffold's own
      `gatehouse/BLUEPRINT.md` Non-Goals list governs until then.
- [ ] The slice delivers at least one working Job Order primitive (assignment,
      scanning, or an equivalently real containment-boundary behavior) proven
      by that Hall's own red/green tests, not by scaffold presence alone.
- [ ] `manifest/foundry.json`'s `G-001` entry flips `status` from `"planned"`
      to `"active"` only after that slice's own tests and Foundry doctor both
      pass — `status` must never claim activity a Hall has not yet earned.
- [ ] The slice is recorded as its own durable capability under
      `gatehouse/specs/` (or this repository's `specs/` if the Gatehouse has
      not yet stood up its own spec store), following the same
      requirements/decisions/acceptance/evidence shape this spec follows —
      not left as a Taskboard-only entry.
- [ ] Root `LEXICON.md`'s Gatehouse-relevant terms (`Job Order`, `Pawn`,
      `clearance band` — currently indexed as "not implemented" in
      `gatehouse/LEXICON.md`) gain real, non-placeholder definitions in that
      Hall's own Lexicon once they exist as working behavior.

## Testing Seams

- `tools/test-foundry.mjs` already exercises the manifest tier schema this
  spec documents (four native-Hall components, tier/family/path/destination
  mutual exclusivity, `foldedFrom` presence/absence, native-Hall control-doc
  presence) — this spec adds no new test surface of its own, it records the
  contract that surface already proves.
- `node tools/spec-workbench.mjs doctor` and `render` are this spec's own
  testing seam: they prove the spec file itself is well-formed, linked
  correctly, and reflected in `BLUEPRINT.md`'s catalog and `TASKBOARD.md`'s
  hot board.
- TK-002's cold-adoption and Assay-report proof (Branch-Landing Acceptance
  Criteria) is the seam for the merge itself.
- TK-003's own red/green tests, once that ticket starts, are owned by
  whichever Hall implements the first Job Order primitive.

## Documentation Impact

- This spec (new).
- `pip/LEXICON.md` (new, companion change — see Task 2 of the originating
  session; not a re-implementation of anything in `tools/foundry.mjs`).
- `BLUEPRINT.md` and `TASKBOARD.md` — regenerated catalog/hot-board rows via
  `node tools/spec-workbench.mjs render`, no hand edits.
- `WORKBENCH_FEEDBACK.md` — the 2026-07-28 `pip/` LEXICON.md row and the
  2026-07-28 S-001-supersession row both move from `new` to `landed`,
  pointing at this spec.
- GPT_OS root `specs/S-024-native-socket-foundry/SPEC.md` is unchanged by this
  spec; if TK-002 lands, whoever owns that GPT_OS spec may choose to update
  its own TK-005 evidence to point at this repository's landed commit, but
  that update belongs to that spec's owner, not this one.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-07-28 | TK-001 | Authored this spec and `pip/LEXICON.md` on `claude/foundry-canon-refresh`, reusing the prior pass's clean worktree without redoing its manifest/doctor/gatehouse-scaffold work. | `node tools/spec-workbench.mjs doctor` and `render` both passed against the new spec file; `node tools/test-foundry.mjs` and `node tools/test-captain.mjs` re-run clean (unchanged by this documentation-only ticket); `git diff --check` clean. | This `SPEC.md`, `pip/LEXICON.md`, regenerated `BLUEPRINT.md`/`TASKBOARD.md` catalog rows, and two `WORKBENCH_FEEDBACK.md` status updates. | TK-002 (branch landing) and TK-003 (Gatehouse first slice) remain open; TK-003 is additionally gated on an owner decision to lift the current Gatehouse non-goal. |

## Completion Result

Pending. TK-001 (this spec's own authorship) is done; TK-002 (land the branch)
and TK-003 (Gatehouse's first real slice) remain open, with TK-003 additionally
gated on an explicit owner decision to begin Gatehouse implementation at all.

## Remaining Limitations Or Follow-Up Specs

- This spec does not itself contain GPT_OS `S-024`'s TK-006 (Servitor
  terminology reconciliation) or TK-007 (physical-gap evidence recording);
  both stay owned by that GPT_OS spec.
- The `nativeHallErrors()` doctor gate still deliberately excludes
  `LEXICON.md` from its required-control-docs list even though every native
  Hall now has one after this pass. Tightening that gate to require
  `LEXICON.md` for every native Hall going forward (so a future fifth Hall
  cannot silently ship without one) is optional follow-up, not required by
  this spec's acceptance criteria.
- Whether `KaydenClark/LLM_Workbench` remains a published distribution channel
  for external consumers who want the Workbench without the whole Foundry
  (root `BLUEPRINT.md` Design Decisions, TK-004) is a live open question this
  spec does not resolve.

## Supersession

- References, and does not duplicate or restate, GPT_OS root
  `specs/S-024-native-socket-foundry/SPEC.md`, the originating decision for
  the native-Hall fold.
- Formally succeeds `specs/S-001-portable-foundry-harness/SPEC.md`'s
  forward-looking "every component installed by manifest, none vendored"
  contract for the three folded Halls (the Forge, the Assay, the Ward) only,
  exactly as S-001's own Supersession section already states. S-001's
  Module-only contract (OpenBrain, CIC, Slack, Discord) is unaffected and
  remains governed by S-001. S-001's evidence log is not rewritten.
- Closes the open item recorded in `WORKBENCH_FEEDBACK.md` (2026-07-28,
  `specs/S-001-portable-foundry-harness/SPEC.md` supersession row) calling
  for exactly this spec to be opened.
