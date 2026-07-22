# Servitor Foundry

Servitor Foundry is a portable governance harness for a set of AI-assisted
Workbench rooms. Clone it into an instance, run one adoption command, and it
installs its Sockets and Modules from their own repositories without vendoring
them.

> Foundry : instance :: Workbench : project.

## Set Up My Foundry

Prerequisites: Git, Node.js 22+, and existing read access to every private
component repository in `manifest/foundry.json`.

```bash
mkdir my-foundry-instance
cd my-foundry-instance
git clone --branch integration https://github.com/KaydenClark/Foundry.git Foundry
node Foundry/tools/foundry.mjs plan --instance-root "$PWD" --instance-name "My Foundry"
node Foundry/tools/foundry.mjs adopt --instance-root "$PWD" --instance-name "My Foundry"
node Foundry/tools/foundry.mjs doctor --instance-root "$PWD"
```

The clone destinations are beneath `Foundry/Sockets/` and `Foundry/Modules/`,
but those paths are ignored by the Foundry repository. Live memory, bindings,
receipts, projects, credentials, and scheduler state live in the instance root
outside the harness checkout.

The first run writes a sanitized receipt to
`.local/foundry/adoption-receipt.json`. It never writes a credential.

## Audit The Adoption

Audit Engine is installed by the manifest. It stays network-free, so Captain or
another trusted caller fetches the Foundry upstream first and passes the exact
fetch provenance with the audit request. Follow `RUNBOOK.md` -> Audit An
Adopted Foundry for the reproducible command.

A direct diagnostic without provenance is still read-only, but deliberately
returns `attention` instead of claiming upstream health:

```bash
node "Foundry/Sockets/Audit Engine/bin/audit-engine.mjs" --project "$PWD/Foundry" --json
```

With trusted provenance, Audit Engine checks repository identity, controls, Git
state, upstream synchronization, worktree safety, and the explicit
`audit-engine.json` validations. It is read-only toward the Foundry checkout.

## What Is Tracked

- root controls and stable specs;
- the credential-free install manifest;
- Foundry adoption/doctor and Captain control-plane tools;
- roles-as-skills plus adoption/bootstrap skills;
- Captain/scheduler policy and instance configuration templates;
- ADOPTION, GENESIS, and the template Wiki;
- non-authoritative reference material and deterministic tests.

## What Is Not Tracked

- installed Sockets/Modules or registered worktrees;
- live Wiki memory, projects, bindings, `.local` state, launch services, logs,
  databases, exports, or secrets;
- private-repository credentials or `.env` values.

Read `BLUEPRINT.md` for the complete ownership/scrap split and `RUNBOOK.md` for
exact verification and recovery.
