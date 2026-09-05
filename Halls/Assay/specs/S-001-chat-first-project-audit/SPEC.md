# S-001 - Chat-First Project Audit

> Generated from LLM Workbench v2.3.

**Spec ID:** S-001
**Status:** active
**Priority:** 1
**Owner:** codex
**Updated:** 2026-07-16
**Catalog description:** Return a normalized, read-only project audit to GPT_OS chat agents and grow it toward project-owned validation and archive-readiness evidence.
**Blockers:** none
**Latest event:** TK-003 independent-review hardening replaced target-owned fetch evidence and rejected named generated-only checkpoints.
**Next gate:** Complete TK-004.

## Outcome

Captain or another GPT_OS chat agent can request an audit of one canonical
project and receive a truthful report with named checks, evidence, overall
status, archive readiness, and a safe next action.

## Why It Matters

GPT_OS spans many projects and clients. The root coordinator should not burn its
context rediscovering each repository or trust stale self-reported health. A
read-only audit engine provides one repeatable evidence contract while leaving
implementation and proof ownership inside each project.

## Current Verified State

- `src/index.mjs` returns a structured report plus a chat-friendly presentation.
- `bin/audit-engine.mjs` is thin internal plumbing for chat agents and tests.
- Generic checks cover path, repository identity, typed Workbench controls,
  working tree, live remote synchronization, and every registered worktree's
  cleanliness and safety markers.
- Chat output includes the same check identifiers, evidence, archive reasons,
  and next action represented in the structured report.
- Git inspection neutralizes target-configured filesystem monitors and external
  transports; remote freshness uses an isolated local/GitHub URL allowlist.
- Working-tree inspection refuses repository-local and per-worktree executable
  content filters. Production and test Git subprocesses receive an allowlisted
  environment with inherited Git/askpass configuration removed.
- Project-owned validation runs from root `audit-engine.json` with named argv
  arrays, bounded timeouts, a minimal environment, no shell, and normalized
  pass, failure, missing, invalid, and timeout evidence.
- Validation deadlines fail closed after timeout even when a target handles
  `SIGTERM` and exits zero; the final process-group `SIGKILL` remains scheduled
  when the direct child exits before an ignoring descendant, and inability to
  prove group exit within the bounded cleanup window is an infrastructure
  failure.
- Target-controlled stdout and stderr are capped and JSON-quoted as untrusted
  evidence, and chat rendering escapes control and Unicode line separators in
  both evidence and project names so target data cannot impersonate normalized
  report fields.
- Credential-free activity evaluation reports local remote freshness, last
  remote commit, evidence-backed pushed progress, seven-day owner input, and
  fourteen-day Ready-to-Archive data. Scheduling, notifications, and CIC
  rendering are not implemented.

## Desired Behavior

- Accept one resolved canonical project path per audit request.
- Remain read-only toward the target project.
- Return `healthy`, `attention`, or `unverified` based only on executed checks.
- Include evidence, archive-readiness state, and a safe next action.
- Read and execute project-owned validation contracts without central command
  duplication.
- Later support periodic audits and the 14-day inactivity review policy.

## Decisions And Contracts

- Chat is the human-facing interface; the executable adapter is internal agent
  plumbing and a repeatable verification surface.
- Structured and conversational results must describe the same report.
- Generic audit success does not by itself mean archive-ready.
- Generic checks remain `attention` until project-owned validation runs.
- Target repairs require separate project-scoped authorization and execution.
- Tests use temporary real Git repositories rather than mocking private Git
  helpers.
- Private GitHub authentication is not inherited during TK-001; an inaccessible
  private remote degrades explicitly.
- The validation contract is root `audit-engine.json` schema `1.0`; each entry
  declares `id`, `argv`, and `timeoutMs` from 1 through 120000 milliseconds.
- Validation is deferred until generic checks pass, executes sequentially with
  no shell or inherited credential environment, and never parses prose into
  commands. Projects own the non-mutating behavior of their declared commands.
- Captain fetches first and passes a strict provenance object containing only
  schema version, remote name, exact configured URL, tracked ref, SHA, and fetch
  time. Audit Engine performs no network and never trusts target `FETCH_HEAD`.
- Provenance must exactly match local upstream state and be no older than 48
  hours. Any failed upstream-sync, missing current spec, stale/mismatched proof,
  or invalid timestamp yields `unknown` and cannot request input or archival.
- A named reachable SHA is meaningful only when its commit changes a path other
  than root `TASKBOARD.md` and `Projects/INDEX.md`; those exact generated-only
  projections never reset the clock.
