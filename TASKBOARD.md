# Servitor Foundry - Hot Taskboard

**Current focus:** S-001/TK-003 cuts an existing deployment such as GPT_OS
over to this harness; stop before live-instance cutover. Native-Hall fold
(the Forge, the Assay, the Ward folded in; the Gatehouse scaffolded) landed on
`claude/vendor-forge` and `claude/foundry-canon-refresh`, not yet merged to
`integration`.
**Owner:** Kayden owns cutover, `integration` to `main`, and the Gatehouse's
first vertical slice; agents execute authorized slices.

This file projects active work only. Durable requirements, decisions, and
proof live in stable specs.

## Navigation

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Authority order, scope, safety, and the work loop |
| [BLUEPRINT.md](BLUEPRINT.md) | Product map and the Four Halls model |
| [LEXICON.md](LEXICON.md) | Shared Foundry definitions |
| [RUNBOOK.md](RUNBOOK.md) | Exact commands |
| [specs/](specs/) | Durable capability requirements, decisions, proof |

## Active Specs

<!-- hot-specs:start -->
| Spec | Current slice | Owner | Blocker | Latest meaningful event | Next gate |
|---|---|---|---|---|---|
| [S-001](specs/S-001-portable-foundry-harness/SPEC.md) | TK-003: Cut an existing deployment such as GPT_OS over to this harness. (blocked) | codex | TK-002, owner approval | Superseded in part 2026-07-28: GPT_OS S-024 folded the Forge, the Assay, and the Ward into this repository as native Halls, and this repository scaffolded a fourth (the Gatehouse). This spec's original all-components-installed contract now governs Module-only adoption (OpenBrain, CIC, Slack, Discord); see Supersession. Prior event: reviewed commit `20a63341018d681771ad3088dd3c6a2c5a81b92a` landed on `integration` and passed a fresh from-zero integration adoption/audit under the pre-fold contract. | Present the proven Module-only harness for owner approval; do not begin the GPT_OS S-018/TK-003 cutover. Separately, decide whether the native-Hall fold needs its own superseding spec in this repository (see `WORKBENCH_FEEDBACK.md`). |
| [S-002](specs/S-002-native-hall-installed-module-model/SPEC.md) | TK-002: Land `claude/foundry-canon-refresh` on this repository's own `integration`, satisfying the Branch-Landing Acceptance Criteria below. Tracks GPT_OS `S-024-native-socket-foundry`/TK-005, scoped to this repository's own staging branch rather than GPT_OS's. (ready) | claude | TK-001 | Authored this spec on `claude/foundry-canon-refresh`, closing the WORKBENCH_FEEDBACK.md gap that flagged S-001's supersession note as the only record of the native-Hall shape. `pip/LEXICON.md` was authored in the same pass (TK-001 proof). | TK-002 — land `claude/foundry-canon-refresh` on this repository's own `integration` (tracks GPT_OS `S-024-native-socket-foundry`/TK-005, scoped to this repository). |
<!-- hot-specs:end -->

## Owner Decisions

- Live GPT_OS cutover remains blocked until Kayden approves the proven harness.
- `integration` to `main` remains owner-only.
- The Gatehouse (`gatehouse/`) is a scaffold with no implementation. Its first
  vertical slice is undecided — see `gatehouse/BLUEPRINT.md` Open Questions.
- `KaydenClark/LLM_Workbench` is treated as a read-only historical archive by
  default (root `BLUEPRINT.md` Design Decisions, TK-004); Kayden can override.
- No formal spec has been opened in this repository recording the native-Hall
  fold itself (S-001 carries only a Supersession note). Consider opening one
  before further TK-003/TK-004-adjacent work accumulates undocumented.
