---
name: landing-check
description: Independently verify one exact remotely recoverable candidate and emit non-authorizing review evidence immediately before Land, or fail closed on changed, stale, ambiguous, unproved, private, or out-of-scope state.
---

# Landing-check

Judge one fixed candidate from one live `/in-flight` Intent handoff. This stage
is independent and read-only. It does not repair the candidate, update refs,
accept a lifecycle handoff, perform Land, merge, or close anything.

## Required input

Consume exactly one JSON object whose top-level shape is:

```yaml
stage: bootstrap-in-flight
canonBinding:
  exactJobOrder: JO-<FUID>/<REVISION>
  spec: <one stable Spec identity>
  ticket: <one ticket identity>
actor: <one accepted Engineer>
role: engineer
writerLane:
  worktree: <one absolute isolated writer worktree>
  branch: <one codex/ no-track branch>
repository:
  identity: <one repository identity>
  recoveryRemote:
    name: <one configured remote>
    url: <one exact HTTPS recovery URL>
allowedPaths: <unique literal repository-relative paths>
exclusions: <explicit denied paths, data, and actions>
proofExpectations: <named review and recovery expectations>
checkedTarget:
  ref: refs/heads/integration
  sha: <full lowercase 40-hex base commit>
candidateRef:
  ref: <refs/heads/ plus writerLane.branch>
  sha: <full lowercase 40-hex candidate commit>
  exists: true
changedPaths: <nonempty exact subset of allowedPaths>
tests:
  - name: <one named candidate check>
    status: pass
unavailable:
  exactOrderReceipt: bootstrap-unavailable
  lifecycleTip: bootstrap-unavailable
  claimFuid: bootstrap-unavailable
  runFuid: bootstrap-unavailable
  handoffFuid: bootstrap-unavailable
  handoffDigest: bootstrap-unavailable
independentReviewRequired: true
landingAuthorized: false
mergeAuthorized: false
disclaimer: This is an Intent handoff, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.
```

Do not reconstruct this record from a ticket, taskboard, branch name, local
checkout, chat, or general handoff. Reject arrays, duplicate records, blanks,
placeholders, truncated SHAs, symbolic refs, and mixed checks. `allowedPaths`
and `changedPaths` use exact string equality; they are not globs, directory
prefixes, or inference rules.

The independent reviewer also supplies one review-evidence JSON object:

```yaml
reviewer: <same independent reviewer passed on the command line>
baseSha: <same checkedTarget.sha>
candidateSha: <same candidateRef.sha>
candidateRef: <same candidateRef.ref>
targetRef: <same checkedTarget.ref>
outcome: pass | reject
checks:
  - name: <one named independent check>
    status: pass
findings: <empty for pass; one or more complete findings for reject>
privacyChecked: true
privacyFindings: []
exclusionViolations: []
```

Each rejected finding names severity, literal path, positive line, violated
control, user impact, and smallest safe correction. A different identity string
is necessary but does not itself prove independence; dispatch evidence must show
that the reviewer is a genuinely separate actor.

## Prepare the review lane

Before invoking the helper, prepare a clean detached review worktree at the
exact candidate SHA. The helper never clones, fetches, checks out, resets,
cleans, commits, pushes, edits, lands, or merges. It uses trusted read-only Git
commands with system and global configuration disabled and optional locks off.
Both entry and exit snapshots include tracked, untracked, and ignored entries;
an ignored payload is dirty and blocks review.

Review only `checkedTarget.sha..candidateRef.sha`. Trace the changed behavior
through callers, tests, error boundaries, public contracts, operations, and
owning documentation. Re-run the meaningful candidate checks in this detached
lane. Verify repository visibility, disclosure boundaries, exclusions, remote
recovery, and semantic compatibility with the checked target.

Invoke the deterministic guard from the shared-skills repository:

```bash
node landing-check/scripts/landing-check.mjs \
  --handoff /ABSOLUTE/PATH/bootstrap-in-flight.json \
  --reviewer INDEPENDENT-REVIEWER-ID \
  --review-repository /ABSOLUTE/PATH/DETACHED-REVIEW-WORKTREE \
  --review-evidence /ABSOLUTE/PATH/review-evidence.json
```

For a private HTTPS recovery remote, provide the authorization header only
through the trusted process environment variable
`LANDING_CHECK_GIT_AUTH_HEADER`. Never place its value in the handoff, review
evidence, command line, Git config, output, or logs. The helper validates its
shape, passes it to only the read-only `ls-remote` child through Git
`--config-env`, and scopes the header to the exact bound HTTPS URL. All other
ambient environment and Git configuration remains scrubbed. Repository-local
credential helpers, askpass, HTTP settings, proxies, URL rewrites, and transport
overrides are rejected or explicitly disabled; repository discovery is bounded
to the exact review root. Missing or failed authentication is reported only as
sanitized recovery ambiguity.

