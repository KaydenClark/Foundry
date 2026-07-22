# Wiki Schema

The Wiki is instance data. Keep maintained notes concise, source-linked, and
explicit about freshness and sensitivity.

## Required Frontmatter For Maintained Notes

```yaml
---
type: memory
status: active
sensitivity: normal
authority: canonical
source_paths: []
last_verified: YYYY-MM-DD
---
```

- `status`: `active`, `stale`, or `archived`.
- `sensitivity`: `normal`, `private`, or `restricted`.
- `authority`: normally `canonical`; use `derived` for generated views.
- `source_paths`: concrete sources supporting the note.
- `last_verified`: the last date those sources were checked.

Never store credentials, tokens, `.env` values, raw private exports, or live
runtime logs in the Wiki.
