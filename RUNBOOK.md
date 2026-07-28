# Servitor Foundry - Runbook

**Runtime:** Node.js 22+ and Git 2.40+
**Repository:** `github.com/KaydenClark/Foundry`

## Navigation

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Authority order, scope, safety, and the work loop |
| [BLUEPRINT.md](BLUEPRINT.md) | Product map and the Four Halls model |
| [LEXICON.md](LEXICON.md) | Shared Foundry definitions |
| [TASKBOARD.md](TASKBOARD.md) | Generated hot projection of active harness specs |
| [README.md](README.md) | Human-facing orientation |

## Prerequisites

- Node.js 22 or newer (zero package dependencies).
- Git 2.40 or newer.
- Non-interactive read access for the private repositories declared by the
  manifest for **installed Modules only**. Credentials stay in the operator's
  existing Git mechanism. The four native Halls need no separate access — they
  arrive with the Foundry clone itself.
- An explicit instance root with enough space for four independent Module
  clones (OpenBrain, CIC, Slack, Discord).

No `.env`, shared secret, database, or background service is required by the
harness itself.

## Install A New Instance

From an empty parent directory:

```bash
INSTANCE_ROOT="$PWD/my-foundry-instance"
mkdir -p "$INSTANCE_ROOT"
git clone --branch integration https://github.com/KaydenClark/Foundry.git "$INSTANCE_ROOT/Foundry"
node "$INSTANCE_ROOT/Foundry/tools/foundry.mjs" plan \
  --instance-root "$INSTANCE_ROOT" --instance-name "My Foundry"
node "$INSTANCE_ROOT/Foundry/tools/foundry.mjs" adopt \
  --instance-root "$INSTANCE_ROOT" --instance-name "My Foundry"
```

The clone in step one already contains a working Forge, Assay, Ward, and
Gatehouse scaffold — `plan`/`adopt` install only the four Modules the manifest
declares. `plan` performs no writes. `adopt` validates the whole manifest
before cloning, refuses unsafe/existing mismatches, seeds only missing
instance files, and records exact resolved commits (plus native-Hall presence).

For an existing deployment, read `templates/ADOPTION.md` first. Do not run a
live ownership cutover merely because the clone step succeeds.

## Validate And Diagnose

```bash
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/foundry.mjs doctor --instance-root "/absolute/instance/root"
```

Expected: manifest validation reports eight components (four native Halls,
four installed Modules); harness-only doctor passes without requiring any
Module clone, and additionally proves every native Hall's required control
docs are present (a cold clone of the Foundry alone yields a working Forge,
Assay, and Ward with zero additional clones); instance doctor validates
installed-Module origin/ref/clean state plus the active K-001 binding. K-002
and K-003 report `pending-contract`; K-004 reports `unbound` until the Forge
owns those records.

## Audit An Adopted Foundry

The Assay (native Hall `audit-engine/`, formerly Audit Engine) performs no
fetch or authentication. From the Foundry checkout, the trusted caller fetches
the configured upstream and constructs the strict six-field provenance object
from that fresh local tracking ref:

```bash
git fetch origin "$(git branch --show-current)"
FETCH_PROVENANCE_JSON="$(node --input-type=module -e '
  import { execFileSync } from "node:child_process";
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  console.log(JSON.stringify({
    schemaVersion: "1.0",
    remoteName: "origin",
    remoteUrl: git("remote", "get-url", "origin"),
    trackedRef: git("rev-parse", "--symbolic-full-name", "@{upstream}"),
    sha: git("rev-parse", "@{upstream}"),
    fetchedAt: new Date().toISOString()
  }));
')"
node "audit-engine/bin/audit-engine.mjs" \
  --project "$PWD" --fetch-provenance-json "$FETCH_PROVENANCE_JSON" --json
```

Exit `0` means every required generic and project-owned check passed. Exit `1`
means the Foundry identity is verified but attention remains. Exit `2` means the
target identity or invocation could not be verified. Read the JSON; do not
translate an attention result into health.

