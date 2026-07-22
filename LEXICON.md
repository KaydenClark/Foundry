# Servitor Foundry - Lexicon

These definitions are shared across the portable harness and its instances.

| Term | Meaning |
|---|---|
| **Servitor Foundry** | The reusable governance and composition product that installs Sockets and Modules and coordinates a set of Workbench rooms. |
| **Foundry harness** | This portable repository: controls, manifest, setup, skills, scheduler policy, templates, tools, and reference. It never contains installed component source or instance data. |
| **Foundry instance** | One deployment root that adopts the harness and owns live Wiki memory, projects, bindings, secrets, runtime, schedules, and host-specific state. GPT_OS is one instance. |
| **Foundry Socket** | A reusable system/contract component that defines, builds, audits, governs, monitors, or integrates the Foundry. Capitalized plural `Sockets` names this family. |
| **socket** | One stable capability contract such as recall, messaging, or interface. The contract is stable while the bound Module may change. |
| **Foundry Module** | A standalone, replaceable implementation of a socket contract that keeps its own repository and release history. |
| **install manifest** | The tracked, credential-free list of component remotes, staging refs, ignored destinations, status, and contract-registry discovery information. It contains no active binding. |
| **instance binding** | The instance-owned choice of which Module fills a socket plus contract entrypoint/configuration. Credentials are separate secret state. |
| **no reach-around** | A hard boundary: consumers use a Module only through its declared socket contract, never through the Module's files, database, or internal API by accident. |
| **Foundry adoption** | The one-time, preserve-first process that installs this harness into an instance, clones the manifest, seeds missing instance controls, verifies, audits, and records provenance. |
| **role skill** | A plain Markdown stance contract loaded into the current agent for one task. Loading it never spawns an agent; Captain dispatch is separate. |
| **Captain** | The user-facing coordinator that routes work, protects writer lanes, applies scheduler/AFK policy, and stops automation at `integration`. |
| **Workbench** | The operating surface of one room. A Foundry contains and coordinates Workbench rooms. |
| **Wiki / brain** | Canonical human-editable instance or room memory. The Wiki remembers; a recall Module recalls. |
| **adoption receipt** | Sanitized instance-local provenance containing manifest digest, harness source, component remotes/refs/commits, and checks actually run. |
