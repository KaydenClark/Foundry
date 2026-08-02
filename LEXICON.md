# Foundry Lexicon

| Term | Meaning |
|---|---|
| **Foundry** | The portable product containing Halls, composition, governance, and install tooling. |
| **instance** | One deployment that owns populated memory, projects, bindings, schedules, credentials, and runtime state. |
| **Hall** | One native organizational boundary: Forge, Assay, Ward, or Gatehouse. |
| **Forge** | Hall that builds, evaluates, packages, and publishes products. |
| **Assay** | Read-only Hall that judges projects and immutable artifacts. |
| **Ward** | Hall that validates Module integration, contracts, transport, and health. |
| **Gatehouse** | Hall that owns containment, Job Orders, and enforcement gates. |
| **Socket** | A stable capability connection contract housed inside a Hall. |
| **Module** | Optional separately owned product implementing one or more sockets. |
| **native Hall** | Hall source tracked directly in the Foundry product; never installed by manifest. |
| **installed Module** | Module cloned from its own repository into ignored instance space. |
| **Job Order** | Explicit authority to change a named Actuality scope. |
| **Grounding** | Verified evidence returned against the same Job Order. |
| **Captain** | Coordinator that routes work, protects writer lanes, and applies scheduling policy. |
| **product source** | Clean public files produced from an immutable private producer commit. |

Retired: **Foundry Sockets** as a family name for the Halls. Lowercase socket
remains the capability-contract term.
