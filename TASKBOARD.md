# Servitor Foundry - Hot Taskboard

**Current focus:** S-001/TK-002 builds and proves the portable harness; stop before live-instance cutover.
**Owner:** Kayden owns cutover and `integration` to `main`; agents execute authorized slices.

This file projects active work only. Durable requirements, decisions, and proof
live in stable specs.

## Active Specs

<!-- hot-specs:start -->
| Spec | Current slice | Owner | Blocker | Latest meaningful event | Next gate |
|---|---|---|---|---|---|
| [S-001](specs/S-001-portable-foundry-harness/SPEC.md) | TK-003: Cut an existing deployment such as GPT_OS over to this harness. (blocked) | codex | TK-002, owner approval | Reviewed commit `20a63341018d681771ad3088dd3c6a2c5a81b92a` landed on `integration` and passed a fresh from-zero integration adoption/audit. | Present the proven harness for owner approval; do not begin the GPT_OS S-018/TK-003 cutover. |
<!-- hot-specs:end -->

## Owner Decisions

- Live GPT_OS cutover remains blocked until Kayden approves the proven harness.
- `integration` to `main` remains owner-only.
