# Undeployed Foundry recovery supplement

This repository preserves an unfinished Foundry template, including its broken
flight workflow. It is not a running workspace controller or an accepted
end-to-end flight implementation. Publishing source does not enable services,
schedules, adoption, deployment, or agent dispatch.

The original core package remains unchanged apart from this status notice.
The supplement preserves all 24 shared ADRs, expanded design concepts and
lexicon, the legacy skill snapshot, the Schematic application source and tests, seven
flight-stage skill snapshots, and workspace preflight, launch-snapshot,
Job Order validation, landing-proof code and their tests. The flight skills
are archived text, not instructions to activate or install them.

`source-inventory.json` lists the supplementary files with SHA-256 checksums.
Workspace identities in the archived tools and fixtures have been generalized;
this is a portable source snapshot, not a byte-identical instance backup.
Private instance content, configuration, operational history, credentials,
and runtime data remain outside this public repository.

## Known gaps retained

- No successful end-to-end flight or lifecycle closure is asserted.
- Workspace tools are under `workspace/workbench/tools` in their old relative
  layout. Their Forge dependency exists at repository `Halls/Forge`; reconnect
  that dependency deliberately before trying the archived tools. They also
  require an adopter-owned harness and configuration. Do not treat this archive
  as an installed workspace.
- Skill snapshots refer to supporting roles, contracts and runtime tooling;
  they are preserved for later review, not automatically enrolled.
- Schematic is an explanatory simulator; its source tests can refer to
  documentation outside the portable application subset. The historical
  release helper is preserved with an example hostname and no deployment configuration.
- Optional Modules remain separately owned products referenced by the manifest;
  their repository access and adoption are separate from this source archive.

Future work should establish a standalone development harness, reproduce the
failures, and repair one observable flight before considering deployment.

## Verification on 2026-09-05

- Foundry manifest validation, harness doctor, and package/boundary test passed.
- Schematic locked dependencies installed; production build passed. No build
  output or dependencies are tracked. No preview or deployment was started.
- Schematic safety tests: 4 passed. Full suite: 142 passed, 2 failed because
  historical QA/lifecycle documents are outside this portable subset. These
  are packaging limitations, not evidence of a repaired flight workflow.
- Supplemental inventory hashes, syntax and targeted identity/secret checks
  passed. Archived workspace flight tools were not run against a live instance.

## Package and clone contract

Clone the default branch of this repository to get the portable Foundry box.
The original core, Schematic source, ADRs/design records and archived workspace
implementation are present together. Private instance state is supplied by a
future adopter; no specific wiki or live workspace data is included.

Use `git archive HEAD` to reproduce this complete source package. The historical
source-root.json describes the earlier core export boundary; re-running that old
producer exporter would omit the supplement. It is retained as historical code,
not the manifest of this complete Git snapshot. source-inventory.json inventories
the supplement. No source rewrite makes the archived flight machinery functional.

The copied ADRs retain decisions and rationale. Instance-specific session links
and individual closure examples are omitted from public copies; original design
and decision records remain with their source owner. No design record was removed
from the source workspace to make these copies.