The caller may use its existing non-interactive Git authentication, but the
provenance contains no credential. A call without fresh matching provenance is
expected to return `attention` and skip project validation.

## Test And Build

Focused suite:

```bash
node tools/test-foundry.mjs
node tools/test-captain.mjs
```

Full verification:

```bash
node tools/test-foundry.mjs
node tools/test-captain.mjs
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/spec-workbench.mjs render
node tools/spec-workbench.mjs doctor
git diff --check
```

For a release candidate, also run a real cold adoption from an empty temporary
instance, rerun doctor there, and invoke its installed Audit Engine. Record the
temporary path only in local evidence; durable proof records remote/ref/commit,
manifest checksum, checks, and sanitized report status.

## Spec Lifecycle

```bash
node tools/spec-workbench.mjs doctor
node tools/spec-workbench.mjs next --json
node tools/spec-workbench.mjs show S-001
node tools/spec-workbench.mjs claim S-001 --agent codex
node tools/spec-workbench.mjs close S-001 \
  --proof "NAMED VERIFICATION" \
  --docs "DOCS UPDATED OR Docs checked; no update needed + reason" \
  --remaining-gap "GAP OR none"
node tools/spec-workbench.mjs render
```

## Captain And Scheduler

Adoption seeds `.foundry/workflows.json` with every workflow disabled. Validate
it and exercise the deterministic no-model gate:

```bash
node tools/captain.mjs validate --config "/absolute/instance/root/.foundry/workflows.json"
node tools/captain.mjs level-zero --signals signals.json --state captain-state.json
```

External cron/launchd/systemd/Codex schedule bindings are instance data. The
harness never creates or enables one implicitly. Read `scheduler/AFK_POLICY.md`
and `scheduler/CAPTAIN.md` before enabling a dispatcher.

## Git And Release

```bash
git status --short --branch
git fetch origin
git switch -c codex/short-description origin/integration
git diff --check
git push --set-upstream origin HEAD
```

Feature work lands on `integration` only after its exact pushed head is green.
Only the owner promotes `integration` to `main`. Never stage paths under
`Modules/` or `.worktrees/` — those are installed/ignored, not tracked. Native
Hall paths (`forge/`, `audit-engine/`, `pip/`, `gatehouse/`) are the opposite:
their content is meant to be tracked and staged normally.

## Troubleshooting

| Symptom | Cause | Safe response |
|---|---|---|
| private Module clone fails | Git access is absent or non-interactive auth is unavailable | Stop and report the exact Module; do not request or store a token in the repo. |
| destination origin/ref mismatch | another checkout already occupies the manifest path | Preserve it; inspect ownership and choose a new instance or explicit cutover plan. |
| destination is dirty | existing Module work is in flight | Checkpoint it in its owning repository or stop; adoption never cleans it. |
| K-002/K-003 pending warning | Forge registry has no machine-readable record yet | Keep the Module installed but do not claim contract validation. |
| the Assay returns attention | Git/worktree/upstream/validation evidence is incomplete | Read the named check; repair in a separate owning task and re-audit. |
| installed Module appears in Foundry status | `.gitignore` or destination drift | Stop before staging; run boundary tests and restore the declared ignored path. |
| native Hall reported missing control docs by doctor | a required control file was deleted or renamed inside `forge/`, `audit-engine/`, `pip/`, or `gatehouse/` | Restore it from Git history in this repository; a native Hall is never "re-cloned," only repaired as ordinary tracked source. |

## Recovery

Adoption is additive and does not reset existing repositories. To recover an
interrupted cold setup, rerun the same command: verified clean destinations are
reused and missing destinations are cloned. If a destination mismatches, stop
and resolve it explicitly; never delete or replace it automatically.

Rollback of a throwaway cold instance is deletion of that explicitly named
scratch directory. Rollback of a live deployment is owner-gated and must name
the source repositories, recovery refs, worktrees, instance data, and service
bindings before any mutation.
