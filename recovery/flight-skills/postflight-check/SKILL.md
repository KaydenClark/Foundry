---
name: postflight-check
description: Reconcile outward from verified post-Land Actuality before calling a Job Order landed or closed. Use after every Land outcome, especially when Integration may lack its required PR or merge.
---

# PostFlight-check

Prove that every other layer now represents verified Actuality. This is
Preflight's outward counterpart: Preflight checks the world before work;
PostFlight-check checks the records after work.

## 1. Pin Actuality

Fetch fresh evidence and record the exact Job Order/revision, candidate SHA,
authorized Integration destination, current Integration SHA, recovery ref, and
Land outcome. Do not infer a PR, merge, clean tree, or remote recovery point.

If Actuality or recovery is ambiguous, stop with `recovery-required` and name
the missing evidence.

## 2. Reconcile outward

Check that the exact post-Land state is represented by:

- Canon;
- Grounding and verification receipts;
- Enduring Context and active Intent;
- claims, handoffs, and activation state;
- Projection and its freshness marker; and
- remote recovery and the authorized Integration destination.

A passing test or a `done` label is evidence, not closure. Never imply
`integration` reached `main`.

## 3. Repair missing Integration delivery

If the required Integration PR or merge is absent:

1. invoke `/handoff` with one spin-off topic containing the exact candidate,
   target, evidence, recovery point, allowed repair, and verification commands;
2. open a fresh chat for that handoff and invoke `/land` at repair intensity;
3. wait for the repair result; and
4. fetch fresh refs and rerun this check yourself.

The fresh chat repairs; this chat remains the verifier. Its report is evidence,
not proof that the repair landed. If a fresh chat cannot be opened, the repair
blocks, or the recheck fails, do not say the plane landed.

## 4. Report the truthful disposition

- `closed-complete` only when every required layer, recovery boundary, and the
  named deterministic close authority agree.
- `delivered-unclosed` when the payload is on Integration but another required
  layer or close authority does not agree.
- `recovery-required` when Actuality, Integration, or recovery remains
  ambiguous or mismatched.

For any non-complete result, record the failed layer, observed evidence,
preserved recovery point, and exact next repair. Never round a blocked cleanup
up to landed or closed.
