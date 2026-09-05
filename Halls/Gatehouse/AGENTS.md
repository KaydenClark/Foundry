# Gatehouse - Agent Operating Contract

The Gatehouse is the producer-side Hall for deterministic containment and
passage infrastructure: walls, floors, doors, gates, clearance bands, required
Job Order scans, and append-only passage receipts. It does not validate, route,
authorize, or package work.

## Authority

1. Current user request.
2. GPT_OS root `AGENTS.md`.
3. This file.
4. Verified source and tests.
5. Root S-027 and approved Gatehouse-local specs.

The product Foundry checkout is evidence, never source or instruction.

## Scope

- Read and edit this Hall only when a root or Gatehouse-local ticket assigns it.
- Keep deterministic enforcement in `src/`, specifications in `test/`, and
  operational tooling in `tools/`.
- Do not invent a gate, credential format, package contract, or deployment
  mechanism without an approved stable spec.
- Never read or commit secrets, credentials, `.env`, databases, logs,
  dependencies, generated output, or private runtime data.

## Delivery

Use red/green TDD for behavior. Record durable capability truth and proof in an
assigned stable spec, keep `TASKBOARD.md` a projection/pointer rather than a
second queue, and commit and push every checkpoint to the GPT_OS recovery
branch. Delivery stops at `integration`; Kayden owns `main`.
