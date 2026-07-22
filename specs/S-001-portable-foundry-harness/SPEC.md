# S-001 - Portable Foundry Harness

**Spec ID:** S-001
**Status:** active
**Priority:** 1
**Owner:** codex
**Updated:** 2026-07-21
**Catalog description:** Design, build, and prove the first portable install-by-manifest Foundry harness without moving a live instance.
**Blockers:** none
**Latest event:** TK-002 closed with proof.
**Next gate:** Present the proven harness for owner approval; do not begin the GPT_OS S-018/TK-003 cutover.

## Outcome

A blank session can clone `KaydenClark/Foundry`, run one parameterized adoption
command, install the declared Sockets and Modules from their own remotes, seed
instance memory/bindings outside the harness repository, and produce a
repeatable health/audit result.

## Why It Matters

The Foundry previously existed only as a hand-assembled folder inside GPT_OS.
The Forge already proved that a small control surface plus adoption protocol,
skills, tools, and a template Wiki can travel. Applying that shape one level up
makes GPT_OS one deployment instead of the product's only home.

## Decisions And Contracts

- This spec implements GPT_OS S-018 TK-001/TK-002 only and refines the S-007
  composition plus S-014 contract boundary.
- Build, do not move. The live GPT_OS tree and its tracked boundary remain
  untouched until the owner approves S-018/TK-003.
- Components are cloned from `manifest/foundry.json`; none are vendored or
  stageable in the Foundry repository.
- The installed Forge remains canonical for socket contract records. Instance
  bindings live outside this repository.
- The public Foundry repository contains no secrets, private Wiki content,
  runtime state, or host-specific absolute paths.
- Roles ship as portable `role-*` skills. GPT_OS S-016 still owns retiring its
  existing `Roles/` store during a later coordinated cutover.

## Non-Goals

- GPT_OS live cutover, launchd edits, service restarts, project re-enrollment,
  worktree moves, or deletion of historical leftovers.
- Changing any installed component repository.
- Owner promotion from `integration` to `main`.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Inventory and classify the harness, installed components, instance data, archives, and GPT_OS root scraps; define the control surface and setup/audit flow. | done | none | `BLUEPRINT.md` contains the verified component table, exact scrap dispositions/entanglements, socket ownership boundary, and ten-step adoption flow; no GPT_OS file changed. |
| TK-002 | Implement the control surface, manifest, roles-as-skills, Wiki/adoption templates, setup/doctor tools, and prove a cold scratch adoption plus Audit Engine. | done | TK-001 | Remote cold clone at 96c0df0ec5bf02911e49e920bfc42960670696d5 installed all seven manifest repositories at recorded refs/SHAs; focused tests and spec doctor passed; Foundry doctor passed with truthful K-002/K-003 pending and K-004 unbound; Audit Engine reported healthy 7/7 with trusted fetch provenance; harness Git remained clean with no gitlinks. |
| TK-003 | Cut an existing deployment such as GPT_OS over to this harness. | blocked | TK-002, owner approval | out of scope in this repository run |

## Acceptance Criteria

- [x] Ownership and root-scrap split maps record every requested item and its
      entanglements without moving the live source.
- [x] All required control files, manifest, templates, skills, scheduler policy,
      reference, tools, and tests are tracked in the Foundry repository.
- [x] The manifest validator rejects unsafe paths, duplicate identities,
      credential-bearing remotes, and instance binding data.
- [x] A cold scratch instance clones every component at its declared ref, seeds
      instance-owned Wiki/bindings/receipt data, and leaves the harness Git tree
      clean with installed repositories ignored.
- [x] Portability and boundary gates find no host-specific path, secret,
      stageable nested repo, gitlink, or registered worktree.
- [x] Foundry doctor passes and the installed Audit Engine produces a read-only
      report against the cold harness checkout.
- [x] Work stops before GPT_OS live cutover and before `integration` to `main`.

## Testing Seams

- manifest unit fixtures for valid/invalid repositories and destinations;
- local Git fixture adoption for red/green without network or credentials;
- real cold clone from the published Foundry branch and component remotes;
- boundary/portability test over the exact tracked tree;
- Audit Engine JSON report over the cold Foundry checkout.

## Documentation Impact

- Root Foundry `AGENTS.md`, `BLUEPRINT.md`, `LEXICON.md`, `RUNBOOK.md`,
  `README.md`, `TASKBOARD.md`, and this spec.
- `templates/ADOPTION.md`, `templates/GENESIS.md`, `templates/Wiki/`, and
  `skills/adoption` own the reusable setup flow.
- GPT_OS docs remain unchanged until the separately approved cutover.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-07-21 | TK-001 | Verified the S-018 target, S-007/S-014 lineage, Forge control/adoption pattern, S-016 role target, seven component remotes/refs, eleven registered worktrees, empty CIC leftover, root scraps, and public empty Foundry remote; recorded the build map. | GPT_OS root was clean on `codex/s018-portable-foundry-harness`; component checkouts were clean; remote `integration`/`Integration` refs resolved; no source moved. Root doctor remains blocked by unrelated stale S-013 and `next` routes there, so the user-assigned S-018 lane is executed only in this separate repository. | Authored this spec and `BLUEPRINT.md` in `KaydenClark/Foundry`. | Implement and prove TK-002, then stop for owner approval of GPT_OS S-018/TK-003. |
| 2026-07-21 | TK-002 | Ticket closed | Remote cold clone at 96c0df0ec5bf02911e49e920bfc42960670696d5 installed all seven manifest repositories at recorded refs/SHAs; focused tests and spec doctor passed; Foundry doctor passed with truthful K-002/K-003 pending and K-004 unbound; Audit Engine reported healthy 7/7 with trusted fetch provenance; harness Git remained clean with no gitlinks. | Updated the complete Foundry control surface, Blueprint split map, Runbook, README, ADOPTION/GENESIS, template Wiki, role skills, scheduler/Captain policy, and this stable spec. | GPT_OS live cutover S-018/TK-003 remains owner-gated; Forge-owned K-002/K-003 contract records and K-004 binding remain follow-up. |

## Completion Result

TK-001/TK-002 are complete: the portable harness was designed, built, cold
installed, diagnosed, and audited. TK-003 is intentionally blocked on owner
approval; no GPT_OS source, worktree, runtime binding, or tracked boundary was
moved or changed.

## Remaining Limitations Or Follow-Up Specs

- K-002/K-003 machine-readable contract records remain Forge-owned follow-up
  work; this harness installs their Modules and reports the pending contract
  state without duplicating the registry.
- Cloud scheduler durability and secret provisioning are deployment-specific
  follow-ups after local adoption proof.

## Supersession

- Refines GPT_OS S-007 and S-014.
- Implements the build portion of GPT_OS S-018.
- Superseded by: none.
