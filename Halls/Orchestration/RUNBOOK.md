# Orchestration Runbook

S-001 owns the lifecycle-transition primitive. An adopting instance must
supply its own accepted private authorization and create one executor with the
real Gatehouse evaluator, policy provenance, synthetic Job Order identity and
revision, exact grant, gates, and Git binding before accepting requests. Verify
the focused behavior and native Hall layout:

```bash
node --test test/lifecycle-transition.test.mjs
node --test test/lifecycle-engine.test.mjs
node --test test/lifecycle-composition.test.mjs
node ../../tools/test-foundry.mjs
```

## Composition root

`src/lifecycle-composition.mjs` is the composition root: it constructs the
engine from the Gatehouse clearance policy and the Knowledge Journal contract,
which are already exported and were previously never introduced to each other.
It owns no lifecycle rules of its own. `bin/lifecycle.mjs` is the CLI entrypoint
and the engine's first non-test caller.

```bash
node bin/lifecycle.mjs close \
  --repository /abs/path/to/lifecycle/checkout \
  --remote origin \
  --lifecycle-ref refs/heads/instance-flights/<order> \
  --job-order <JOB-ORDER-ID> --revision <REVISION> \
  --gate-evidence authority,freshness,single-writer \
  --evaluated-at <ISO-8601> \
  --event-id <EVENT-ID> \
  --payload '<terminal payload JSON>'
```

The terminal payload carries `disposition`, `artifactDigest`,
`postflightDigest`, `recoveryRef`, `recoverySha`, and all six `planeDigests`.
Every one is caller-supplied evidence; the tool invents none of it.

Exit `0` means the engine accepted the transition (`accepted` or
`accepted-idempotent`). Exit `1` prints the engine's verbatim outcome and
findings for a denial, conflict, rejection, or recovery state — none of which is
a closure. Exit `2` is a refused invocation, which never touches the lifecycle.
Re-running the same `--event-id` after a successful close is idempotent: it
returns the receipt already issued and the ref does not advance.

The current tracer proves only v1-unclaimed to v2-unclaimed, fetched-tree state
and Journal-boundary authentication including empty history beside v1, atomic state-plus-Journal validation,
legal direct-descendant non-force CAS, read-back, stale-tip conflict, and
retryable remote rejection in disposable repositories.
The factory snapshots compiled policy/digest, Job Order identity/revision,
actor class, exact grant, gates, evaluation time, and Owner Command. Requests
cannot supply those fields or an evaluator; their action/path and claimed
decision/digest must exactly match the bound real Gatehouse evaluation before
any lifecycle Git transport or read. A fixed local-config probe rejects
repository-local includes, URL rewrites, proxies, alternate transport helpers,
hooks, credential configuration, and protocol overrides first.
Git scratch children are created only beneath validated root-owned
`/private/tmp`, are owner-only, bind the discovery ceiling, and ignore ambient
`TMPDIR`, `TMP`, and `TEMP`.
The R6 engine additionally proves exact-tip claim, handoff, terminal, denial,
repair, parent/child, receipt/recovery, and post-commit Projection behavior.
Recovery reconstructs each stored event and lifecycle state from that event's
unique introducing commit, then applies the Knowledge validator to the full
historical chain before any remote mutation. Duplicate event identities make
the authoritative boundary invalid before idempotency lookup or push. Each
event's on-disk bytes must already equal Knowledge canonical JSON and remain
byte-identical to its unique introduction; formatting or key-order rewrites
require recovery before provenance, idempotency, or mutation.
An adopting instance binds the absolute Git executable, repository, remote,
lifecycle ref, Job Order, action/path caps, Gatehouse evidence, Knowledge
contract, and Projection sink at factory creation. No live adoption or normal
flight exists until separately issued instance work binds and runs it.
Parent reconciliation treats the first receipt for a child as immutable: only
canonical receipt equality is idempotent; any changed field or event identity
requires recovery and leaves the parent unchanged. Each lifecycle commit may
identify exactly one stored receipt; reuse across children or events requires
recovery unless the canonical receipt is exactly equal. A null, array,
malformed, duplicate-child, duplicate-commit, or key-mismatched `childReceipts` map returns
`recovery-required` without throwing or mutating parent state.
