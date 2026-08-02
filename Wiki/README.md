# Wiki Capability

This is the generic, publishable Foundry memory layer. It contains schema,
root/project memory scaffolding, link validation, and Projects-backed index
generation—never an owner's populated notes.

From an instance root whose `Projects/projects.json` is initialized:

```bash
node Wiki/tools/wiki.mjs init --root .
node Wiki/tools/wiki.mjs check --root .
```

`init` creates one root memory router, one room brain per enrolled project, one
Wiki pointer note per project, and a deterministic project-memory index.
Existing memory files are never overwritten. `check` validates exact
frontmatter, registry ownership, generated indexes, and every local Markdown
link in the managed scaffold.

Producer source lives under `Foundry/Wiki/`; packaging places it at product-root
`Wiki/`. Populated owner, machine, archive, and private notes are instance data
and are excluded by the Foundry source-root contract.
