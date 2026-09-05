# Gatehouse Runbook

## Current Verification

S-001 owns the Clearance policy primitive. An adopting instance must supply its
own accepted private authorization before binding or execution. Verification is
behavioral and structural:

```bash
node --test test/clearance-policy.test.mjs
node ../../tools/test-foundry.mjs
```

There is no Gatehouse service to install, run, deploy, or recover yet.

The integrated disposable lifecycle tracer's adopting-instance factory binds
the real evaluator, compiled policy/digest, synthetic Job Order identity and
revision, actor class, exact grant, gates, evaluation time, and Owner Command.
Transition requests cannot replace that trust root. Their claimed
decision/digest must match the evaluation, and
compiled policy content must reproduce its digest; denial produces no candidate
for the denied target. The R6 adopting-instance engine may persist one trusted,
non-recursive denial event and then run the post-commit `passage-projector`;
failure returns `deny-unrecorded` and never retries or admits the target.
Neither action makes Gatehouse the requester, Journal writer, policy grant, or
lifecycle mutator.

## Safety

- Do not copy implementation or Canon from a product checkout.
- Do not add credentials or deployment configuration.
- Use approved Gatehouse S-001 plus an adopting instance's accepted private
  grant before executable work.
