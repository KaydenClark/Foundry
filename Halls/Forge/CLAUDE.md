# Forge - Claude Instructions

@AGENTS.md

Use this file only for Claude-specific workflow notes that cannot live in the
shared `AGENTS.md`. Keep shared project rules in `AGENTS.md` so Codex, Claude,
and other agents follow the same source of truth.

## Claude-Specific Notes

- This Hall dogfoods its Workbench payload: Hall controls are real and
  `templates/` is blank product material. Never fill `templates/` with
  producer-instance specifics.
- Forge changes belong on the assigned GPT_OS task branch. Follow the GPT_OS
  root Git rules: audited work may reach `integration`; only the owner promotes
  `integration` to `main`.