- Seven whole days requires owner input and fourteen whole days emits
  Ready-to-Archive data without changing project state.

## Non-Goals

- Mutating, repairing, synchronizing, or archiving target projects.
- Maintaining duplicate project validation commands.
- Adding a daemon, persistent database, CIC panel, or notification service in
  TK-001.

## Dependencies And Blockers

- Node.js 22+ and Git.
- Captain integration will consume the report contract in a later ticket or
  linked GPT_OS spec.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Return a normalized chat and structured audit report for one project | done | none | npm test: 8/8 pass; npm run check pass; render and doctor pass; git diff --check pass; live CIC audit returned evidence-backed ATTENTION |
| TK-002 | Execute the audited project's declared validation contract read-only | done | TK-001 | npm test: 18/18 pass; npm run check pass; pass/fail/missing/timeout and shell-refusal fixtures pass; render, doctor, and git diff --check pass |
| TK-003 | Evaluate 14-day inactivity and emit archive-readiness notification data | done | TK-002 | npm run test:audit and npm test: 33/33 pass; npm run check, render, doctor, and git diff --check pass; deterministic <7, =7, 7-13, =14, stale, unfetched, no-spec, unnamed-SHA, and generated-only fixtures pass |
| TK-004 | Add periodic scheduling and CIC consumption without moving truth ownership | blocked | TK-003 and owning integration specs | scheduler recovery tests and CIC rendering proof |

## Acceptance Criteria

- [x] A chat-facing request returns a normalized report for one project.
- [x] Invalid project identity is explicitly `unverified`.
- [x] Generic state failures block archive readiness.
- [x] The adapter can return chat text or structured JSON from the same report.
- [x] Project-owned validation runs with timeouts and visible failures.
- [x] The 14-day inactivity policy produces owner-facing Ready-to-Archive data.
- [ ] Periodic execution and CIC display have independent recovery proof.

## Testing Seams

- Confirmed with Kayden: `runAuditRequest({ projectPath })` returns the report
  and its chat presentation.
- The thin executable adapter proves agents can invoke the same contract.
- Validator tests exercise fixture projects' declared public argv contracts,
  not private Audit Engine helpers.

## Verification Procedure

```bash
npm run test:audit
npm test
npm run check
node tools/spec-workbench.mjs render
node tools/spec-workbench.mjs doctor
git diff --check
```

## Documentation Impact

- Bootstrap and behavior changes update Blueprint, Lexicon, README, Runbook,
  Taskboard, and this spec.
- GPT_OS project routing documentation must add Audit Engine after project proof
  is green.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-07-15 | TK-001 | Chat-first testing seam confirmed; three red/green behavior cycles and the agent adapter implemented. | `npm run test:audit` passed 4 tests before control-surface handoff. | Initial Workbench v2.3 controls drafted. | Run full bootstrap verification, review, and commit. |