Every Git child receives one fixed verified temp root: `/private/tmp` on Darwin
or `/tmp` on other supported Unix hosts. The root must resolve without a
symlink, be a root-owned directory, and carry the sticky bit whenever it is
shared-writable. The helper never inherits caller `TMPDIR`, `TMP`, or `TEMP`;
an unavailable or unsafe fixed root fails closed without invoking Git.

Every named option may appear exactly once. Repeated bindings are duplicate
ambiguity and are rejected before any input file is read. Unknown options,
missing values, unreadable files, and malformed JSON always produce sanitized
structured output with both non-authority flags and the required disclaimer;
supplied paths and parser details are never echoed.

The helper verifies all of these facts twice where movement matters:

1. One complete In-flight handoff retains its Canon, actor, repository, lane,
   target, candidate, scope, proof, unavailable fields, and non-authority flags.
2. Reviewer and implementer differ; review evidence binds the same reviewer,
   base, candidate, candidate ref, and target ref.
3. The review repository is the exact clean worktree root with no tracked,
   untracked, or ignored payload; HEAD is detached at the candidate, and the
   base and candidate resolve without mutation.
4. The checked base is an ancestor of the candidate; the actual diff is
   nonempty, equals `changedPaths`, and every path matches one `allowedPaths`
   entry by exact string equality.
5. The configured and effective recovery URL match the handoff; the remote
   candidate ref equals the candidate SHA and the remote target ref equals the
   checked target SHA.
6. Candidate and independent review proof is named and passing; privacy was
   checked with no finding, and no exclusion was crossed.
7. HEAD, tree, dirty state, candidate ref, and target ref remain unchanged
   through the check.

Missing or unreadable recovery facts are ambiguity, never permission to infer.
Never disclose secrets, credentials, personal data, or private bindings that
the authorized evidence destination does not require.

## Deterministic disposition

Evaluate fail-closed in this order: unreadable recovery state; duplicate input;
invalid authority or reviewer; scope, privacy, or exclusion failure; changed
candidate or target; mismatched comparison or proof; semantic rejection; then
acceptance. Combined faults retain this order: scope, privacy, and exclusions
outrank proof mismatch, while stale remote refs outrank comparison mismatch.

<!-- landing-check-decision-order:v2 recovery-ambiguous>duplicate-ambiguous>authority-blocked>scope-or-privacy>stale-candidate>stale-target>mismatched>review-rejected>accepted -->
<!-- landing-check-contract:v2 -->
| Case | Outcome | Next | Required response |
|---|---|---|---|
| accepted | accepted | `/land` | Emit exact review evidence for a separate Land actor; grant no landing or merge authority. |
| review-rejected | rejected | `/in-flight` | Return named findings; any correction creates a new candidate and requires a new Landing-check. |
| stale-candidate | blocked | `/in-flight` | Candidate movement invalidates the verdict; obtain a fresh exact In-flight handoff. |
| stale-target | blocked | `/preflight` | Target movement invalidates the comparison; rebuild entry and candidate facts. |
| scope-or-privacy | blocked | `/preflight` or none | Preserve the violation and return added work to its owning authority. |
| authority-blocked | blocked | none | Preserve the denial, mismatched identity, or missing independent actor gate. |
| mismatched | blocked | `/in-flight` | The handoff, lane, diff, or proof does not describe one exact comparison. |
| duplicate-ambiguous | recovery-required | none | Preserve the duplicate handoff or review records and stop. |
| recovery-ambiguous | recovery-required | none | Preserve readable refs and stop until repository, commit, or remote state is exact. |

The possible outcomes are accepted, rejected, blocked, or recovery-required.
Every output retains:

```yaml
landingAuthorized: false
mergeAuthorized: false
```

An `accepted` result means only that the fixed candidate passed this review
stage and may be presented to a separately authorized `/land`. It is not
landing authority. A rejected or blocked result grants nothing. A
recovery-required result preserves state and stops.

Candidate or target movement invalidates every prior result. A candidate repair
must be committed, pushed, read back, re-emitted by `/in-flight`, and reviewed
again. Target movement returns to fresh entry checks. Missing `/land` or
`/postflight-check` support remains `delivered-unclosed`; Landing-check never
rounds it up to delivery or closure.

Every result states:

`This is independent review evidence, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.`
