# Audit Engine - Harness Feedback

> Generated from LLM Workbench v2.3.

This append-only log returns concrete problems with the Workbench controls to
the canonical Workbench project. Product bugs and Audit Engine tasks belong in
the owning spec, not here.

| Date | Doc / section | What happened | Impact | Proposed change | Status |
|---|---|---|---|---|---|
| 2026-07-15 | `tools/spec-workbench.mjs` -> `today()` | A ticket closed after midnight UTC but before midnight in the configured America/Denver workspace, so the generated evidence row used the next calendar date. | low - proof needed a manual local-date correction before commit | Accept an explicit workspace timezone or consistently pass the verified local date through lifecycle commands. | new |
