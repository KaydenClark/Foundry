# Servitor Foundry

Servitor Foundry is a portable governance harness for a set of AI-assisted
Workbench rooms. It has four native Halls — the Forge, the Assay, the Ward,
and the Gatehouse — tracked as source in this very repository, and it installs
optional Modules (OpenBrain, CIC, Slack, Discord) from their own repositories
without vendoring them.

> Foundry : instance :: Workbench : project.

## Navigation

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Authority order, scope, safety, and the work loop |
| [BLUEPRINT.md](BLUEPRINT.md) | Product map and the Four Halls model |
| [LEXICON.md](LEXICON.md) | Shared Foundry definitions |
| [TASKBOARD.md](TASKBOARD.md) | Generated hot projection of active harness specs |
| [RUNBOOK.md](RUNBOOK.md) | Exact commands |
| [forge/](forge/), [audit-engine/](audit-engine/), [pip/](pip/), [gatehouse/](gatehouse/) | Each native Hall's own docs |

## Set Up My Foundry

Prerequisites: Git, Node.js 22+, and existing read access to every private
Module repository in `manifest/foundry.json`. The four native Halls need no
separate access.

```bash
mkdir my-foundry-instance
cd my-foundry-instance
git clone --branch integration https://github.com/KaydenClark/Foundry.git Foundry
node Foundry/tools/foundry.mjs plan --instance-root "$PWD" --instance-name "My Foundry"
node Foundry/tools/foundry.mjs adopt --instance-root "$PWD" --instance-name "My Foundry"
node Foundry/tools/foundry.mjs doctor --instance-root "$PWD"
```

The `git clone` in step one already gives you a working Forge (`forge/`),
Assay (`audit-engine/`), Ward (`pip/`), and Gatehouse scaffold (`gatehouse/`)
— nothing more to fetch for those four. `plan`/`adopt` install only the
Modules the manifest declares, beneath `Foundry/Modules/`, which is ignored by
the Foundry repository. Live memory, bindings, receipts, projects,
credentials, and scheduler state live in the instance root outside the
harness checkout.

The first run writes a sanitized receipt to
`.local/foundry/adoption-receipt.json`. It never writes a credential.

## Audit The Adoption

The Assay (native Hall `audit-engine/`, formerly Audit Engine) stays
network-free, so Captain or another trusted caller fetches the Foundry
upstream first and passes the exact fetch provenance with the audit request.
Follow `RUNBOOK.md` -> Audit An Adopted Foundry for the reproducible command.

A direct diagnostic without provenance is still read-only, but deliberately
returns `attention` instead of claiming upstream health:

```bash
node "Foundry/audit-engine/bin/audit-engine.mjs" --project "$PWD/Foundry" --json
```

With trusted provenance, the Assay checks repository identity, controls, Git
state, upstream synchronization, worktree safety, and the explicit
`audit-engine.json` validations. It is read-only toward the Foundry checkout.

## What Is Tracked

- root controls and stable specs;
- the four native Halls (`forge/`, `audit-engine/`, `pip/`, `gatehouse/`),
  each a self-contained mini-Workbench with its own controls, tests, and (for
  the three folded Halls) specs;
- the credential-free install manifest;
- Foundry adoption/doctor and Captain control-plane tools;
- roles-as-skills plus adoption/bootstrap skills;
- Captain/scheduler policy and instance configuration templates;
- ADOPTION, GENESIS, and the template Wiki;
- non-authoritative reference material and deterministic tests.

## What Is Not Tracked

- installed Modules or registered worktrees;
- live Wiki memory, projects, bindings, `.local` state, launch services, logs,
  databases, exports, or secrets;
- private-repository credentials or `.env` values.

Read `BLUEPRINT.md` for the complete ownership split and `RUNBOOK.md` for
exact verification and recovery.
