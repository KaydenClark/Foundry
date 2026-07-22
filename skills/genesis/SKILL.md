---
name: genesis
description: Creates a new Foundry instance from an empty directory using the manifest, template Wiki, disabled scheduler config, doctor, and Audit Engine. Do not use for an existing live deployment.
disable-model-invocation: true
---

# Bootstrap A Foundry

1. Confirm the target is a new instance and capture the founding request,
   instance name, target root, constraints, and harness ref.
2. Read `templates/GENESIS.md` completely.
3. Clone the Foundry harness to `<instance-root>/Foundry`, run the write-free
   plan, then run adoption only after the destinations are safe.
4. Do not request or persist credentials; private components use existing Git
   access and fail visibly when it is absent.
5. Verify the template Wiki, relative bindings, disabled scheduler config,
   ignored independent component clones, and sanitized receipt.
6. Run Foundry tests/doctor and read-only Audit Engine. Record exact provenance
   and a <1-minute demo.
7. Stop at `integration`; do not enable host services or promote to `main`
   without the instance owner's explicit approval.
