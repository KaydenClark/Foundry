# Gauge Blueprint

> Generated from LLM Workbench v2.1.

**Last reviewed:** 2026-07-19
**Status:** active
**Source root:** `$INSTANCE_ROOT/Foundry/Halls/Gauge`

## Spec Catalog

<!-- spec-catalog:start -->
| Spec | Description | Status |
|---|---|---|
| [S-001 - Cross-Model Retrieval Transport](specs/S-001-cross-model-retrieval-transport/SPEC.md) | Provide the MCP-compatible, read-only transport that lets approved clients consume OpenBrain retrieval without receiving backend credentials. | active |
<!-- spec-catalog:end -->

## What This Hall Is

Gauge is Foundry's observe-and-notify-only Hall. It consumes Gatehouse passage
receipts and checked health evidence, feeds CIC with every passage, and sends
targeted actionable notifications to responsible Halls and later Discord. It
does not make policy, route work, or write Canon/Grounding.

S-037 assigns Gauge `activity-feed-projector`: an idempotent post-commit Pawn
that derives the permitted operational activity/notification feed from
redacted lifecycle, Journal-health, and passage projections. The interface
socket carries that private-instance feed with source commit, capture time,
freshness, and redaction profile to its active CIC binding. Gauge never receives
raw Journal payloads and does not own CIC rendering or lifecycle authority.

The existing Personal Intelligence Platform implementation remains here as a
compatibility source for integration, transport, and health reporting while
its contracts are promoted under the Gauge boundary.

## Legacy Implementation Context

Personal Intelligence Platform is the integration and verification layer joining OpenBrain's private context backend to Command Information Center's operator interface. It gives cross-project work one shared architecture, compatibility contract, health report, and proof path without merging the source repositories.

Core promise:

> Kayden can verify that context is fresh, retrieval is compatible, and CIC can consume it without exposing secrets or creating a second source of truth.

## Ownership And Flow

1. Canonical GPT_OS files and approved history remain owned by their source projects.
2. OpenBrain ingests approved sources, records freshness, and provides authenticated retrieval.
3. CIC calls OpenBrain server-side, renders derived context, and performs explicit safe project-control edits.
4. This repository verifies repository identity, contract compatibility, ingestion health, and CIC connectivity.

OpenBrain owns ingestion, retrieval, privacy, freshness, and `contracts/query-wiki.openapi.json`. CIC owns visualization, interaction, local operator tasks, and safe project-file editing. This repository owns only cross-project compatibility, health, sequencing, and proof.

## Architecture

| Layer | Choice | Source / Notes |
|---|---|---|
| Runtime | Node.js 22+ ESM | `package.json` |
| Frontend | none | CIC owns all user interface rendering |
| Backend | none | operator commands only; no platform service |
| Database/storage | ignored atomic JSON report | `.local/platform-health.json` |
| Auth | inherited child server authentication | no browser access to verifier |
| Repository discovery | committed manifest plus local path overrides | `platform.json` |
| Contract | OpenBrain-owned OpenAPI 3.1 JSON | `contracts/query-wiki.openapi.json` in OpenBrain |
| Testing | Node test runner plus child native checks | `test/`, `scripts/` |
| Deployment/runtime | private Git repository on each operator computer | no hosted runtime |
| Health transport | atomic ignored JSON report | CIC reads it server-side only |
| Remote | private GitHub repository | `KaydenClark/personal-intelligence-platform` |

Architecture constraints:

- No runtime source, secrets, database state, or retrieved content is copied
  from either child repository.
- Cross-project tests may import child server modules but production CIC never
  imports from this repository.
- Platform health is derived and replaceable; child runtime evidence remains
  authoritative.

## Main Contracts

| Contract | Owner | Consumer | Proof |
|---|---|---|---|
| Repository identity and branch map | `platform.json` | doctor and health runner | expected paths, remotes, controls |
| `POST /query-wiki` | OpenBrain OpenAPI 3.1 document | CIC server adapter | provider and compatibility tests |
| Platform health report schema v1 | this repository | CIC `server/platformHealth.js` | atomic mode-0600 report and parser tests |
| Child work state | each child `TASKBOARD.md` | CIC Projects view and agents | owning repository proof |
| `POST /pip/retrieve` (defined, not yet implemented) | `contracts/pip-retrieval-transport.openapi.json` (this repository, S-001) | approved MCP-compatible clients | fixture (`contracts/pip-retrieval-transport.fixture.json`) and `scripts/transport-contract-lib.mjs` tests; live round trip is S-001/TK-002, blocked on OpenBrain S-003/TK-003 |

## Core Logic And Invariants

- Child repositories remain siblings with independent histories and release boundaries.
- Child `TASKBOARD.md` files own child implementation state; this board tracks only cross-project milestones.
- CIC SQLite tasks do not replace repository taskboards.
- Missing live credentials are skipped, never fabricated.
- Health reports contain bounded status metadata only, never secrets or retrieved content.
- Browser code never executes platform commands or reads the report directly.

## Trust, Privacy, And Safety Boundaries

Sensitive data includes environment variables, service-role keys, bearer
tokens, retrieved chunks, local scheduler state, databases, and private source
material. The verifier accepts live credentials only from its process
environment, never prints them, never persists response bodies, and writes only
bounded metadata to an ignored owner-readable report. Deployment, credential
changes, database writes, and public visibility require explicit approval.

## Known Risks

| Risk | Impact | Mitigation / owner |
|---|---|---|
| Contract lands on staging before release | a default-branch checkout may lack the file | verifier falls back to verified `origin/integration` |
| Health report becomes stale | CIC could imply old health | mark stale after 90 minutes |
| Child path differs on another computer | doctor cannot locate source | path environment overrides |
| Live credentials are absent | live retrieval cannot be proven | mark the live probe skipped while portable checks remain valid |

## Design Decisions

| Decision | Rationale | Date / Source |
|---|---|---|
| Keep three repositories | preserves deployment, privacy, and history boundaries | 2026-07-12 owner decision |
| Use a cached report | prevents browser-triggered command execution | 2026-07-12 implementation |
| Make OpenBrain contract authoritative | prevents consumer/provider split-brain | 2026-07-12 owner-approved plan |
| PIP owns the MCP-compatible cross-model transport | keeps OpenBrain focused on private retrieval and keeps protocol clients outside privileged backend code | 2026-07-17 promoted OpenBrain grilling |
| Transport client identity is a separate PIP-issued token, translated server-side to OpenBrain's own bearer token | no client, approved or not, ever holds a backend credential; the adapter can revoke one client without touching OpenBrain | 2026-07-21 S-001/TK-001 |
| Freshness propagates as an explicit `fresh`/`stale`/`unknown` status rather than defaulting to `fresh` | OpenBrain's freshness/provenance fields do not exist yet (S-003/TK-003 blocked on S-002/S-004); the transport must never fabricate freshness it cannot prove | 2026-07-21 S-001/TK-001 |
| Adapter disable is checked before client-identity or upstream calls and fails closed with no results | disabling never touches canonical Markdown/Git or OpenBrain ingestion, and a stale/unreachable OpenBrain never silently returns fabricated matches | 2026-07-21 S-001/TK-001 |

## Health Criteria

The platform is healthy when repository identity, the query contract, the CIC consumer, and the isolated CIC API smoke pass. OpenBrain freshness may be degraded or unknown on computers without its scheduler state. Configured live probes must pass.
