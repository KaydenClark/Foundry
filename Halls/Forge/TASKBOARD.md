# LLM Workbench - Hot Taskboard

**Current focus:** S-014/TK-002 remains in progress with REQUEST CHANGES: independently audit the escaped-table parser repair before restarting release evidence work.
**Owner:** Kayden (executive); agents execute assigned slices
**Last updated:** 2026-07-16

This dashboard contains current execution state only. Use
`node tools/spec-workbench.mjs next` to select work and `show S-###` to load its
requirements. Durable requirements, decisions, acceptance criteria, and proof
live in the linked spec. Commands live in `RUNBOOK.md`.

## Active Specs

<!-- hot-specs:start -->
| Spec | Current slice | Owner | Blocker | Latest meaningful event | Next gate |
|---|---|---|---|---|---|
| [S-014](specs/S-014-workbench-release-candidate/SPEC.md) | TK-002: Coordinate separate exact-head audit and evidence publication tasks (ready) | Captain (TK-002 coordination) | none for TK-002. Current `origin/main` is now an ancestor of `origin/integration`; the missing exact-head audit, release-gate status, and promotion PR are the remaining ticket work, not prerequisites. | 2026-08-02 stale claim reconciled against live GitHub state: `integration` is `aebe274`, 44 ahead and 0 behind `main` `08ab78e`; the exact integration SHA has no statuses and no integration-to-main PR exists. TK-002 returned to `ready` rather than remaining falsely in progress. | TK-002 — assign a separate read-only Auditor to the immutable `aebe274` integration SHA; only an unchanged PASS may proceed to separate evidence/status publication. |
| [S-011](specs/S-011-agent-skills-adoption/SPEC.md) | TK-003: Verify rewritten skills in fresh Claude and Codex sessions and prepare downstream distribution (blocked) | codex | Fresh Claude skill-discovery proof is absent | Claude authentication is live; prior non-persistent discovery invocation supplied no prompt and cannot prove skill discovery. | Capture and record a valid fresh Claude Code discovery result without changing credentials or claiming unavailable skills. |
<!-- hot-specs:end -->

## Owner Decisions

No open owner decisions. New decisions stay here only while they block an
active spec; the resolved decision moves into that spec.
