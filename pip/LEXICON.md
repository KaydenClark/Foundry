# Personal Intelligence Platform (the Ward) - Lexicon

**Last reviewed:** 2026-07-28
**Status:** active

This Hall is the last of the four native Halls to receive a `LEXICON.md`
(`WORKBENCH_FEEDBACK.md`, 2026-07-28, records why it was missing: the S-024
fold assumed all three folded Halls shared the same seven-file control-doc
set, and this one did not). This is an honest first pass, not a backfill of
invented terminology: it captures the vocabulary this Hall's own `AGENTS.md`,
`BLUEPRINT.md`, `README.md`, and `RUNBOOK.md` already use in practice. Where a
term is only a thin index into vocabulary owned elsewhere (root `LEXICON.md`
or GPT_OS root `LEXICON.md`), it is marked as such rather than redefined here.

## Ownership Rules

- Add a term after its meaning is settled, not while still under discussion.
- Definitions live here; requirements and decisions stay in `BLUEPRINT.md` or
  the owning `SPEC.md`.
- Prefer a pointer to the owning artifact over copying its detail into this
  file.
- Surface a conflict before changing an established definition.

## Naming Note

Root `BLUEPRINT.md` and root `LEXICON.md` (following GPT_OS `S-024`) call this
Hall **the Ward**. This Hall's own control docs (`AGENTS.md`, `BLUEPRINT.md`,
`README.md`, `RUNBOOK.md`, `TASKBOARD.md`) still call it by its pre-fold name,
**Personal Intelligence Platform** (PIP), and use that name throughout their
own prose, commands (`npm run health`, `contracts/pip-*`), and file paths
(`pip/`). Both names refer to the same Hall; this file uses "the Ward" and
"PIP" interchangeably and does not treat renaming this Hall's internal docs as
in scope here.

## Workbench Terms

| Term | Definition | Distinction |
|---|---|---|
| **Blueprint** | The compact artifact for this Hall's product direction, architecture, contracts, and non-goals. | Not a work queue, glossary, or proof archive. |
| **Spec** | A stable capability record with requirements, decisions, slices, acceptance, and evidence. | `specs/S-001-cross-model-retrieval-transport/SPEC.md` is this Hall's only one today. |
| **Ticket** | A one-context tracer-bullet implementation slice inside a spec. | Execution structure, not durable capability history. |
| **Doctor** | This Hall's `npm run doctor` command: a portable, credential-free structural check. | Distinct from Foundry's own root `foundry.mjs doctor`, which checks the whole harness rather than this one Hall. |

## Hall Composition Terms (pointer only — owned at root)

| Term | Owned at | Ward relevance |
|---|---|---|
| **Hall** | root `LEXICON.md` -> GPT_OS root `LEXICON.md` | The Ward is one of the Foundry's four Halls; the full tier definition lives there, not here. |
| **native Hall** | root `LEXICON.md` | The Ward folded in under GPT_OS S-024, tracked at `pip/`, no `remote`/`ref`/`destination` of its own. |
| **child repository** | this file, below | The Ward's own term for the two sibling repositories it coordinates without owning — see Project Terms. |

## Project Terms

| Term | Definition | Distinction |
|---|---|---|
| **Personal Intelligence Platform (PIP)** | This Hall's own name for itself: the integration and verification layer joining OpenBrain's private context backend to Command Information Center's operator interface. | Coordinates two child repositories; owns neither implementation. Root Foundry docs call this same Hall "the Ward." |
| **Child repository** | OpenBrain or Command Information Center — a sibling repository this Hall verifies compatibility against and reports on, but does not implement, test, or release. | Contrast with this Hall's own repository, which owns only cross-project compatibility, health, sequencing, and proof. |
| **Platform health report** | The atomic, mode-0600, ignored JSON file (`.local/platform-health.json`) this Hall writes via `npm run health`, containing bounded status metadata only. | Never contains secrets or retrieved content; CIC reads it server-side, never the browser. |
| **Fresh / stale / unknown** | The three states this Hall's freshness field may report for a child's data, chosen explicitly rather than defaulting to `fresh`. | `unknown` is not a failure to render as `stale`; a report must never fabricate freshness it cannot prove. A health report older than 90 minutes is treated as stale. |
| **Live probe** | An optional, credential-gated live round trip (`npm run health:live`, needs `QUERY_WIKI_URL`/`QUERY_WIKI_ACCESS_TOKEN`/`CIC_BASE_URL`) against a real child endpoint rather than a fixture. | Distinct from the portable `npm run health`, which needs no credentials and never claims live proof it did not run. A skipped live probe is recorded as skipped, never as passed. |
| **Cross-model retrieval transport** | The MCP-compatible, read-only transport this Hall is defining (`contracts/pip-retrieval-transport.openapi.json`, S-001) so approved clients can consume OpenBrain retrieval without ever holding an OpenBrain backend credential. | Not yet implemented as a live round trip (S-001/TK-002), blocked on OpenBrain's own provenance/freshness contract. |
| **Adapter** | The server-side component (planned, S-001) that translates a PIP-issued client identity token into OpenBrain's own bearer token for one authenticated call. | No client, approved or not, ever holds OpenBrain's own credential directly — the adapter is the only thing that does. |
| **Isolated CIC API smoke** | The credential-free consumer check this Hall runs against CIC when no live `CIC_BASE_URL` is supplied. | Distinct from a live CIC probe; both are part of "healthy" but exercise different paths. |
| **Healthy (this Hall)** | Repository identity, the query contract, the CIC consumer check, and the isolated CIC API smoke all pass; OpenBrain freshness may be degraded or unknown without local scheduler state. | Configured live probes must additionally pass before this Hall calls itself fully healthy end to end. |

## What This File Does Not Yet Cover

This Hall has no working Job-Order, containment, or Pawn vocabulary (that
belongs to the Gatehouse) and no socket-contract vocabulary of its own beyond
what it consumes as a client (owned by the Forge). If this Hall's own
`specs/` grows beyond S-001, or its cross-model transport (S-001/TK-002) ships
a live round trip, the terms it introduces there belong in this file next,
following the same pattern used above: define what this Hall actually
introduces, point to what it only consumes.
