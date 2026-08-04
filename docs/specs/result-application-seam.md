# result-application-seam

## Deliverable

`applyResults` is the chokepoint three queued branches each need to change in a different way, which
is the report `tasks plan` gives when it says a plan concentrated in one file is one change. The
cause is that result application conflates three questions: what a result *is*, *who* it applies to,
and *what else* observes that it happened. Today the second is answered by a hardcoded `PLAYER` and
the third has no answer at all, so every consumer must edit the switch. This branch separates them,
and it is deliberately a refactor: no authored content behaves differently when it merges. It ships
nothing a player can see, and that is the point — it exists so that modals, skill events and combat
hooks each extend one seam instead of three rewrites of one function landing on top of each other.

Proof:

- A result carries a subject actor. `applyResults` takes the actor a result applies to rather than
  naming `PLAYER` inside itself, and the existing call sites pass the player explicitly.
- Applying a result is observable. There is one place where "this result was applied, to this actor,
  with this magnitude" can be watched, and a consumer subscribes there instead of adding a case to
  the switch or a call beside it.
- Nothing observable changes. Every `# test` in shipped content passes unchanged and byte-identical:
  the same saves compare equal, the same log lines appear in the same order, and no `expect:` save
  is regenerated as part of this branch. A refactor that needs a fixture rewritten has changed
  behaviour it claimed not to.
- The save format is unchanged by this branch, or moves once here rather than once in each of the
  branches that follow.
- The three queued branches stop concentrating. After this lands, `tasks plan` over
  `first-class-modals`, `skill-levels-xp-events` and `combat-events` no longer reports all of them
  writing `src/runtime/effects.ts`.

## Decisions

- **A seam branch, not a seam smuggled into the first consumer.** Whoever landed it first would be
  making an architectural change under a feature's name, and the two behind them would review it as
  incidental diff. Three branches needing one change is the argument for a fourth, not for letting
  one of them grow.
- **The refactor ships no behaviour.** Its whole proof is that nothing changed, which is only
  checkable if nothing was supposed to. Bundling even one small improvement forfeits that.
- **Everything downstream is strictly sequential.** This branch, then `first-class-modals`, then
  `skill-levels-xp-events`, then `combat-events`. They are not independent work that happens to
  collide; each needs the shape the previous one settles.

## Open questions

- Whether the observation point is a return value, a callback, or an accumulated list on the segment
  is left to the first slice. The clause is that exactly one such place exists, not what it is —
  choosing it needs the region read, and the worker who reads it corrects this grant anyway.
