# Servitor Foundry - Hot Taskboard

**Current focus:** S-001/TK-002 builds and proves the portable harness; stop before live-instance cutover.
**Owner:** Kayden owns cutover and `integration` to `main`; agents execute authorized slices.

This file projects active work only. Durable requirements, decisions, and proof
live in stable specs.

## Active Specs

<!-- hot-specs:start -->
| Spec | Current slice | Owner | Blocker | Latest meaningful event | Next gate |
|---|---|---|---|---|---|
| [S-001](specs/S-001-portable-foundry-harness/SPEC.md) | TK-002: Implement the control surface, manifest, roles-as-skills, Wiki/adoption templates, setup/doctor tools, and prove a cold scratch adoption plus Audit Engine. (in-progress) | codex | TK-001 | TK-001 recorded the verified ownership split and adoption design; no GPT_OS source moved or changed. | Drive TK-002 red/green and prove a cold scratch adoption, boundary gate, portability gate, doctor, and Audit Engine report. |
<!-- hot-specs:end -->

## Owner Decisions

- Live GPT_OS cutover remains blocked until Kayden approves the proven harness.
- `integration` to `main` remains owner-only.
