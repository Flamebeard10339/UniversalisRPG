# dangling-reference-on-field-edit

## Deliverable

There is an invariant this codebase states twice in its own words — "the registry and the namespace
must describe the same surviving universe: drop one without the other and a save is pruned against
content that is present, or a reference resolves to content that is gone" (`registry.ts`,
`dropContent`). A `-field:` edit is the one path that breaks it, and it breaks it in both directions
at once: `declareMembers` flattens every op including `-`, so an edit *declares* the member it
removes, and nothing undeclares it when the merge takes it away.

The check that would catch this is already written. `references.ts` says, above
`validateSectionReferences`, that "both `# remove` **and a `-field:` edit** decide what survives at
merge, after every reference was authored", and that "the namespace answers rather than the registry
maps, because it is the one place that already knows a member goes away with the object that owned
it." It asks the namespace, walks every reference site, and is correct. It has simply been given a
namespace that lies. So this branch adds no check and no concept — it restores the fact the existing
check was written to depend on.

Measured on this branch with `npm run probe` over a two-module universe:

| what the modules say                                                | today                                                        | after |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| an action `requires:` a flag nobody declared                          | errors at resolve — `names an unknown flag: nosuchflag`        | unchanged |
| `# remove` takes an object a location still lists                     | errors at validate — `names an unknown entity: base.door`      | unchanged |
| `-flags: f` against a base declaring `f`, while an action requires `f` | **loads clean** — built entity holds `flags: []`, the requires still resolves to `base.door.f` | errors at validate |
| `-flags: f` where no `f` ever existed, while an action requires `f`    | **loads clean** — the `-` declared the phantom                 | errors at resolve |
| `-flags: f` where no `f` ever existed, and nothing references it       | loads clean                                                    | unchanged — see the ruling on m2 below |
| `-flags: f` then `+flags: f` in one section                            | `f` survives and stays declared                                | unchanged |

The first two rows are the machinery working. They are in the table because they are what proves the
fix is a restoration rather than a new gate: the same reference, the same check, the same message —
only reached, once the namespace stops lying about what a field edit left behind.

Proof:

- [c1] A `-` op declares nothing. Member declaration reads what a section adds and ignores what it
  removes, so a `-flags:` naming a member that never existed leaves the namespace untouched and a
  reference to it fails at resolution with the message an undeclared flag already gets.
  proof: vitest src/content/resolve.test.ts
- [c2] The namespace and the merged universe agree after a field edit. Members are reconciled against
  the merged section where the member set is finally assembled, in the same phase and for the same
  reason `# remove` undeclares there, so a member a `-field:` edit took away is gone from both.
  proof: vitest src/content/flags.test.ts
- [c3] The post-build check is not touched. `validateSectionReferences` already asks the namespace and
  already names `-field:` edits as a case it covers; the dangling reference in row three is caught by
  it unchanged, which is the evidence that this was a broken input and not a missing check.
  proof: vitest src/content/references.test.ts
- [c4] Load order still does not decide what a name means. Reconciliation happens at merge and not
  during resolution, so a module that references a member removed by a later module fails the same way
  whether it loads before or after it — the property `# remove` was moved to merge to keep.
  proof: vitest src/content/flags.test.ts
- [c5] Nothing that loads today stops loading. Shipped content, every `# test` over it and the whole
  suite pass unchanged; no authored file is edited to accommodate this.
  proof: npm test

## Decisions

- **This branch restores an input, it does not add a check.** The post-build reference check exists,
  is correct, asks the namespace, and its own comment names `-field:` edits as a case it handles. A
  second check placed anywhere else would be a duplicate of a working one, and the duplicate would be
  the copy that rots. What is missing is entirely upstream: the namespace is told a lie at declaration
  and never corrected at merge.
- **Reconcile against the merged section, not against the `-` op.** The rule is to enforce where a
  value is assembled: the surviving member set is the merged section's, and deriving it instead from
  the sequence of ops would restate `applyEdits`' semantics in a second place, which then has to be
  kept in step with it. Comparing what the merged section holds against what the namespace declares
  needs no knowledge of `+`, `-`, order or repetition, and is right for combinations nobody enumerated.
- **At merge, not during resolution — the reason `# remove` gives.** `resolve.ts` records why removal
  deliberately does not undeclare during resolution: doing so "made every later module's reference to
  it fail while every earlier module's silently survived". A field edit has exactly the same shape, so
  it gets exactly the same placement. c4 is that property under test rather than in a comment.
- **`dsl-load-path-2026-07-30-m3` migrates here and is discharged by c1.** It was declined with the
  reason that the finding folded itself into this backlog item; this is that item. It is the second
  door on one defect, not a separate fix.
- **`dsl-load-path-2026-07-30-m2` stays declined and is not quietly implemented.** A `-` edit that
  matches nothing still says nothing, and after c1 it still says nothing — c1 stops it *declaring* a
  phantom, which is a different claim from reporting a no-op edit. The ruling called m2 a narrow edge
  case and that stands; row five of the table is in the spec so an auditor can see the line was drawn
  on purpose rather than missed.
- **Members are whatever `declareMembers` declares, and that set is about to grow.**
  `action-labels-as-members` would make an action label a namespace member, and actions are already
  removable by label through `mergeEntries`. Because c2 reconciles against the merged section rather
  than against flag-specific logic, that task inherits removal handling instead of adding a second
  copy of it. Nothing here is written to be flag-only.

## Open questions

- Whether reconciliation runs once over the merged map after both merge passes, or per section as
  each is merged, is the worker's call once the region is read. Nothing reads the namespace between
  merges, so both satisfy c2; the single pass is likely simpler to prove.
- The test homes named above are where the neighbouring behaviour already lives. A worker who finds
  the region says otherwise should correct the grant rather than split a subject across two files.
