# S-015 - One-Project Forge Pilot And Version Rollout

> Generated from LLM Workbench v2.3. Stable path; never move between status
> folders or replace this record with a project-wide rollout claim.

**Spec ID:** S-015
**Status:** active
**Priority:** 1
**Owner:** Forge / Kayden
**Updated:** 2026-08-18
**Catalog description:** Define a bounded one-project Forge pilot with exact candidate identity, rejection pinning, and owner-gated version rollout without silently changing other projects.
**Blockers:** Owner approval of one named pilot project and an exact candidate version.
**Latest event:** Contract recorded from the L-018 audit finding; no pilot or rollout has run.
**Next gate:** Name the pilot project and candidate version, then authorize TK-001.

## Outcome

The Forge can evaluate one named project against one exact Workbench candidate
version, record an independent verdict, keep a rejected candidate from becoming
the project's active version, and promote an accepted version only through an
explicit owner-gated rollout receipt. A pilot is evidence for that named project
and candidate; it is not a fleet-wide rollout authorization.

## Why It Matters

Without a bounded pilot contract, a Workbench version can be treated as accepted
because it was tried once, or a rejected candidate can silently replace the last
known-good version. The rejection pin and exact candidate identity keep rollout
reversible and attributable.

## Current Verified State

- Forge S-014 already requires immutable exact-SHA audit and release evidence for
  the Workbench integration-to-main candidate.
- No one-project pilot, rejection-pin, or version-rollout contract is recorded
  in the Forge stable catalog.
- No pilot project, candidate version, acceptance, rejection, or rollout receipt
  is claimed by this spec.

## Desired Behavior

- Select exactly one owner-approved project and record its baseline Workbench
  version before the pilot begins.
- Identify the candidate by source repository, branch/ref, exact commit SHA,
  package/version identifier, and the verification environment.
- Run the bounded pilot and an independent audit against that exact candidate.
- On rejection, preserve the last accepted project version, pin the rejected
  candidate and reason in append-only evidence, and require a new candidate for
  any retry.
- On acceptance, create a versioned rollout receipt naming the accepted source,
  proof, Assay/audit result, destination, rollback pin, and owner approval before
  changing that one project.
- Keep every other project unchanged until it receives its own authorized rollout
  decision and receipt.

## Decisions And Contracts

- **One project means one project.** The pilot names one project and one bounded
  acceptance surface; it cannot authorize a portfolio or fleet rollout.
- **Candidate identity is exact.** A moving branch, tag, or package label alone
  is not a candidate pin; the source/ref, exact SHA, version, and environment are
  recorded together.
- **Rejection pins the last accepted version.** A failed candidate is recorded as
  rejected with its reason and remains unavailable to the pilot project; the
  project's last accepted version stays the rollback and retry baseline.
- **Acceptance does not merge or deploy by itself.** A passed pilot still needs a
  separately authorized rollout receipt naming the exact destination and owner
  approval.
- **Cross-project promotion policy remains open elsewhere.** Root S-034/TK-014
  owns the future promotion-audit/ADR lifecycle and the unresolved
  tracking-versus-hard-fork comparison. This spec does not choose that design.

## Non-Goals

- Running a pilot, choosing its project, or selecting a candidate without owner
  authorization.
- Promoting a candidate to `main`, a public product, or every enrolled project.
- Rewriting history, moving protected branches, force-pushing, or changing
  credentials or repository visibility.
- Deciding whether long-term producer lineage is tracked or hard-forked.

## Dependencies And Blockers

- Owner names one pilot project and approves its bounded acceptance surface.
- Owner names the candidate version and its exact source/ref/SHA.
- Forge S-014 supplies the exact-SHA release-candidate audit pattern.
- Root S-034/TK-014 supplies the future cross-project promotion-audit and ADR
  lifecycle boundary.

## Vertical Implementation Slices

| Ticket | Slice | Status | Blockers | Proof |
|---|---|---|---|---|
| TK-001 | Author and exercise the one-project pilot, rejection-pin, and version-rollout receipt against one owner-approved project and exact candidate. | deferred | owner-approved project and exact candidate version | pending; no pilot or rollout has run |

## Acceptance Criteria

- [ ] One named project and one exact candidate source/ref/SHA/version are recorded
      before the pilot runs.
- [ ] The pilot has an independent verdict and bounded evidence surface.
- [ ] Rejection preserves the last accepted version and records the rejected pin,
      reason, retry identity, and rollback path.
- [ ] Acceptance creates no rollout until a separate owner-gated receipt names the
      destination, exact accepted version, proof, and rollback pin.
- [ ] No other project changes as a side effect of this one-project pilot.
- [ ] The record does not decide the cross-project tracking-versus-hard-fork
      question owned by root S-034/TK-014.

## Testing Seams

- Candidate identity fixture rejects a moving ref without an exact SHA.
- Rejection fixture proves the last accepted version remains pinned and the
  rejected candidate cannot become active through retry or refresh.
- Acceptance fixture requires independent evidence and owner approval before a
  rollout receipt can be emitted.
- Scope fixture proves a one-project receipt cannot enumerate or mutate a second
  project.

## Verification Procedure

```bash
node tools/spec-workbench.mjs doctor
node tools/spec-workbench.mjs show S-015
git diff --check
# The pilot-specific commands are authored only after owner approval.
```

## Documentation Impact

- This stable Forge spec owns the pilot, rejection-pin, and version-rollout
  contract.
- S-014 owns the exact Workbench integration-to-main release candidate gate.
- Root S-034/TK-014 owns the future cross-project promotion-audit, ADR lifecycle,
  and tracking-versus-hard-fork decision.
- Forge `BLUEPRINT.md` and `TASKBOARD.md` are generated projections of this record.

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
| 2026-08-18 | spec | Stable contract opened for L-018. | The Forge catalog had S-014's release-candidate gate but no one-project pilot, rejection-pin, or version-rollout record; no project or candidate was changed. | This spec and generated Forge catalog/dashboard. | Owner must name and authorize the one project and exact candidate before TK-001 can run. |

## Completion Result

Pending.

## Remaining Limitations Or Follow-Up Specs

- The pilot remains intentionally deferred.
- Root S-034/TK-014 remains the owner for the unresolved cross-project
  promotion-audit and tracking-versus-hard-fork decision.

## Supersession

- Supersedes: none.
- Superseded by: none.
