# Audit Engine - Blueprint

> Generated from LLM Workbench v2.3.

**Last reviewed:** 2026-07-15
**Status:** active
**Source root:** `/Users/kayden/GPT_OS/Audit Engine`

## Product Map

Audit Engine is GPT_OS's read-only project verification service. Captain and
other chat agents use it to inspect one canonical project at a time, return an
evidence-backed status report, and eventually power periodic harness health and
archive-readiness reviews without changing the audited project.

Core promise:

> Ask GPT_OS to audit a project and receive one truthful, chat-friendly report
> showing what passed, what could not be verified, and what should happen next.

Founding prompt:

> "Please go ahead and set up the implementation project for the audit engine.
> Call it Audit Engine so I don't get Confused"

## Goals And Pillars

- **Chat first:** people ask for audits in ChatGPT, Claude, Codex, or another
  GPT_OS-compatible client; terminal commands remain internal plumbing.
- **Read-only evidence:** an audit observes target state and never repairs it.
- **Local contracts:** projects own their validation commands; Audit Engine owns
  orchestration and the normalized report.
- **Truth over optimism:** missing identity, live remote freshness,
  synchronization, or project validation degrades visibly.

## Cross-Cutting Architecture And Invariants

| Layer / concern | Choice | Invariant / source |
|---|---|---|
| Runtime | Node.js 22+ ESM | Built-in filesystem, subprocess, and test APIs; no runtime dependency install |
| Product surface | `runAuditRequest` chat contract plus internal executable adapter | Chat-facing message and structured report describe the same result |
| Data/storage | None in the first capability | Reports are returned to callers and are not silently persisted |
| Testing | `node:test` against temporary real Git repositories | Tests exercise public behavior rather than private helpers |
| Project validation | Root `audit-engine.json` schema `1.0` with named argv arrays and bounded timeouts | Audit Engine never parses prose into commands or invokes a shell |
| Deployment/runtime | Local agent invocation; scheduler is future work | Captain fetches before local-only activity evaluation; no daemon is claimed yet |
| Recovery | Private `KaydenClark/Audit-Engine` repository | Feature work stages on `integration`; Kayden owns `integration` to `main` |

Cross-cutting rules:

- Target projects remain canonical for their source, controls, validation
  commands, and proof.
- Audit Engine never mutates a target project.
- Target-controlled Git helpers and transports must not execute during an audit;
  live remote checks run outside the target configuration with a narrow URL
  allowlist and no inherited credential helpers.
- Git subprocesses receive an allowlisted environment, and execution-capable
  repository-local or per-worktree content filters cause an explicit failed
  check before `git status`.
- A project is not archive-ready merely because generic Git and harness checks
  pass; inactivity, project-owned validation, and owner notification must also
  be evaluated.
- Activity evaluation consumes the local upstream tracking ref, a trusted
  caller provenance object no older than 48 hours that exactly binds remote
  name, configured URL, ref, SHA, and fetch time, plus full reachable SHAs in
  active stable-spec append-only evidence. Target-writable `FETCH_HEAD` is not
  trusted; missing, stale, mismatched, or failed upstream evidence is `unknown`.
- A named checkpoint is still rejected when every changed path is a generated
  projection: exactly root `TASKBOARD.md` and `Projects/INDEX.md`. Any other
  changed path is value-eligible; the stable spec remains responsible for
  explaining the value.
- Seven days without evidence-backed pushed progress requests owner input;
  fourteen days may emit Ready-to-Archive data without changing lifecycle state.
- Generic checks alone leave overall status at `attention` until the owning
  project's validation contract runs.
- Project validation runs only after generic checks pass, with a minimal
  environment and no shell. Missing, invalid, failed, and timed-out contracts
  remain visible normalized evidence. Deadlines fail closed through the final
  process-group hard kill even when the direct child exits first; inability to
  prove group exit becomes a bounded infrastructure failure. Target output and
  project names have their line separators escaped so they cannot impersonate
  report structure.
- GPT_OS owns workspace-wide audit policy; CIC may render results but does not
  become their canonical owner.

## Non-Goals

- Repairing, committing, synchronizing, or archiving audited projects.
- Duplicating project validation commands in a central registry.
- Replacing project specs, Taskboards, Runbooks, Git, or runtime truth.
- Claiming scheduled coverage, CIC integration, or automatic notifications in
  the initial scaffold.
- Authenticated private-remote verification until a separately reviewed GitHub
  authentication adapter exists.

## Spec Catalog

<!-- spec-catalog:start -->
| Spec | Description | Status |
|---|---|---|
| [S-001 - Chat-First Project Audit](specs/S-001-chat-first-project-audit/SPEC.md) | Return a normalized, read-only project audit to GPT_OS chat agents and grow it toward project-owned validation and archive-readiness evidence. | active |
| [S-002 - Top-Level System Promotion](specs/S-002-top-level-system-promotion/SPEC.md) | Publish Audit Engine privately and promote its canonical checkout from project-room inventory to a top-level GPT_OS system function. | complete |
<!-- spec-catalog:end -->

## Design Decisions

| Decision | Rationale | Date / source |
|---|---|---|
| Name the independent project `Audit Engine` | Avoid confusion with CIC's `Integration` staging worktree | 2026-07-15 / Kayden |
| Make chat the primary interface | GPT_OS is normally operated through ChatGPT or Claude, not a human CLI workflow | 2026-07-15 / Kayden |
| Keep a structured report beneath the chat response | Multiple clients need one stable evidence contract even when presentation differs | 2026-07-15 / design interview |
| Keep audits read-only | Inspection and repair have different authority and should be delegated separately | 2026-07-15 / Kayden |
| Let projects own executable validation | Central copies of commands would drift from project truth | 2026-07-15 / design interview |
| Declare validation in `audit-engine.json` | A small universal JSON contract supports every stack while argv arrays avoid shell parsing and Markdown command scraping | 2026-07-16 / S-001 TK-002 |
| Promote Audit Engine to a top-level GPT_OS function | It inspects every project room and is part of the operating system, not a user project | 2026-07-16 / Kayden |

## Cross-Cutting Health

- `npm test` passes;
- `npm run check` passes;
- `node tools/spec-workbench.mjs doctor` passes;
- a chat report and its structured report agree on overall status;
- target-project Git checks remain read-only;
- missing evidence produces an explicit degraded result;
- spec render and doctor report no lifecycle or projection drift.
