# Gatehouse - Runbook

**Status: no commands exist yet.** This Hall has no source, no tests, and no
tooling. This file documents that honestly and sketches what a runbook here
is expected to eventually cover, so the first implementing agent has a shape
to fill rather than a blank page.

## Today

There is nothing to run, validate, or diagnose. Root Foundry's own
verification (`node tools/test-foundry.mjs`, `node tools/foundry.mjs doctor
--harness-only`) checks that this Hall's seven control docs exist and that its
`manifest/foundry.json` entry (`G-001`, tier `native-hall`, path `gatehouse`,
status `planned`) validates. That is the entire current proof surface.

## Expected Eventually

Once the Gatehouse has a first vertical slice (see `BLUEPRINT.md` -> Open
Questions), this section should gain:

- how to run its test suite (own `tools/` or `test/`, mirroring the Assay's
  `npm run test:audit` / `npm test` pattern or the Forge's
  `node tools/spec-workbench.mjs` pattern — not decided);
- how to exercise a gate check or Job Order issuance locally;
- how another Hall requests a gate as a ticket, and how the Gatehouse proves it
  built exactly what was requested;
- recovery/rollback for a bad gate deployment, since this Hall enforces
  containment for every other Hall.

## Git

Same as root Foundry `RUNBOOK.md` -> Git And Release: branch from
`integration`, push with an explicit refspec, never force-push, never touch
`main` directly. This Hall has no separate remote.
