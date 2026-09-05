# Foundry Memory Schema

Managed memory notes use YAML frontmatter with exactly these fields:

```yaml
schemaVersion: "1.0"
kind: root-memory | project-index | project-pointer | project-memory
status: active
sensitivity: normal | private | restricted
authority: canonical | derived
sources:
  - relative/source/path
```

The machine-readable form is `schema/wiki.schema.json`. Root and project room
brains are canonical routers. Generated project indexes and pointer notes are
derived from `Projects/projects.json`; they never own enrollment or live work.

Local Markdown links must stay inside the instance root and resolve to real
files. The managed project memory surface is exact: one `P-###.md` pointer per
enrolled project plus `Wiki/Projects/INDEX.md`. Other instance notes may exist,
but the generic generator never discovers or indexes them.
