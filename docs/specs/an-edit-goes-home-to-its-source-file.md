# an-edit-goes-home-to-its-source-file

## Deliverable

An edit made in the browser lives in the `local-changes` module, which is loaded last and overrides
what the files under `content/` declare. That is the right place for it while it is being written and
the wrong place for it afterwards: a local section that shadows a base section makes the next edit to
that file invisible, which is the diagnosis `the-shell-draws-what-the-session-answers` c3 emits and
this branch is the remedy it points at. Sending an edit home means writing it into the file that declared
its id and taking it out of the local module, and the whole difficulty is proving that doing so
changed nothing.

That proof already exists and is already load-bearing one file over.
`scripts/squash-local-changes.ts:125` serializes a module, reloads it, and refuses to proceed unless
`registryDiff` says the universe is identical. `c9c88e1` promoted `registryDiff` out of that script
into `src/content/registryDiff.ts` precisely so it could be shared, and the next commit, `bd77f26`,
built a second serialize-and-reload path in the mod portal without it — which is
`contribution-system-2026-07-30-h1`, where canonicalising an approved mod silently discards every edit
and removal it makes. One guard, two callers, one of them missing it: this branch makes the guard the
thing a serialize-and-reload *is*, so a third caller cannot be written without it.

How the edit is written into the file is the other decision, and it is a splice rather than a rewrite.
`splitSections` already returns each section's byte span, so replacing one section's span leaves every
other byte of the file exactly as the author wrote it — comments, blank lines, ordering and all. The
alternative, printing the whole module canonically, makes every consolidation a whole-file diff nobody
can review and makes the serializer's completeness a precondition, which is the very thing
`contribution-system-2026-07-30-h1` records as not holding.

Proof:

- [c1] **A consolidation writes each section into the file that declared its id.** Every section of the
  local module is spliced over the span `splitSections` gives for that id in its declaring file, and
  every other byte of every file is untouched. A section no file under `content/` declares is reported
  by id and left in the local module — placing it by guess is the one repair this clause forbids.
  proof: vitest scripts/consolidate.test.ts
- [c2] **A serialize-and-reload is a diffed serialize-and-reload, at every caller.** No path in the
  repository serializes content and loads it back without comparing the result to the universe it came
  from through `registryDiff`. The proof derives its subjects from the tree rather than naming the
  script and the mod portal, because the third caller is the one this clause exists to catch. This
  closes `contribution-system-2026-07-30-h1`.
  proof: vitest src/content/registryDiff.test.ts scripts/modportal.test.ts
- [c3] **A consolidation that would change the universe writes nothing.** Any difference `registryDiff`
  reports aborts the whole run: no file is written, the local module is untouched, and the difference is
  named. All-or-nothing, because a half-distributed edit is a state neither the file nor the local module
  describes.
  proof: vitest scripts/consolidate.test.ts
- [c4] **After a successful consolidation the game is unchanged and the local module is empty.** Loading
  `content/` alone after the run yields a universe `registryDiff` cannot distinguish from the one loaded
  before it with the local module on top, every `# test` over shipped content passes, and
  `/local list` reports nothing staged.
  proof: vitest scripts/consolidate.test.ts src/runtime/integration.test.ts
- [c5] **The round trip is closed, and it is closed on real content.** An edit staged through `/dsl`,
  consolidated home, and loaded back from files alone produces the same universe as the same edit left
  staged — proven over the shipped `content/` tree rather than over a fixture, because the shipped tree
  is the one an author will run this against.
  proof: vitest scripts/consolidate.test.ts
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the local module a place edits pass through rather than a place they accumulate, so the files
under `content/` stay the thing the game is made of.

## Decisions

**Extends `local changes` and `registry diff`; registers `edit consolidation` over
`scripts/consolidate.ts`.** Both extended concepts are already registered to Contribution system, and
the survey found `scripts/squash-local-changes.ts` holding most of the mechanism. What is genuinely new
is distributing across many files rather than printing one, which is a capability a later survey will
ask about by name.

**Whether `squash-local-changes` survives is the worker's to decide on the evidence, and either answer
is recorded.** Its job — print one module canonically after applying local changes — is not this
command's job, and it may still be the right tool for publishing a mod as its own module. What it must
not remain is a second implementation of c2's guard. Folding it in or leaving it beside is permitted;
leaving two copies of the diff-then-refuse sequence is not, and c2's derivation is what catches that.

**A splice, not a canonical rewrite — c1.** Printing the whole module means every consolidation is a
whole-file diff, and it makes the serializer's completeness a precondition for not losing content.
`contribution-system-2026-07-30-h1` is that precondition failing in the one place it was already
relied on. Splicing the span `splitSections` already computes touches only what changed, keeps the diff
reviewable, and still gets c3's guarantee from `registryDiff` rather than from trusting the printer.

**Requires nothing in the GUI chain, and that is the point of the one clause it gave away.** Handing
the author the local module's bytes was this spec's c1 and is now
`the-gui-authors-through-the-same-door` c16, because it is a control on a surface that branch builds
over text that branch's `AuthoringContext` already holds — and keeping it here would have made this
branch write `src/ui/driver.ts`, which two other branches in the push also write. Giving up one clause
leaves everything here inside `scripts/` and `src/content/`, so this runs beside the whole GUI chain
instead of behind it. The diagnosis it answers is
`the-shell-draws-what-the-session-answers` c3, which reports which local sections shadow a base
section; that is a conceptual pairing and not a build order, since a shadowing section can be
consolidated whether or not anything has warned about it yet.

**The consolidation is a command and not a button, because a browser cannot write `content/`.** The
GUI hands over bytes and this command places them — two surfaces because of what a browser can do, and
neither a second implementation of the other. Nothing here is reachable from the game, and nothing has
to be.

## Open questions

- Whether the command takes a filter — one kind, one id, one file — or always consolidates everything is
  the worker's call. c3's all-or-nothing applies to whatever set it was asked for.
- Where a section belongs when two files under `content/` both declare its id is not decidable here and
  must be refused rather than guessed, under c1's own rule. Whether that case can arise at all depends
  on `refuse-two-objects-of-different-kinds-sharing-an-id-while-ei`; until it lands, refusing is correct
  and costs nothing.
