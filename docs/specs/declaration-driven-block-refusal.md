# declaration-driven-block-refusal

## Deliverable

A line loop refuses an indented block its own grammar says the line cannot take, at the line, using
what the grammar already declares — and the read-trace that stands in for that today is deleted.

`nothing-authored-is-silently-dropped` closed the silent drop with a trace: `takeBlock` records that
a reader consumed a block into a `WeakSet`, `sectionParser` wraps each parser to demand afterwards
that nothing was left, and `answersForItsBlocks` is asserted over `SECTION_KINDS` so the wrapping
cannot be forgotten in silence. It works, it is audited five times over, and it costs two conventions
and one registration for a fact every loop already has to hand.

Every loop already knows. A schema field takes a block iff its parser exposes `parseBlock`
(`src/grammar/section.ts` gates on exactly that); a `keywords` entry, a `clauses` element and a `bare`
value never do; a list element is one line and never does; an action field declares whether it takes a
result block; a dialogue `->` opens one and `once` does not. Nothing is inferred and nothing is
guessed. Measured on 2026-08-16 at `nothing-authored-is-silently-dropped`'s head: converting
`parseSection` alone — the field declaration plus one local `claimedTheBlock` flag per line — carried
all fifteen schema kinds with the trace switched off, every shipped file still loading, and
`"starting" takes no indented block` / `"weapon" takes no indented block` /
`"faction: birds aggressive" takes no indented block` raised at the line instead of after the section.

Proof:

- [c1] **Every line loop refuses at the line, from its own declaration.** For every section kind the
  loader can parse and every authored line the corpus writes, an indented block under a line whose
  grammar gives it none is refused, and the refusal is raised by the loop that read the line rather
  than by a pass over the section afterwards. The clause is universal and its proof derives its
  subjects from the shipped corpus, as `src/content/blocks.test.ts` already does; that walk is
  inherited unchanged and is what says the conversion lost nothing.
  proof: vitest src/content/blocks.test.ts
- [c2] **The trace is gone, not merely unused.** `takeBlock`, the `TAKEN` `WeakSet`, `sectionParser`,
  `requireBlocksRead` and `answersForItsBlocks` are deleted from `src/grammar/structure.ts` and no
  caller remains. `requireNoBlock` stays: it is the one refusal and it is what each loop now calls.
  A branch that leaves the trace in place beside the declarations has delivered a second mechanism
  for one rule, which is the thing this spec exists to remove.
  proof: command grep -rn "takeBlock\|sectionParser\|requireBlocksRead\|answersForItsBlocks" src scripts --include=*.ts
- [c3] **Every loop converts in one change.** The loops are `parseSection`'s `parseLine`,
  `list.parseBlock`, `parseActionLine`, `dialogue`'s node and choice loops, `dropTable`'s rows and
  `parseSaveSection`. Measured 2026-08-16: converting `parseSection` alone and switching the trace off
  left 43 distinct authored lines dropping again — about 24 children of a list block
  (`cluster-jewel: 3 constitution`, `location: beach while front-door.unlocked`) and about 9 action
  body lines (`entity: instant`, `hidden if: emptied`, `rate: cooking-rate`). A partial conversion is
  not a smaller version of this spec, it is the defect reintroduced, and c1's walk is what reports it.
  proof: vitest src/content/blocks.test.ts
- [c4] **Shipped content is unchanged and no authored shape newly refuses.** Every `.dsl` under
  `content/` stays byte-identical and every `# test` and `# save` fixture with it. The conversion
  moves no line from accepted to refused: the set of refused shapes before and after is the same set,
  raised from a different place. A content edit made to keep a file loading is this clause failing,
  not this clause met.
  proof: vitest src/runtime/integration.test.ts
  proof: command git diff --stat HEAD -- content/
- [c5] **A loop written later is answered for, or the spec says plainly that it is not.** The trace
  covered a sixth loop by construction; per-loop declaration does not, and the backstop is c1's corpus
  walk, which reaches a new loop only if content exercises it. Whatever closes that gap — a derived
  check over the loops, a rule that a new loop ships with content, or a recorded decision that the
  exposure is accepted — is decided in this branch and written into `## Decisions`. Leaving it
  unstated is the clause unmet.
  proof: command npm run tasks -- spec show declaration-driven-block-refusal --full
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Hold the totality of a parse with the grammar's own declarations rather than with a record of what
the parse happened to touch, so the rule reads out of the schema a reader is already looking at and
costs no convention to obey.

## Decisions

**This is the agreed next position on the block rule, not a competing proposal.** It was measured and
chosen during `nothing-authored-is-silently-dropped` and deliberately not built there. That branch
rewrote its seam twice under audit pressure — a table wrap that a direct caller reached past, then a
definition wrap that a new parser could forget — and each rewrite cost a full audit round to find the
next hole. The trace was shipped because it was green, proven and audited, not because it was the
better shape. A planner who reaches this region and proposes the trace, or proposes hardening it
further, is going backwards; a planner who proposes converting one loop is proposing the 43 lines
above.

**Errors improve, and that is part of the deliverable rather than a side effect.** The trace can only
raise its refusal once the section parser has returned, so an unrelated error later in the same
section pre-empts it and the message cannot name the field that should have claimed the block. A loop
that refuses at the line has the key, the kind and the cursor in hand.
`nothing-authored-is-silently-dropped-pass3-the-action-title-` is the open finding this retires: the
`# action <id>: title takes no indented block` message was deleted as a duplicate refusal because the
trace could not carry its context.

**No capability is added.** `the parser` is registered to DSL load path over `src/grammar` and
totality of a parse is what it already covers; this changes where that totality is enforced and
nothing about what the loader can do.

## Open questions

**c5 is the one delegated decision.** Whether a sixth line loop is answered for by construction, by
convention, or not at all is genuinely open, and the answer is worth more than a guess made here.
The known options are a derived check over the loops themselves, a rule that a new loop ships with
content that exercises it, and an accepted exposure recorded as such. Pick one and write it down.
