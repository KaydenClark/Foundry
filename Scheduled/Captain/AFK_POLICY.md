# AFK Policy

This is the reusable Foundry policy for autonomous operation. An adopting
instance supplies its host, owner, registry, adapters, and runtime bindings; the
policy never replaces project-local controls.

## Scope and cadence

The AFK Coordinator runs on the instance's configured coordinator host. Its
enrolled scope is the instance root, Foundry core, and actively enrolled
projects derived from the instance project registry and Captain portfolio,
subject to explicit opt-out. It runs after verified remote checkpoints and at
least once daily as a reconciliation backstop.

## Continue by default

Within verified project controls, continue all already-authorized work. Every
autonomous lane launch first passes the instance launch preflight for every repository
the lane touches; a failed preflight records that lane as blocked with the
named failures and passes capacity onward — recorded `ready` state is never
sufficient to launch. Clean,
non-divergent checkouts may fast-forward. Dirty, ahead, or diverged enrolled
work must be diagnosed, safely checkpointed to a verified remote recovery ref,
reconciled through repository branch policy, and continued when its paths are
known, non-secret, and non-runtime.

An intended branch with complete required tests, docs, and evidence may merge
to `integration`. If a gate is missing, dispatch the smallest owning task,
repair it, and retry. `integration` to `main` is always the owner's explicit
production decision.

## Daily portfolio slices

Every unattended daily pass accounts for every enrolled project. It may execute
only one frozen project-owned outcome through one Spark/medium Engineer; all
other lanes receive a truthful receipt. The daily pass must not automatically
dispatch Planner, Auditor, Combat Medic, parallel, or nested tasks. Independent
audit and repair remain required before acceptance, but occur only in a
separate explicitly authorized run.

A direct assignment, rank winner, blocker, stale projection, collision, or owner
gate in one lane cannot starve unrelated work. Record that lane's truthful
state, pass capacity to unrelated eligible lanes, and stop only the scope
covered by a hard stop below. Newly discovered work becomes the next slice
unless it is required to unblock or safely repair the frozen current slice.

## Freshness and repair

Stale, missing, or contradictory derived state is an incident, not a current
owner decision. Reconcile the canonical project controls and active claims
before classifying a lane or asking the owner anything. The operator surface must show source and
freshness and must render the repair status rather than old state as current.

One Combat Medic may own each non-overlapping repository/spec writer lane. The
first uses the lowest capable tier and returns diagnosis, attempted repair,
evidence, and a concrete escalation rationale. A second independent Medic uses
the lowest tier that fits that rationale. Only after the safe path is exhausted
does the Coordinator write a canonical blocker and notify the owner.

Every implemented slice receives an independent Auditor after tests. Audit
failure, missing remote recovery, or dirty closeout dispatches the bounded
Combat Medic path and then re-test/re-audit. A completed slice ends clean at a
remote-verified ref. An incomplete slice ends with a pushed checkpoint, clean
checkout, exact remaining work, and next verification gate.

## Hard stops

Stop and escalate only for a genuinely new login or authority, unapproved paid
service, irreversible remote deletion, credential/privacy data, unresolvable
conflict, unknown ownership, or the owner-only `integration` to `main` gate.

## Hosts and visibility

An offline secondary host never stops unrelated work. Defer only proof that needs
its unique runtime capability, use approved local fixtures where available, and
on its return safely synchronize/recover before dispatching the smallest
deferred validation.

Write one sanitized project-owned Git/Markdown receipt per enrolled project for
every daily AFK run. It names the frozen slice, visible/demo progress or
evidence-backed blocker, tests, audit/Medic result, docs, recovery/cleanliness,
source freshness, and next slice. The operator surface renders those receipts as
derived current and historical AFK status. Once an outbound messaging binding
exists, post an agent-authored issue notification for every AFK-run issue.
Messaging, operator, and retrieval surfaces remain mirrors, never sources of
task or proof truth.
