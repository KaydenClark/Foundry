# Audit Engine - Lexicon

> Generated from LLM Workbench v2.3.

**Last reviewed:** 2026-07-15
**Status:** active

This file owns terms whose meanings are shared across Audit Engine.

## Workbench Terms

| Term | Definition | Distinction |
|---|---|---|
| **Design concept** | The shared understanding between the parties working on a project about what that project is. | `BLUEPRINT.md` helps participants reconstruct it but is not itself the design concept. |
| **Blueprint** | The compact artifact for product direction, cross-cutting architecture, invariants, and non-goals. | It is not a work queue, glossary, or proof archive. |
| **Spec** | A stable capability record containing intent, requirements, decisions, slices, acceptance, verification, and evidence. | It is stable; tickets inside it are temporary. |
| **Ticket** | A one-context tracer-bullet implementation slice inside a spec. | It is execution structure, not durable capability history. |

## Project Terms

| Term | Definition | Distinction |
|---|---|---|
| **Captain** | GPT_OS's front-door coordinator that verifies the environment, owns the master objective, and delegates project work. | Captain routes and reconciles; Audit Engine performs read-only audits. |
| **Audit request** | A request to inspect one canonical project and return a normalized report. | It does not authorize repairs or lifecycle changes. |
| **Audit report** | The structured checks, evidence, overall status, archive-readiness state, and recommended next action returned for one project. | The chat message is a presentation of this report, not a second source of truth. |
| **Validation contract** | A project's root `audit-engine.json` schema `1.0` declaration of named, non-mutating argv commands and bounded timeouts. | Audit Engine executes this machine-readable contract after generic checks pass; it never guesses commands from prose. |
| **Healthy** | Every check executed by the current audit scope passed. | It does not imply acceptance gates outside the current scope passed. |
| **Attention** | The target identity is verified, but one or more executed checks failed. | It is not a diagnosis or repair authorization. |
| **Unverified** | Audit Engine could not establish the target path or repository identity. | It must never be presented as healthy or merely stale. |
| **Archive-ready** | Generic state, inactivity, project-owned validation, and notification gates all pass and the owner may choose to archive. | Audit Engine marks readiness; it does not archive automatically. |
| **Meaningful progress** | A commit reachable from the trusted fetched upstream SHA, named in active stable-spec evidence, with at least one changed path outside root `TASKBOARD.md` and `Projects/INDEX.md`. | A push, named generated-only checkpoint, or projection alone does not reset the clock. |
| **Remote freshness** | A trusted caller provenance object no older than 48 hours that exactly binds remote name, configured URL, tracked ref, SHA, and fetch time. | Target `FETCH_HEAD` is not trusted; invalid provenance or failed upstream sync makes activity unknown. |
