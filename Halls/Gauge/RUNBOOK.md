# Gauge Runbook

> Generated from LLM Workbench v2.1.

## Prerequisites And Layout

- Node.js 22+, npm, Git, and GitHub CLI.
- Gauge is at `Foundry/Halls/Gauge/`; OpenBrain and Command Information
  Center are installed under `Foundry/Modules/`.
- Override local locations with `OPENBRAIN_REPO_PATH` and `CIC_REPO_PATH` when necessary.

Registered GPT_OS worktrees do not copy the ignored installed Modules. When
verifying Gauge from one, point those two overrides at the canonical
instance's installed products.

## Environment Configuration

The portable checks need no credentials. Optional live variables are
`QUERY_WIKI_URL`, `QUERY_WIKI_ACCESS_TOKEN`, and `CIC_BASE_URL`. Supply them to
the current process; do not create or commit a platform `.env`.

## Install

```bash
npm ci
```

The project currently has no third-party runtime packages; the lockfile keeps
the Node package boundary reproducible.

## Run Locally

This repository is a verifier rather than a service. Run `npm run health`, then
start CIC from its own repository to view the cached result.

## Test And Build

```bash
npm run doctor
npm test
npm run health
```

Full verification runs the same three commands in order, then `git diff
--check` and the Workbench evaluator. There is no build artifact because the
project has no frontend or service bundle.

`health` writes `.local/platform-health.json` atomically with mode `0600`. CIC reads that file server-side. Missing OpenBrain scheduler state degrades the report without failing portable verification.

Expected portable result: doctor and tests pass, repository/contract/CIC checks
are healthy, and OpenBrain is healthy when local scheduler evidence is current
or degraded when this computer has no scheduler state.

S-037/TK-012 must add portable synthetic fixtures for the interface-socket feed
before operational activity projection is called implemented. Public fixtures
must reject host paths, private remotes/repositories/projects, internal refs,
Journal/lifecycle/actor/worktree/machine identifiers, private payloads, and
identity-leaking derived digests. CIC remains render/read-only at this seam.

For approved live verification, supply existing environment variables to the process; do not copy secrets into this repository:

```bash
npm run health:live
```

`QUERY_WIKI_URL` plus `QUERY_WIKI_ACCESS_TOKEN` enable authenticated retrieval. `CIC_BASE_URL` enables a live CIC probe; otherwise an isolated credential-free CIC API smoke runs.

## Troubleshooting And Recovery

| Symptom | Cause | Recovery |
|---|---|---|
| child repository missing | checkout is absent or stored elsewhere | restore it at its recorded GPT_OS location or set the path override |
| contract missing locally | OpenBrain checkout is on release before staging promotion | fetch `origin/integration`; verifier reads the staged contract |
| health report stale | last run is older than 90 minutes | rerun `npm run health` |
| live probe skipped | variables were not supplied | supply them to `npm run health:live` when live proof is required |
| CIC report error | cached JSON is malformed | remove only the ignored report and regenerate it |

- Missing child checkout: restore its recorded GPT_OS checkout or set its path override.
- Contract failure: fix the OpenBrain provider or CIC consumer; do not weaken the compatibility check.
- Stale CIC card: rerun `npm run health`; reports older than 90 minutes are intentionally stale.
- Malformed report: remove only the ignored report and regenerate it. Never reset a child database or credential file.

If a child test fails, repair it in that child repository under its instructions
and record proof there. Do not weaken the platform compatibility check or copy
child implementation into this repository.

## Documentation And Proof

Architecture/contracts update `BLUEPRINT.md`; live integration work and results
update `TASKBOARD.md`; commands and recovery update this file; setup/navigation
update `README.md`. Append proof and retain the child commit SHAs or PR links.

## Version Control

- `main` is release; `integration` is staging.
- Normal task branches target `integration`.
- This repository must remain private.
- OpenBrain and CIC changes follow their own branch and review rules.
