# Gatehouse - Blueprint

**Status:** early scaffold — no implementation. This document describes what
the Gatehouse is meant to become and is explicit about what does not exist yet.
Do not read anything below as a shipped capability.

## What This Is

The Gatehouse is the fourth native Hall of the Foundry, scaffolded by S-024
alongside folding the Forge, the Assay, and the Ward in as native tracked
source. Root GPT_OS `LEXICON.md` -> **the Gatehouse** is this Hall's charter of
record:

> The Hall that owns the containment boundary of the Foundry: walls, doors,
> security gates, badge scanning, Job Order assignment, per-plane
> verification, and clearance-band enforcement — contents *and* boundary.
> Halls **request** the structure they need as ordinary work tickets; the
> Gatehouse builds, owns, and enforces it, so neither a Hall nor the Gatehouse
> places a gate unilaterally. It owns the deterministic core, its own Pawn
> workforce, and security. Renames the earlier **Orchestration Engine**...
> Where **determinism** happens; the other three Halls are where model-driven
> judgment happens.

## Product Map (intended, not built)

| Layer | Intended role | Current state |
|---|---|---|
| Containment boundary | Walls/doors/gates between Halls and between the Foundry and the outside | Not designed |
| Badge scanning | Scans a Job Order at every entrance and interior door; the scan *produces* the audit trail the Assay reads | Not designed |
| Job Order assignment | Issues the badge: scope, current Canon reference, intended result, required proof | Not designed |
| Per-plane verification | Confirms an agent did exactly what it declared and never left its clearance band, at each governance-plane transition | Not designed |
| Clearance-band enforcement | The deterministic gate logic itself | Not designed |
| Pawn workforce | The Gatehouse's own deterministic, non-model actors (Pawns automate; Agents deliberate) | Not designed |

None of the above has a spec, a test, or a line of source yet. This table
exists so the eventual first spec has a concrete list to pick a first vertical
slice from, not because any row is in progress.

## Relationship To The Other Three Halls

| Hall | What it does | How the Gatehouse relates |
|---|---|---|
| the Forge | Builds and releases the Workbench | Requests gates as tickets, same as any Hall |
| the Assay | Read-only quality audit | Reads the same badge-scan trail the Gatehouse produces; never repairs |
| the Ward | Checks fit/integration across the deployment | Requests gates as tickets, same as any Hall |

Tickets are the sole interface between Halls. The Gatehouse never loads
another Hall's skills, and no Hall loads the Gatehouse's.

## Non-Goals (for this scaffold)

- Building any part of the containment boundary, badge scanning, or gate
  enforcement in this pass. This is documentation and directory scaffolding
  only (S-024 TK-003's companion Hall-creation work).
- Inventing a Pawn workforce, a manifest entry beyond the bare native-Hall
  declaration, or a fictional passing test suite.
- Deciding the Auditor/Assayer role-naming question — that is the Assay's own
  open item, not the Gatehouse's.

## Open Questions For Kayden

- What is the Gatehouse's first vertical slice? Candidates: (a) a minimal
  Job Order schema + issuance primitive, (b) a single deterministic gate check
  reused by an existing Hall, (c) the badge-scan log format the Assay will
  read. Not decided here — this scaffold takes no position.
- Does the Gatehouse get its own `specs/` + spec-workbench copy (like the
  Forge and the Assay), or share the root Foundry's spec lifecycle directly?
  Recorded as open in `AGENTS.md` -> Work Selection And Lifecycle.

## Design Decisions

| Decision | Rationale | Date |
|---|---|---|
| Scaffold gatehouse/ as native tracked source from day one, never a separate repo | Matches the native-Hall model S-024 established for the Forge/Assay/Ward; the Gatehouse never existed as a standalone project, so there is no history to fold and no separate remote to retire. | 2026-07-28 |
| Ship the full seven-file control-doc set (AGENTS/BLUEPRINT/LEXICON/RUNBOOK/TASKBOARD/CLAUDE/README) even though nothing is implemented | Structural consistency with the other three Halls beats a half-shape; every file says plainly that it describes a charter, not a shipped system. | 2026-07-28 |
| No `specs/`, no tools, no Pawn code in this pass | Avoids inventing fictional shipped capability; the first real ticket should design the first vertical slice deliberately rather than inherit an empty scaffold's guesses. | 2026-07-28 |
