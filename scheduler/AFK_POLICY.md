# Foundry AFK Policy

This policy governs unattended Foundry work after an instance owner explicitly
enables a scheduler binding. The tracked policy is portable; enrollment,
credentials, schedules, counters, receipts, and runtime state are instance data.

## May Continue

- already-authorized, lifecycle-eligible work inside an enrolled repository;
- deterministic Level-0 change detection with no model wake on unchanged input;
- safe read-only discovery, Git preflight, tests, docs, checkpoint/push, and
  independent audit required by the owning repository;
- verified work to `integration` only.

## Must Stop

- a new login, credential, privacy, secret, or account boundary;
- paid service or material spending;
- irreversible remote deletion or history rewrite;
- unclear repository/spec/writer ownership or an unresolvable conflict;
- a destructive live-instance cutover not explicitly approved;
- `integration` to `main` or another owner-only production/release gate;
- the same unexplained verification failure twice.

## Required Closeout

Every worked lane ends with project-owned proof, a clean checkout, a pushed
remote recovery SHA, and an instance-local sanitized receipt. Incomplete work
ends with a truthful pushed checkpoint and explicit next gate. A blocked lane
must not starve unrelated eligible work.
