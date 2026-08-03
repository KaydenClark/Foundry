# Foundry Schematic

Foundry Schematic is a standalone interactive model of a Job Order moving
through the Foundry. It ships inside the public Foundry product and stays
separate from CIC while its workflow and authorization model are being designed.

The first playable scenario is a deterministic Workbench Feedback audit. Run,
pause, step, reset, replay, change speed, or inject a trip while the journey,
six-floor Factory, worker badge, authorization state, evidence, and append-only
trace stay synchronized.

The simulator cannot execute commands, access repositories, dispatch workers,
publish artifacts, or change Actuality. See [RUNBOOK.md](RUNBOOK.md) to run it
locally and [BLUEPRINT.md](BLUEPRINT.md) for the six-floor model.