| 2026-07-15 | TK-001 | Ticket closed | npm test: 8/8 pass; npm run check pass; render and doctor pass; git diff --check pass; live CIC audit returned evidence-backed ATTENTION | Updated AGENTS, BLUEPRINT, LEXICON, README, RUNBOOK, TASKBOARD projection, and S-001. | TK-002 must execute project-owned validation before full health or archive readiness can be evaluated. |
| 2026-07-15 | TK-001 | Post-close two-axis review hardening removed target-configured Git execution paths and corrected the exit-code contract. | `npm run test:audit` passed 10/10 including hostile fsmonitor and external-remote fixtures; target helpers did not execute. | Updated agent safety, architecture, README, Runbook, and S-001 limitations. | Authenticated private-remote verification needs a separately reviewed adapter; TK-002 remains next. |
| 2026-07-15 | TK-001 | Final standards hardening refused target content filters and removed inherited Git/askpass environment configuration. | `npm run test:audit` passed 12/12 including hostile local-filter and environment-injection fixtures; no marker command executed. | Updated safety, architecture, usage, operations, and S-001 evidence. | Safe authenticated private remotes and safe-filter allowlisting remain future work; TK-002 remains next. |
| 2026-07-15 | TK-001 | Independent standards re-review found and closed the per-worktree Git-config escape hatch; the test Git helper now uses the same allowlist principle. | Red/green regression proved a worktree-scoped clean filter is refused without execution; `npm test` passed 13/13; check, render, doctor, and diff checks passed. | Updated S-001 current-state and proof evidence. | Safe authenticated private remotes and safe-filter allowlisting remain future work; TK-002 remains next. |
| 2026-07-15 | TK-001 | Live multi-worktree proof exposed and closed a compatibility error when `extensions.worktreeConfig` is disabled. | Strengthened linked-worktree regression distinguishes dirty from unreadable; live CIC audit reported the canonical tree clean and only Integration dirty. | Updated filter-scope wording in AGENTS, Blueprint, Runbook, and S-001. | TK-002 remains the next implementation slice. |
| 2026-07-16 | TK-002 | Ticket closed | npm test: 18/18 pass; npm run check pass; pass/fail/missing/timeout and shell-refusal fixtures pass; render, doctor, and git diff --check pass | Updated AGENTS, BLUEPRINT, LEXICON, README, RUNBOOK, S-001, and generated TASKBOARD | TK-003 must add deterministic 14-day inactivity evaluation and owner-facing archive-readiness data |
| 2026-07-16 | TK-002 | Independent review hardening closed a timeout fail-open and report-injection seam. | Red/green regressions prove handled `SIGTERM` still reports timeout and multiline diagnostics remain quoted; `npm run test:audit` and `npm test` passed 20/20; check, render, doctor, and diff checks passed. | Updated AGENTS, BLUEPRINT, README, RUNBOOK canonical Factory path, and S-001. | TK-003 remains the next slice; PR #3 stays draft for independent re-review. |
| 2026-07-16 | TK-002 | Second independent-review repair closed descendant escape and Unicode line-separator injection seams. | Red tests proved a direct child could cancel the pending group `SIGKILL` and U+0085/U+2028/U+2029 could forge chat lines; green regressions prove the final group hard kill completes and every chat evidence line separator is escaped; `npm run test:audit` and `npm test` passed 22/22; check, render, doctor, and diff checks passed. | Updated AGENTS, BLUEPRINT, README, RUNBOOK, generated TASKBOARD, and S-001. | TK-003 remains the next slice; PR #3 stays draft for independent re-review. |
| 2026-07-16 | TK-002 | Third independent-review repair removed the timeout cleanup give-up false completion and escaped target-controlled project headings. | Red tests proved an unverified process group was reported only as a normal timeout and a separator-bearing project name could forge chat fields; green regressions prove bounded infrastructure failure and escaping of LF, CR, VT, FF, U+0085, U+2028, and U+2029; `npm run test:audit` and `npm test` passed 24/24; check, render, doctor, and diff checks passed. | Updated AGENTS, BLUEPRINT, README, RUNBOOK, generated TASKBOARD, and S-001. | TK-003 remains the next slice; PR #3 stays draft for exact-head independent re-review. |
| 2026-07-16 | TK-003 | Ticket closed | npm run test:audit and npm test: 33/33 pass; npm run check, render, doctor, and git diff --check pass; deterministic <7, =7, 7-13, =14, stale, unfetched, no-spec, unnamed-SHA, and generated-only fixtures pass | Updated AGENTS, BLUEPRINT, LEXICON, README, RUNBOOK, S-001, and generated TASKBOARD | TK-004 must add event-driven scheduling and CIC consumption with independent recovery proof; no scheduler, credentials, fetch, persistence, mutation, or automatic archival was added |
| 2026-07-16 | TK-003 | Independent-review trust repair replaced target-writable `FETCH_HEAD` with strict caller provenance and rejected named projection-only commits. | Red mutations proved forged fetch metadata, extra provenance fields, failed upstream sync, and named `TASKBOARD.md`-only commits could create false activity; green `npm run test:audit` and `npm test` passed 38/38; check, render, doctor, diff, and no-network-source checks passed. | Updated AGENTS, BLUEPRINT, LEXICON, README, RUNBOOK, S-001, CLI contract, and generated TASKBOARD. | TK-004 remains; Captain must construct provenance after authenticated fetch, and Audit Engine still performs no fetch, network, scheduling, CIC mutation, or archival. |

## Completion Result

Pending. S-001 remains active until project-owned validation, inactivity, and
periodic audit acceptance gates pass.

## Remaining Limitations Or Follow-Up Specs

- Captain skill/router integration belongs to GPT_OS or Workbench ownership.
- CIC rendering should be specified in the CIC project and linked here.
- Remote repository creation and publication are not part of this bootstrap.
- Private GitHub remote freshness may remain `attention` until safe authenticated
  verification is implemented.

## Supersession

- Supersedes: none
- Superseded by: none
