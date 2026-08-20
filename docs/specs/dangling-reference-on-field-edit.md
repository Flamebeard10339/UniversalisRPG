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

## Audit passes

### Pass 1 — 2026-08-07

- base: `b56ba3ee30365f83e10738189ac42d94bcad295c`
- head: `007b8afedbe51c101c8dd168ca79f01c8b2f9a4e`
- proof 1: met — addedMembers at src/content/resolve.ts:63 reads only ops whose op is "+", and declareMembers
  (resolve.ts:78-84) is its only consumer; listMembers stays unchanged for referenceSites, which must still
  resolve a "-" operand's target. Re-run: npx vitest run src/content/resolve.test.ts -t "a - op declares nothing"
  (3 cases). Verified at the stage the clause names, not just by message: npm run inspect over
  loadUniverseWithDiagnostics([base "entity rat / flags: alert", mod "entity base.rat / -flags: ghost / poke: /
  requires: ghost"]) reports {"stage":"resolve","message":"# entity base.rat action \"poke\" requires: names an
  unknown flag: ghost"} - the same message flags.test.ts:29 asserts for a flag nobody declared.
  MUTATION VERDICTS: c1-declare-every-op (restores the pre-branch listMembers call) KILLED, 1 of 23, by
  "leaves a flag that never existed undeclared, so a reference to it fails the way any typo does";
  c1-declare-no-edit (over-narrowing guard: addedMembers returns [] for any FieldEdits) KILLED, 1 of 23, by
  "still declares a name the same section adds after removing it, because the merge keeps it". Both re-measured
  at src/content/resolve.test.ts with the mutation still on disk and failing there too.
- proof 2: unmet — Withdrawn from met after the regression pass. The reconciler's mechanism IS proved - three mutations,
  three kills, each attributed to its own named test in src/content/flags.test.ts (1 of 20): c2-no-undeclare and
  c2-forget-earlier-modules both killed by "goes away with the value, so a reference the edit stranded no longer
  resolves", and c2-flags-only-reconciler killed by "leaves discovered alone when a location edits its flags",
  which settles that the discovered assertion discriminates rather than merely restating the implementation.
  What fails is the clause as stated. Namespace.declareMember (src/content/namespace.ts:50-54) keys a member as
  owner-dot-name with NO owner kind, so a location beach and an entity beach in one module share the single key
  base.beach.searched. reconcileMembers (src/content/registry.ts:628-638) walks merged kind by kind and
  undeclares any member the merged section OF THAT KIND no longer declares, never asking whether a surviving
  section of another kind still declares that key. Reproduced on 007b8af with npm run inspect, three fixtures:
  (1) base declaring "location beach / x: 0, y: 0 / flags: searched / search: set: searched" plus "entity beach /
  flags: searched", mod declaring "entity base.beach / -flags: searched" now THROWS "# location base.beach action
  \"search\" set: names an unknown flag: base.beach.searched" - the location's own action, naming the location's
  own flag, broken by an edit to a different object; (2) the same shape with discovered LOADS with
  namespace.has("flag","base.beach.discovered") false, which is silent; (3) control with no id shared across kinds
  leaves base.beach.searched declared, so the trigger is specifically the cross-kind id collision. That is the
  clause's own sentence failing: the registry holds the location and its flags while the namespace does not.
  Not deferrable - c2 is this branch. THE FIX belongs in the reconciler, not in the key: compute the surviving set
  as the union of wouldDeclare over EVERY (kind, id) in merged first, then subtract once, so a member key is live
  iff some surviving object of any kind declares it - the only correct reading of a key space that is
  kind-agnostic by construction. That preserves every case now green: the union is empty of base.door.unlocked
  after the cut, and holds base.beach.discovered because the location's merged section still synthesises it.
  Regression tests for fixtures (1) and (2) belong in flags.test.ts beside the four added here.
- proof 3: met — Byte-identity verified by blob hash rather than by diff silence: git rev-parse
  b56ba3e:src/content/references.ts and HEAD:src/content/references.ts are both
  c52b6ce9dbdf8fd85667a67c8dc7c00bacbf927f (src/content/merge.ts is likewise dbc57cc at both ends). The spec's
  row three is caught by that untouched walk: npm run inspect over loadUniverseWithDiagnostics of "entity crab /
  flags: shy", "entity gull / squawk: / requires: crab.shy", "entity crab / -flags: shy" reports
  {"stage":"validate","message":"# entity base.gull action \"squawk\" requires: names an unknown flag:
  base.crab.shy"} - stage validate is validateSectionReferences, not a new gate. Re-run: npx vitest run
  src/content/references.test.ts -t "edit took away, and accepts the same reference without the edit".
  MUTATION VERDICT: c3-post-build-check-off (the NAMESPACED_KINDS guard in references.ts forced false) KILLED,
  1 of 35, by that named test - which ties the new case to references.ts:20 rather than to anything this branch
  wrote. Note that c3 being met is how case 1 of the c2 defect surfaces loudly instead of silently: the untouched
  walk correctly reports the namespace's new lie.
- proof 4: met — Structural: reconcileMembers is called at src/content/registry.ts:714, after both mergePass
  invocations and outside RESOLUTION_PASSES; grep for undeclare in src/content/resolve.ts returns nothing, and the
  comment at resolve.ts:131-134 that records why removal does not undeclare during resolution is unchanged.
  Measured: loadUniverseWithDiagnostics over [base, aaa-cut, zzz-wants] and [base, aaa-wants, zzz-cut] both report
  stage "validate" with the same message. Re-run: npx vitest run src/content/flags.test.ts -t "fails whichever
  module names it first".
  MUTATION VERDICT: c4-no-reconcile-at-merge (the reconcileMembers call deleted) KILLED, 1 of 20, by that named
  test - which proves the assertion is not vacuous, NOT that it carries the order property.
  CAVEAT for the next pass, filed as finding L1: that test cannot fail for the property c4 names. A reconciler
  moved into resolveReferences would make the cut-first order fail at stage "resolve" and the wants-first order at
  stage "validate", and both messages match the test's regex verbatim, so only the stage discriminates and the
  test does not assert it.
- proof 5: unmet — Withdrawn from met. The enumerated evidence all still passes and is re-runnable: npx vitest run with
  a worker cap of 4 on 007b8af gives 72 files, 1794 tests, 0 failures, 43.86s; npm run tasks -- merge-ready gives
  tsc, npm test, layer-check, audit-status, doctor, bytes, base and spec all pass, with only tree (uncommitted
  docs paths from the concurrent audit session) and clauses failing; git diff b56ba3e..HEAD --name-only lists no
  .dsl and no content/ path. BUT the clause's first sentence is falsified by the two-module fixture in c2's
  evidence above: it loads on b56ba3e and does not load on 007b8af. Grading this met on the enumeration alone
  would be the trap this brief names, and pass 1's own first draft already set it up - shipped content contains
  no field-edit lines at all (grep for a leading minus in .dsl returns nothing), so the shipped leg exercises the
  reconciler's retain path only and cannot discriminate this class. Reading "today" as shipped content only would
  make the clause unfalsifiable by anything the branch could plausibly break. The defect is also save-visible,
  which is what puts it past a load-time inconvenience: the runtime flag id in state.flags is the same string, so
  a location silently losing discovered re-fogs a player's map on load. Met again once the c2 fix lands and
  fixtures (1) and (2) are regression tests.

### Pass 2 — 2026-08-07

- base: `b56ba3ee30365f83e10738189ac42d94bcad295c`
- head: `f69159b287ea5e8a8e89b3b146eceda237fb8c76`
- proof 1: met — Re-verified against the rewritten code rather than carried forward. git show 673d6a3 -- src/content/resolve.ts
  is empty, so the c2 fix did not touch c1's mechanism: addedMembers at src/content/resolve.ts:63 still filters
  op === "+" and declareMembers (resolve.ts:78-84) is still its only consumer, with listMembers left in place for
  referenceSites. Re-run: npx vitest run src/content/resolve.test.ts -t "a - op declares nothing" gives 3 passed.
  New evidence this pass, at the case pass 1 did not reach - a CREATING section written entirely in ops, where there
  is no base to merge onto. npm run inspect over loadUniverse of a single module: "# entity door / +flags: a /
  -flags: a" gives flags [] and has("flag","base.door.a") false, and the reverse order "-flags: a / +flags: a" gives
  flags ["a"] and has true. That is mergeSection(kind, undefined, from) routing through mergeAuthored's applyEdits
  (merge.ts:84-89), so declaration and merge agree even where nothing is merged onto - the shape where a
  declaration-side reimplementation of applyEdits would have diverged.
  MUTATION VERDICTS from pass 1, on bytes unchanged since: c1-declare-every-op KILLED 1 of 23 and c1-declare-no-edit
  KILLED 1 of 23, each by its own named test.
- proof 2: met — Restored. Both pass-1 falsifying fixtures now behave, measured with npm run inspect on f69159b: fixture (1)
  (location beach + entity beach both holding searched, mod does "# entity base.beach / -flags: searched") LOADS
  instead of throwing "# location base.beach action \"search\" set: names an unknown flag: base.beach.searched";
  fixture (2) keeps namespace.has("flag","base.beach.discovered") true. Re-run: npx vitest run
  src/content/flags.test.ts gives 22 passed, including the two new cases under "a member key is owned by every kind
  that declares it".
  THE INVERSE was the point of this pass, since a universe-wide union can only ever retain more. Structurally the
  union differs from the per-kind reconciler on exactly one set: member keys where a surviving object of a DIFFERENT
  kind declares the identical (member kind, owner id, member name). Measured that it is that narrow and not a
  blanket per-id retention: with location beach holding wet and entity beach holding searched, stripping the
  entity's searched gives searched false, wet true, discovered true, and a third object's stranded
  "requires: base.beach.searched" is still reported at stage validate. Within that one set the key is genuinely
  live - it is the same string the runtime uses (state.flags is keyed by it, src/runtime/save.ts:41), the twin still
  holds it, and something still writes it: with the location keeping searched, its "set: searched" compiles to
  {kind:"set", variable:"base.beach.searched"}, the exact key the stripped entity's requires reads. Retention is
  also the safe side of the one consumer that acts on absence - pruneStateForRegistry drops a player's flag when the
  namespace lacks the key, so the old per-kind code deleted save state and this one does not. And a twin that is
  itself pruned takes the key with it downstream (dropContent calls namespace.undeclare, registry.ts:393), so the
  union cannot retain a key whose declarer never reached the built registry. I looked for a shape where a member
  ought to leave and now stays; there is none.
  THE BOUNDARY, stated rather than discovered later: where the collision is exact, the reference the edit stranded is
  not reported, it silently retargets onto the twin's member. That is the kind-agnostic key, already filed as
  dangling-reference-on-field-edit-pass1-the-kind-agnostic-mem, not a second door this branch opened.
  MUTATION VERDICTS: pass 1's c2-no-undeclare, c2-forget-earlier-modules and c2-flags-only-reconciler were re-aimed
  at the rewritten code and all three KILLED 1 of 22 by their own named tests, and c2-per-kind-surviving-restored
  (the pre-fix reconciler restored verbatim) KILLED 2 of 22 by both new cross-kind cases.
  TWO PASS-2 MUTATIONS SURVIVED THE WHOLE SUITE, 0 failed of 1796 each, and both are filed as coverage findings on
  this pass rather than as defects - the behaviour is correct today and untested. c2-member-key-drops-kind (the
  member kind dropped from the union's key) and c2-declare-only-first-section (the per-owner accumulation reduced to
  the first section that declares). c2 is graded met on the measurements above, not on those two lines being
  watched; what the suite cannot currently do is stop someone breaking them.
  INDEPENDENT CORROBORATION of the inverse-defect answer, from the pass-2 regression auditor working separately:
  reconcileMembers' only namespace call is undeclare (function body extracted and every namespace.* call matched),
  so it cannot declare and cannot resurrect what a remove took; and the union is computed from the same merged map
  applySection builds the registry from, so union membership implies a live registry object declares that member.
  Fuzzed over 3972 generated universes (3884 loading on both trees) with twin ids across kinds, random field edits
  and removes: ZERO universes where HEAD's namespace holds a flag key no surviving registry object owns - zero
  orphans at all, not merely no new ones - plus zero new-missing and zero new-throws against b56ba3e.
- proof 3: met — Byte-identity re-verified by blob hash on this pass, not carried forward: git rev-parse
  b56ba3e:src/content/references.ts and HEAD:src/content/references.ts are both
  c52b6ce9dbdf8fd85667a67c8dc7c00bacbf927f. src/content/merge.ts is dbc57cc4a9b2491b205131181bd784172995fdd9 and
  src/content/namespace.ts is bb0030fb64545a35a12c0c6cec71a2c3d9b60659 at both ends too, which bounds the whole fix
  to registry.ts and resolve.ts and rules out the reconciler having been made to work by loosening the key or the
  merge. The untouched walk still reports the case: npm run inspect over loadUniverseWithDiagnostics of a
  location/entity id twin where the edit strands a third object's reference gives stage validate with message
  "# entity mod.gull action \"squawk\" requires: names an unknown flag: base.beach.searched" - stage validate is
  validateSectionReferences, not a new gate. Re-run: npx vitest run src/content/references.test.ts -t "edit took
  away" gives 1 passed.
- proof 4: met — Structural, re-checked against the rewritten code. reconcileMembers is called at src/content/registry.ts:719,
  after both mergePass invocations and outside RESOLUTION_PASSES; the three callers of Namespace.undeclare in src/
  are registry.ts:393 (dropContent), :638 (the reconciler) and :690 (the remove branch) - none in resolve.ts - and
  the comment at resolve.ts:131-134 recording why removal does not undeclare during resolution is unchanged.
  Behavioural, measured on f69159b rather than inferred: loadUniverseWithDiagnostics over [base, aaa-cut,
  zzz-wants] and over [base, aaa-wants, zzz-cut] both report stage validate with the same message, differing only
  in the naming module's own id. Re-run: npx vitest run src/content/flags.test.ts -t "fails whichever module names
  it first".
  Pass 1's caveat L1 stands and is NOT discharged here: that test still cannot fail for the property c4 names,
  because both a merge-time and a resolution-time reconciler produce messages its regex matches and only the stage
  discriminates. The stage measurement above is what carries c4 this pass; the test carries only non-vacuity.
- proof 5: met — Re-runnable: npx vitest run with a worker cap of 4 on f69159b gives 72 files, 1796 tests, 0 failures,
  62.13s (the worker cap is the already-filed subprocess-timeout flake, not this branch). npm run tasks --
  merge-ready passes tsc, npm test, layer-check, audit-status, doctor, bytes and tree; only base (main has moved),
  spec (unreviewed findings) and clauses (this record) fail, all workflow state rather than code. git diff
  b56ba3e..HEAD --name-only lists no .dsl and no content/ path, so no authored file was edited to accommodate this.
  The clause's first sentence, which pass 1 correctly refused to grade on the enumeration alone, is now true at the
  fixture that falsified it: the two-module universe that loaded on b56ba3e and threw on 007b8af loads on f69159b,
  and the silent-loss variant keeps its flag. Both are regression tests in src/content/flags.test.ts. Recording what
  the shipped leg still cannot say: content/tutorial-island.dsl contains no field-edit lines at all, so shipped
  content exercises the reconciler's retain path only and cannot discriminate this class - the fixtures are the
  discriminating evidence, the shipped run is not.
