---
name: preflight
description: Verify a room's recorded work state against Actuality and Canon before taking a big vertical slice — every ticket diagnosed, every block tested for whether it is real. Use before a slice, an integration advance, or a Captain dispatch, and whenever recorded state looks older than the work.
---

# Preflight

Answer, for every ticket in scope: **is this really blocked, and do we have
what we need to finish it?** Then either authorize the launch or name exactly
what must be reconciled first.

A sitrep is a **read of Projection** — the top of the stack, a capture of what
state *was* when someone last looked. A preflight goes down to **Actuality**
and **Canon**: the live filesystem, the real refs, the commits a ticket cites
as proof. That is the whole difference. A sitrep may route; only a passed
preflight authorizes execution.

## Run it

Use ticket-wide audit only to diagnose recorded state:

```bash
node tools/preflight.mjs --audit --repo /ABSOLUTE/REPO [--repo /ABSOLUTE/REPO2]
```

Scope to one spec with `--spec S-###`; omit it to audit every active spec.
Pass `--repo` for **every repository the work touches** — a room's tickets
routinely land in a sibling repo, and an unscanned repo is an invisible one.
Add `--json` when you need the structured result. `--audit` remains diagnostic
and non-authorizing: it never selects or authorizes a Job Order launch.

To gate one specific launch instead of diagnosing all of them:

```bash
node tools/preflight.mjs --spec S-### --ticket TK-### --job-order JO-XXXXXX --repo /ABSOLUTE/REPO [--repo /ABSOLUTE/REPO2] [--push-to BRANCH] --json
```

Launch ingress requires all three matching selectors: exact Spec, ticket, and
Job Order alias. A ticket-only launch returns `job-order-required` and is
non-authorizing. Do not infer a Job Order from a ticket, prose, branch name,
directory, ordering, or the first apparently ready packet.

An exit code of zero is necessary but not sufficient. Read the structured
result and confirm `jobOrder.alias`, `jobOrder.revision`, and
`launchAuthorized` exactly match the Canon-issued alias, revision, and literal
`true`. A missing, different, stale, ambiguous, or ineligible order fails the
launch even if another order under the ticket could pass.

## Read the exit code before anything else

| Exit | Meaning | What you do |
|---|---|---|
| 0 | Every check passed | Launch is authorized only when the structured exact-order checks above also match |
| 3 | **Reconcilable only** — the record disagrees with source | Go verify against Actuality and update the record. **Do not stop and wait for the owner.** |
| 1 | Blocking | Stop. This is an owner report. |
| 2 | Usage error | Fix the invocation |

Exit 3 is the point of this skill. A stale record and a live owner gate used
to produce the same halt, so a lane whose paperwork had simply fallen behind
would sit waiting on Kayden for hours. They are now different outcomes with
different responses.

## Per-ticket verdicts

| Verdict | Means |
|---|---|
| `launchable` | Blockers satisfied and the Next gate authorizes it |
| `gate-elsewhere` | Nothing holds it, but the Next gate names another ticket |
| `blocked-verified` | Held by a named ticket that is genuinely not done |
| `blocked-stale` | Held by a ticket that is already finished — **reconcile, do not wait** |
| `blocked-unverifiable` | Held by prose no tool can check; a human must read it |
| `owner-gated` | Reserved to Kayden; only an Owner Command clears it |
| `proof-dangling` | Recorded done, but its cited proof does not resolve anywhere |
| `deferred` | A decision, not an obstacle |
| `done` | Closed; says whether the proof actually resolves |
| `unevaluable` | No reachable evidence either way — fails closed, treat as unknown |

## What to do with the findings

1. **Reconcile before you launch, not after.** For each `blocked-stale`,
   `proof-dangling`, or stale-ref finding: open the branch or commit it names,
   confirm what actually landed, then correct the ticket row. Reconciling a
   record to match verified source is inside any agent's authority; it is
   bookkeeping, not a scope change.
2. **Never release an owner gate to clear a finding.** `owner-gated` and every
   blocking failure stay with Kayden. Reconciling the record is not the same
   act as releasing a guard someone deliberately placed — if you cannot tell
   which one you are doing, it is the second.
3. **Re-run after reconciling.** The gate is reconciled, never bypassed. A
   corrected record that still fails is a real failure.
4. **Say what you could not check.** `unevaluable`, `blocked-unverifiable`,
   and a ticket citing no machine-checkable proof are all reported as unknown
   rather than assumed fine. Repeat that honestly instead of rounding up.

## Limits worth stating out loud

The tool verifies what the record *cites*. A ticket whose Proof cell is empty
offers nothing to check, so a lane can be stale in a way no check will catch —
which is exactly how S-024 stalled. Cite commits and paths in Proof cells and
this stays detectable; leave them blank and it does not.

It also matches refs by spec id or by branches the spec names in its own
prose. A bare ticket id is deliberately not matched: nearly every spec has a
TK-005, and matching it alone reported one branch against fifteen specs.

Preflight is read-only and mutates nothing. It creates no durable artifact —
if reconciliation produces knowledge worth keeping, that is a separate `/save`
or `/to-docs` step under its own authority.

Every rejection is read-only and causes no mutation. A passed Preflight does
not create a Claim, Run, receipt, or lifecycle identity; it is only the exact,
fresh launch gate consumed by the separately authorized next stage.
