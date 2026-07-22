# Foundry Genesis - Blank Instance Protocol

Use this one-time protocol to create a new Foundry instance from an empty
directory. Genesis establishes a working composition; it does not configure
credentials, production services, or finish an owner's project portfolio.

Use `ADOPTION.md` when the target already contains live controls, memory,
projects, components, schedules, or runtime state.

## Inputs

- founding request, quoted verbatim;
- absolute target instance root chosen by the owner or caller;
- instance name;
- Foundry harness ref to install (normally `integration` until released);
- hard privacy, host, budget, and provider constraints;
- confirmation that the operator already has read access to private component
  repositories.

The target path is input data, never source code. Do not record a username,
home directory, token, or machine-specific service path in the harness.

## Phase 0 - Frame

Confirm the target directory is new or empty enough that no live deployment can
be overwritten. Record assumptions and one blocking architecture question only
when needed. Do not ask for credentials to paste into the repository.

Output: a short frame and explicit target. Nothing cloned yet.

## Phase 1 - Clone And Plan

```bash
INSTANCE_ROOT="<absolute-target>"
mkdir -p "$INSTANCE_ROOT"
git clone --branch integration https://github.com/KaydenClark/Foundry.git \
  "$INSTANCE_ROOT/Foundry"
node "$INSTANCE_ROOT/Foundry/tools/foundry.mjs" plan \
  --instance-root "$INSTANCE_ROOT" --instance-name "<instance-name>"
```

Review all seven remote/ref/destination rows. A plan is not proof of access or
installation and performs no writes beyond the explicit harness clone.

Output: a reviewable harness checkout and deterministic plan.

## Phase 2 - Adopt The Composition

```bash
node "$INSTANCE_ROOT/Foundry/tools/foundry.mjs" adopt \
  --instance-root "$INSTANCE_ROOT" --instance-name "<instance-name>"
```

The command validates first, clones the manifest, seeds the Wiki and
instance-owned bindings/workflows, and writes a sanitized receipt. If a private
clone fails, stop with the named component; do not switch to a token-bearing URL
or add a secret file to the harness.

Output: independent Sockets/Modules plus instance data outside Foundry Git.

## Phase 3 - Verify The Brain And Bindings

Confirm:

- `Wiki/MEMORY.md` routes to `Machine/Foundry Instance` and `SCHEMA`;
- `.foundry/bindings.json` uses only relative paths;
- K-001 is active through `recall.query`;
- K-002/K-003 remain visibly pending until the Forge ships their contract
  records; K-004 is planned/unbound;
- `.foundry/workflows.json` is disabled by default;
- no credential, host-specific absolute path, or runtime state entered the
  Foundry checkout.

Output: a new instance with a brain and truthful socket state.

## Phase 4 - Test, Doctor, And Audit

```bash
node "$INSTANCE_ROOT/Foundry/tools/test-foundry.mjs"
node "$INSTANCE_ROOT/Foundry/tools/test-captain.mjs"
node "$INSTANCE_ROOT/Foundry/tools/foundry.mjs" doctor \
  --instance-root "$INSTANCE_ROOT"
```

From the Foundry checkout, follow `RUNBOOK.md` -> Audit An Adopted Foundry so
the trusted caller fetches first and supplies strict provenance. A direct audit
without it truthfully returns `attention` rather than upstream health.

Inspect the JSON result. A private-upstream limitation or pending contract is
attention, not success. Capture a <1-minute demo: the adoption receipt plus a
doctor/audit summary.

Output: repeatable green checks or an explicit, bounded blocker.

## Phase 5 - Handoff

Record Foundry and component remote/ref/commit provenance, manifest checksum,
checks run, warnings, and recovery commands. Leave external scheduler/service
bindings disabled until the instance owner approves them. Stop at
`integration`; only the owner promotes to `main`.

## Finished Genesis Criteria

- [ ] Harness checkout and every component resolve to recorded commits.
- [ ] Foundry Git is clean and installed repos/worktrees are ignored.
- [ ] Template Wiki, bindings, disabled workflows, and receipt exist outside the
      harness repo with no unfilled placeholders.
- [ ] Tests, doctor, and Audit Engine were actually run.
- [ ] No secret, host path, project data, or runtime state is committed.
- [ ] The instance can be reproduced from the recorded remote/ref/checksum data.

If any box is unchecked, Genesis remains in progress.
