# Audit Engine - Runbook

> Generated from LLM Workbench v2.3.

**Last reviewed:** 2026-07-16
**Runtime owner:** GPT_OS Captain; Kayden owns lifecycle decisions
**Environment:** local GPT_OS clients on Mac Mini or another verified machine

## Prerequisites

- Node.js 22 or newer.
- Git 2.40 or newer.
- Read access to the explicitly named target project.
- Existing non-interactive Git access when the target has a private upstream.

No accounts, services, credentials, environment variables, databases, or
background processes are required for the first capability.

Canonical source:

```text
$INSTANCE_ROOT/Foundry/Halls/Assay
```

## Install

```bash
npm install
```

Expected result: npm validates the dependency-free package and writes or checks
the lockfile without installing runtime packages.

## Run An Audit

Human workflow: ask Captain in a GPT_OS-compatible chat to audit a named project.
Captain resolves its canonical path and invokes the adapter below.

Internal agent invocation:

```bash
npm run audit -- --project "/absolute/path/to/project"
npm run audit -- --project "/absolute/path/to/project" --json
```

Exit codes:

- `0`: every required generic and project-owned validation check passed;
- `1`: project identity is verified but a check failed or required validation
  has not run;
- `2`: project identity could not be verified or invocation was invalid.

The command is read-only toward the target. It may run `git ls-remote` to verify
freshness, but does not fetch, pull, commit, push, merge, clean, prune, or
repair the project. After generic checks pass, it executes the target's explicit
`audit-engine.json` validation contract.

Project validation manifest:

```json
{
  "schemaVersion": "1.0",
  "validation": [
    {
      "id": "tests",
      "argv": ["npm", "test"],
      "timeoutMs": 120000
    }
  ]
}
```

Commands run sequentially from the project root without a shell, receive only a
minimal process environment, and must finish within their declared 1-120000 ms
timeout. Projects must declare non-mutating validation. Missing, invalid,
unavailable, failed, and timed-out commands degrade explicitly; commands are
never inferred from prose. Deadlines fail closed, terminate the validation
process group, and remain timeouts even when a command handles termination and
later exits zero. The final group hard kill still runs when the direct child
exits first. If bounded cleanup cannot prove the process group exited, the
validation reports an infrastructure failure instead of claiming termination.
Multiline command diagnostics are capped and JSON-quoted, and chat rendering
escapes control and Unicode line separators before presenting untrusted evidence
or target-controlled project names.

Security boundary: local absolute remotes and GitHub URLs are allowed. Audit
Engine disables target-configured execution helpers, external transports,
system/global Git config, and credential helpers. Private GitHub remotes that
need authentication degrade to `ATTENTION` until a safe adapter is added.
Execution-capable repository-local and per-worktree content filters are refused
before working-tree status, and the Git subprocess environment does not inherit
`GIT_*`, askpass, SSH, or credential variables from the calling chat client.

## Test And Verify

### Review A Whole-Foundry Artifact

The Assay independently recomputes the artifact manifest, exact immutable
producer bytes and modes, confidentiality boundary, and tree digest. It does
not import or execute the Forge publisher. The approval path must be new and
outside both repositories and the artifact:

```bash
npm run assay:foundry -- \
  --producer-repo /ABSOLUTE/GPT_OS \
  --artifact /ABSOLUTE/FOUNDRY_ARTIFACT \
  --approval /ABSOLUTE/ASSAY-APPROVAL.json
```

The deterministic approval binds the producer SHA and tree digest and names
the three independent checks. A mismatch, extra/private path, symlink,
host-specific path, or credential-shaped value fails without writing approval.

Targeted behavior suite:

```bash
npm run test:audit
```

Full verification:

```bash
npm test
npm run check
node tools/spec-workbench.mjs render
node tools/spec-workbench.mjs doctor
git diff --check
```

Expected result: all behavior tests pass, render is idempotent, doctor reports a
healthy lifecycle, and Git finds no whitespace errors.

## Spec Lifecycle

```bash
node tools/spec-workbench.mjs doctor
node tools/spec-workbench.mjs next --json
node tools/spec-workbench.mjs show S-001
node tools/spec-workbench.mjs claim S-001 TK-002 --owner codex
node tools/spec-workbench.mjs close S-001 TK-002 --event "Implemented and verified."
node tools/spec-workbench.mjs render
```

Run `doctor`, `next`, and `show` again after compaction or a long interruption.

## Version-Control Procedures

```bash
git status -sb
git switch -c codex/SPEC-TICKET-short-description origin/integration
git diff --check
git diff --stat
```

The private remote is `https://github.com/KaydenClark/Audit-Engine`. Publish
task branches and target pull requests to `integration`. Agents may merge green
work there; only Kayden authorizes `integration` to `main`.

## Upgrading The Harness

The control documents are stamped with their Workbench version. To upgrade:

1. Compare the canonical `$INSTANCE_ROOT/Foundry/Halls/Forge` templates
   against this project's filled controls.
2. Port changed rules without overwriting project-specific scope or evidence.
3. Update version stamps.
4. Run the full verification suite and record proof in a dedicated spec.

## Troubleshooting

| Symptom | Likely cause | Check | Safe response |
|---|---|---|---|
| `UNVERIFIED` status | Missing path or repository identity | Read the `path` and `git-repository` checks | Correct the canonical path; do not infer identity |
| `ATTENTION` with upstream failure | No upstream, remote cannot be queried, remote advanced, or branch is ahead/behind | Read `upstream-sync.evidence` | Route authentication or synchronization separately; Audit Engine stays read-only |
| Unsafe remote evidence | Target configured an external helper, unsupported host, or unsafe name/ref | Inspect the target's remote configuration without running it | Correct the target in a separately authorized project task |
| Filter configuration refused | Repository-local or per-worktree Git config defines a clean, smudge, or process filter | Inspect filter names without executing them | Add a separately reviewed safe-filter policy; do not bypass the audit guard |
| `ATTENTION` with working-tree failure | Modified or untracked work exists | Read `working-tree.evidence` | Scout the work before any cleanup or commit |
| Validation not run | Generic checks failed or `audit-engine.json` is missing | Read `project-validation.evidence` | Resolve the named generic check or add the project-owned manifest; do not guess commands |
| Validation contract invalid | Schema, identifier, argv, shell, or timeout is unsafe | Validate `audit-engine.json` against the documented schema | Correct the declaration in the owning project |
| Validation command failed | Executable is unavailable or returns non-zero | Read bounded `project-validation.evidence` | Repair the owning project or its declaration in a separate task |
| Audit times out | Git command or filesystem is unavailable | Rerun the named check once | Report the boundary failure; do not claim health |

## Recovery And Rollback

Audit Engine does not persist target-project changes. If its own change fails,
revert only the smallest Audit Engine file change, rerun the failing test, update
the owning spec, and rerender. Never repair or reset the audited project as part
of recovery.

## Operational Proof

Behavior changes append evidence to the owning stable spec. Routine read-only
runs can remain in the chat response unless a master objective requires durable
cross-project proof.
