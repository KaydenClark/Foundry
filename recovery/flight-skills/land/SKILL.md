---
name: land
description: Get blocked work across the line into `integration` — first answer whether a branch will merge at all, then repair whatever stops it: conflicts, unsaved work, record drift, or a failed gate. The repair tier above a read-only `doctor` or `/preflight` check. Use on a merge error or merge conflict, a failed or dirty closeout, an unpushed branch, a "will this merge?" question, or any request for a **combat medic**.
---

# Land

**Doctor tells you the patient is hurt. This is the one that goes in and gets
them out.** Same axis, higher intensity — that is the whole relationship.

`integration` is the finish line. Work that is finished but has not crossed it
is not delivered, and the failure is almost never in the logic. It is in the
landing: a conflict, a dirty tree, a stale record, a gate that said no.

| Intensity | Instrument | Mutates | Answers |
|---|---|---|---|
| check | `doctor` | no | Is the record internally consistent? |
| deep check | `/preflight` | no | Does the record match Actuality? Is a launch authorized? |
| **repair** | **`/land`** | **yes** | Is it across? If not, what is holding it, and can I fix that? |

A feature bug is not a landing failure. If the code is wrong, that is
`/diagnosing-bugs` and an Engineer. This skill is for work that is *supposed to
be done* and will not land.

## 1. Declare your intensity first

Before touching anything, say which one you are:

- **Stabilize** — secure the recovery boundary only: checkpoint-commit, push,
  leave everything else exactly as found. Nothing is repaired.
- **Repair** — diagnose and fix what blocks the landing, then re-verify.

State it out loud. Start at stabilize; the work is at risk until it is pushed,
and stabilizing is never wrong. **Escalate by saying so, never by drifting** —
if a stabilize turns out to need surgery, secure the work, name what you found,
and re-enter as a repair. A stabilize that quietly grew into a repair is the
failure mode this rule exists to prevent.

## 2. Secure the recovery boundary before diagnosing

If the tree is dirty or the branch is ahead of its upstream, the work can be
lost by the very commands you are about to run. Save it first, truthfully:

```bash
git add -A && git commit -m "checkpoint: <what is actually true, including that it is incomplete>"
git push origin BRANCH:BRANCH
```

A checkpoint commit says the work is incomplete. Do not dress it up as finished.

## 3. Ask whether it will merge — without attempting it

**Never run `git merge` to see what happens.** It dirties the tree you are
trying to rescue and turns a question into a mess you now also have to clean up.

Fetch first — you cannot judge mergeability against a stale ref:

```bash
git fetch origin --prune
git rev-parse --verify HEAD && git rev-parse --verify origin/integration
git merge-tree --write-tree --name-only HEAD origin/integration
```

`merge-tree` writes nothing: no working tree, no index, no branch. It is the
read-only form of the question.

| Exit | Meaning |
|---|---|
| 0 | Merges clean. Nothing to resolve. |
| 1 | **Conflicts — or a ref that does not resolve.** |
| other | Error |

**Exit 1 is ambiguous and this trap is live.** `git merge-tree --write-tree HEAD
nosuchref` also exits 1, printing `not something we can merge` on stderr. A
fetch that silently failed therefore reads as "this branch conflicts" when the
target ref simply is not there. That is why the `rev-parse --verify` line above
runs first — verify both refs resolve, *then* trust exit 1 as conflicts. Read
stderr before you believe the exit code.

On exit 1 with both refs verified, the first output line is the tree OID and the
`--name-only` block lists every conflicted path. Report that list before you
touch a single file — the count and the names are the shape of the job, and they
often reveal the merge is the wrong move entirely.

## 4. Classify the blocker, then treat that

Four modes cover every landing failure seen in practice. Name which one you are
in; they have different treatments and mixing them is how a landing turns into a
rewrite.

| Mode | Symptom | Treatment |
|---|---|---|
| **Unsaved** | Dirty tree, or branch ahead of upstream | Checkpoint and push. This is the entire stabilize job — no repair needed. |
| **Diverged** | `merge-tree` exit 1 with verified refs | Resolve the conflicts — run `/resolving-merge-conflicts` |
| **Record drift** | `doctor` or `/preflight` fails; the record disagrees with source | Reconcile the record to verified Actuality, then re-run. Bookkeeping, not a scope change. |
| **Rejected** | An audit, test, or gate said no | Repair the actual defect, re-test, re-audit. The gate is satisfied, never bypassed. |

For **Diverged**, hand the textual work to `/resolving-merge-conflicts` — it
reconstructs both intents and preserves compatible behavior rather than choosing
by line order. Come back here for the verification and the push. Resolving a
conflict by picking a side you did not read is how canon gets silently inverted.

For **Record drift**, reconciling a record to match verified source is inside any
agent's authority. **Releasing an owner gate is not.** If you cannot tell which
one you are doing, it is the second.

## 5. Verify, then push by the rules

Re-run the checks that failed — the ones that actually failed, not a proxy for
them — plus the owning project's verification suite. A corrected record that
still fails is a real failure.

Git law for agent flows, non-negotiable:

- **Bare `git push` is prohibited.** Push an explicit same-name refspec:
  `git push origin BRANCH:BRANCH`
- Agent branches are created `--no-track`.
- **Never switch, reset, stash, or check out a protected shared checkout**
  (`tools/protected-checkouts.json`). Use a registered worktree.
- In the **WORKSPACE root**, move stale lock debris aside before every git command
  (RUNBOOK → Version Control → Sandbox lock workaround), and check the staged
  file list and repository visibility before pushing — it is a sensitive private
  thin mirror, and not every WORKSPACE repository is private.
- Do not run `git gc`, ref rewrites, force pushes, or branch renames from the
  sandbox.

## 6. Hard stops

Stop and report rather than proceeding:

- **`integration` → `main` is Kayden's alone.** Never infer or perform it.
- A conflict that encodes an unresolved product decision — that is a choice to
  surface, not a merge to win.
- New login or authority, unapproved paid service, irreversible remote deletion,
  credentials or private data, unknown ownership.
- The same verification failing twice with no clearly safe next step. Record the
  blocker and surface the decision needed.

## 7. Close with a receipt

End every run with what is true, in this order:

1. **Outcome** — landed on `integration`, stabilized and pushed, or blocked.
2. **What was wrong** — the mode from §4 and the actual evidence.
3. **What you changed** — files, commits, and the resolution you chose where a
   conflict had a real choice in it.
4. **How it was verified** — the commands that ran and their results.
5. **What remains** — the gap, or the decision now waiting on Kayden.

A blocked landing with honest proof is a complete run. A landing claimed without
the verification having actually run is not.

## Limits worth stating out loud

`merge-tree` answers whether Git can merge the text. It cannot tell you whether
the merged result is *correct* — two changes can merge with zero conflicts and
still be semantically incompatible. A clean exit 0 authorizes the attempt, not
the outcome; the tests do that.

This skill also assumes the branch is *supposed* to land. It does not evaluate
whether the work should exist. If the honest answer is that the branch should be
abandoned rather than landed, say so — that is a legitimate outcome and it is
cheaper than merging something to avoid the conversation.

**"Combat medic" is this skill.** It is the name that has been used for the
intense, goes-in-under-fire version of `doctor`, and every past dispatch under
that name was a landing failure. Run at repair intensity, `/land` is what a
combat medic dispatch was asking for; run at stabilize intensity, it is the
lighter first-responder pass.
