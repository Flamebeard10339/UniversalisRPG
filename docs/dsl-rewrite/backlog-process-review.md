# Backlog: review how the DSL architecture drifted this badly

This is an explicit, standalone backlog item requested alongside the DSL
teardown. It is separate from the technical rewrite (`implementation-plan.md`)
and can be done independently of it (before, after, or in parallel) — its
deliverable is a set of **workflow/process changes**, not code, aimed at making
sure the next content-authoring system doesn't quietly accrete the same kind of
debt over its lifetime.

## The question to answer

`postmortem.md` explains *what* went wrong architecturally. This task is about
*why the process allowed it to go this far before anyone stepped back* — the
DSL grammar reached 781 lines and the contribution pipeline became a
multi-script, manually-run, copy-paste-driven system before it was treated as
something needing a rethink rather than another patch. What, in how this
project adds features, made that the default path instead of an exception?

## Evidence worth re-examining (starting points, not conclusions)

- **Feature-reactive grammar growth.** The git history for the DSL shows a
  sequence of tightly-scoped commits, each solving one immediate problem in
  front of the author: `c1ea386` (rebuild contributions as patch modules),
  `c6beedf` (extend `# patch` grammar with granular ops), `47f41fb` (add the
  differ), `4584d22` (bundle packaging), `a0765d7` (split bundle per module).
  Each is a reasonable change in isolation. None of them appear to have paused
  to ask "does this fit the existing grammar's shape, or should the shape
  change?" — worth checking whether *any* commit in the DSL's history did that,
  or whether every single one was purely additive.
- **A documented repeat failure treated as a rule, not a defect.** CLAUDE.md's
  Content Pipeline section says the module-conflict-cascade bug "has happened
  twice" and responds with a testing-discipline instruction ("run the full
  pipeline") rather than a fix to the cascade's blame-and-disable-whole-module
  design. Worth checking: are there other places in this project's history
  where a recurring bug got a written warning instead of an architectural fix?
  If so, that's a pattern, not a one-off.
- **No visible coverage-tracking for "does every content shape have DSL
  sugar."** Seven `ContentModule` shapes never got DSL sugar and the plan was
  always "port later if it becomes annoying enough" — an open-ended deferral
  with no owner or trigger condition. Worth checking whether this project has
  *any* mechanism (a checklist, a tracked issue, a periodic review) for
  "features we've deferred indefinitely," or whether deferred work simply
  disappears from view until someone re-discovers it by accident (as happened
  here, via this audit).
- **Three parallel grammar surfaces drifting silently.** The parser, the
  editor's syntax highlighter, and its completion engine each hard-coded their
  own idea of the grammar, and at least one (a `wall`/`while` keyword rename)
  drifted without anyone noticing — the stale reference survived in comments
  and a passing test. Worth checking whether this project has a habit of
  writing tests that assert *equivalence* between related implementations
  (e.g., "the highlighter's keyword list matches the parser's"), or whether
  duplication like this is generally invisible until a postmortem like this
  one goes looking for it.
- **A known workaround shipped without escalation.** `contributionPatch.ts`'s
  own header comment states, in the present tense, that it is "deliberately
  decompiler-free" and explains why — the author clearly understood the real
  fix (a decompiler) and chose a local workaround instead, and that comment
  sat in the codebase as the permanent state of things rather than as a
  tracked "we should fix this properly" item. Worth checking how often this
  project's comments document a known gap that never became a backlog item.

## What a good answer to this backlog item looks like

Not "be more careful" — concrete, checkable workflow changes. `postmortem.md`
proposes a few candidates already (a lightweight ADR habit for grammar/schema
changes, a round-trip-equality test required for every new content shape,
treating a second occurrence of the same bug as a mandatory architecture-fix
trigger rather than a new warning, periodic "grammar diet" reviews). Whoever
picks this up should treat those as a starting list, verify them against a
fuller read of the git history than this audit had time for, and decide which
are worth adopting for the new system — and, ideally, for this project's other
subsystems too, since none of the drift mechanisms above are DSL-specific.
