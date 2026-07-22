# Portable Captain Control Plane

Captain is the conversational coordinator. It consumes instance-owned
enrollment and derived readiness, verifies the selected repository immediately
before dispatch, protects one writer per repository/spec/shared-file lane, and
applies `AFK_POLICY.md`.

## Activation

1. **L0 sleeping:** deterministic signal digest; no model when unchanged.
2. **L1 dispatcher:** one low-cost coordinator routes changed, actionable state.
3. **L2 worker/auditor:** implements and independently reviews one bounded slice.
4. **L3 executive:** escalates novel architecture or conflict only.

The harness publishes deterministic L0 logic. The instance owns which models or
providers fill higher levels.

## Dispatch Contract

- A role skill changes the current task's stance; it does not spawn a task.
- Captain dispatch is the explicit act that creates a separate role task.
- Every writer uses the owning repository's lifecycle and stops at its staging
  branch.
- Ready queues are derived projections with source SHA and freshness, never a
  canonical task store.
- Audit failures route a separate repair task; Audit Engine never repairs its
  target.

## Runtime Boundary

`.foundry/workflows.json`, `.local/foundry/captain-state.json`, generated ready
queues, handoffs, and receipts belong to the instance. External cron, launchd,
systemd, Task Scheduler, or app automation definitions are bindings and are not
tracked in the harness.
