---
type: memory
status: active
sensitivity: normal
authority: canonical
source_paths:
  - .
last_verified: 2026-08-03
---

# Foundry Schematic Room Brain

This is the durable navigation brain for the standalone public Foundry
Schematic product surface. It stores no live run history or instance data.

## Live Controls

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Scope, safety, and engineering workflow |
| [BLUEPRINT.md](BLUEPRINT.md) | Product promise, architecture, and six-floor model |
| [LEXICON.md](LEXICON.md) | Accepted and candidate terms |
| [TASKBOARD.md](TASKBOARD.md) | Current projected work |
| [RUNBOOK.md](RUNBOOK.md) | Exact install, run, test, and demo commands |
| [specs/](specs/) | Stable capability requirements and evidence |

## Durable Context

- Product source lives at `Schematic/` in the portable Foundry repository.
- The app is separate from CIC and has no executor, network, filesystem,
  subprocess, repository, dispatch, or publication adapter.
- The primary visual is one six-storey Factory: Projection mirror at the top,
  Actuality work floor at the bottom, and the same floor plan repeated on each.
- The accepted visual references live under `docs/design/`.
