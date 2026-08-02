# Audit Engine

> Generated from LLM Workbench v2.3. See `RUNBOOK.md` -> Upgrading The Harness.

Audit Engine gives GPT_OS chat agents a read-only, evidence-backed health report
for one project at a time.

## Chat-First Usage

The intended human interaction is conversational:

> Audit DigitalTome.

> Check whether Spotify is ready to archive.

Captain resolves the canonical project path and invokes Audit Engine. The
response includes overall status, named checks, evidence, archive readiness,
and a safe next action.

The Captain integration and periodic scheduler are not installed yet. The
current scaffold provides the verified report contract and executable adapter
they will call.

## Internal Agent Adapter

Agents and maintainers can invoke the same contract directly:

```bash
npm run audit -- --project "/absolute/path/to/project"
npm run audit -- --project "/absolute/path/to/project" --json
```

The first command prints the chat-friendly report. `--json` prints the stable
structured report for an adapter or future scheduler.

For a whole-Foundry release, the Assay independently reviews the immutable
artifact without importing or executing Forge publisher code:

```bash
npm run assay:foundry -- \
  --producer-repo /ABSOLUTE/GPT_OS \
  --artifact /ABSOLUTE/ARTIFACT \
  --approval /ABSOLUTE/NEW-APPROVAL.json
```

## Current Checks

- project path and Git repository identity;
- required Workbench control files;
- uncommitted working-tree state;
- branch/upstream synchronization against a live read-only remote query;
- dirty, unreadable, locked, or prunable registered worktrees;
- project-owned validation declared in `audit-engine.json`.

Remote freshness currently accepts absolute local remotes and validated GitHub
URLs. Target-configured Git helpers, external transports, and inherited global
credential helpers are disabled. A private GitHub remote that requires
authentication therefore returns `ATTENTION` until a safe authentication
adapter is implemented.

Projects with execution-capable Git clean, smudge, or process filters also
return `ATTENTION` before working-tree inspection. Audit Engine will not run a
target's filter program merely to decide whether that target is clean.

## Project Validation Contract

Projects declare their own validation at the repository root:

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

Each entry needs a safe identifier, a non-empty string argv array, and an
integer timeout from 1 through 120000 milliseconds. Audit Engine runs entries
sequentially with no shell and a minimal environment only after path,
repository, harness, Git, and worktree checks pass. Explicit shell executables
are refused. A deadline remains a timeout even if the command handles
termination and later exits zero; Audit Engine terminates the command's process
group, including the final hard kill after the direct child exits. If the
bounded cleanup cannot prove the group is gone, the check reports an
infrastructure failure. Output from a non-zero command is capped and quoted as
untrusted data before it enters evidence; chat rendering escapes Unicode and
control line separators in evidence and target-controlled project names.

The project owns the promise that these commands validate without mutating the
target. A missing or invalid manifest, missing executable, non-zero exit, or
timeout is visible in the normalized report; Audit Engine never guesses a
command from `RUNBOOK.md` or another prose file.

Inactivity evaluation, notifications, and scheduling remain explicit follow-up
tickets.

## Project Controls

- `AGENTS.md` — agent authority, scope, safety, and work loop.
- `BLUEPRINT.md` — product direction and cross-cutting architecture.
- `LEXICON.md` — accepted project vocabulary.
- `TASKBOARD.md` — generated active-work projection.
- `specs/` — stable capability truth and proof.
- `RUNBOOK.md` — setup, operation, testing, and recovery.
- `HARNESS_FEEDBACK.md` — upstream Workbench feedback.

## Getting Started

```bash
npm install
npm test
npm run check
```

Assay is a native Hall in the public Foundry product. Its earlier private
standalone recovery repository is historical and is not the producer source.
Verified feature work stops on `integration` until Kayden authorizes `main`.
