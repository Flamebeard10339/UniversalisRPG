# What is still wrong that a lane can take

Every line here is a question the oracle did not answer while `content/thieving.dsl`
was being written, found by building a scratch module and reading what the engine
did. **A line is deleted the day it closes.** The proofs stand in `open-tests.dsl`.

---

## An entity's `hidden if` hides it from the screen and from nothing else

`# entity` takes `hidden if:`, and the page says the thing is *not there to be met or
robbed* while it holds. A route can still `use:` its actions and they run. Only a
`hidden if:` written on the action refuses. Every gated entity in the thieving module
carries the condition twice for this reason — once on the entity for the screen and
once on each action for the engine — which is a copy where a pointer would do.

*Closes when:* `an-entity-hidden-by-its-own-condition-refuses-its-actions` passes.

## `stop` does not stop a droptable

`stop` is listed under `<result>` and the player's `on death` in `content/tulsa.dsl`
relies on it. Inside a `# droptable` rolled from an action the lines after it still
run. The thieving module orders its `if` ladders so that no branch needs one, which is
fragile: a purse-confiscation branch that ran before an empty-purse check would jail
a player it had just robbed.

*Closes when:* `stop-ends-a-droptable` passes.

## `-adjacent:` takes no road out

The page says `-<line>` takes out of a body whatever the line writes. Written as
`-adjacent: rogue-den` or `-adjacent: tulsa.rogue-den` under `# location
tulsa.doss-house`, the road stays. The module replaces the whole `adjacent:` line
instead, which restates `well-lane` from `content/tulsa.dsl` — a second home for one
road, and the reason the den is now entered by the hatch rather than by a road.

*Closes when:* `a-minus-adjacent-line-takes-one-road-out` passes.

## A dialogue laid over from another module cannot add an `always` node

A `when:` node added under `# dialogue tulsa.guardsman` from thieving is offered as a
thread. An `always` node added the same way is never offered: the guardsman speaks
tulsa's own `always` line and lists nothing. Every overlay node in the thieving module
is therefore a `when:` node, including two that would rather have been unconditional.

*Closes when:* `an-always-node-laid-over-a-dialogue-is-offered` passes.

## `requires:` refuses the `<count> <item>` condition the page offers it

The condition page lists `has <item> | <count> <item>`. Under an action,
`requires: 50 core.coin` is refused with *expected a reference*;
`requires: inventory.core.coin >= 50` is taken. Either the parser or the page is wrong,
and a route cannot pin a parse refusal, so this line has no proof beside it.

*Closes when:* `npm run oracle -- --at` takes a draft carrying `requires: 50 core.coin`,
or the condition page stops offering the form.

## The unreachable-room remark does not see `relocate:`

`npm run oracle -- --at content` remarks that no road reaches a location, and reads
only `adjacent:` to say so. The five passages of the den's initiation and the warden's
office are entered by `relocate:` on purpose. They now carry conditional roads that
mirror the relocation (`run-progress`, `wardens-door.unlocked`) so the remark is quiet,
which is a counter kept in step with the relocations by hand.

*Closes when:* the remark counts a location that some `relocate:` names as reached, and
`run-progress` can be deleted from `content/thieving.dsl` without a remark returning.

## A stat used as a `one of:` weight is a raw ratio, and the page does not say so

Measured over thirty rolls at three levels: `thieving-ability:` against `100x` hits
once in thirty at level 1 and five in thirty at level 20, while `thieving-ability vs
25:` and an `accuracy:` contest hit about a third of the time at level 1. Nothing on
the page distinguishes the two, and `content/attention-to-detail.dsl` uses the raw
form for a check that is meant to be passable at level 0.

*Closes when:* the `<weight>` line of the page says the stat stands as a weight beside
the numbers around it, and names the contest form as the shape for a check.

## `attention-to-detail-start-to-finish` is red before this branch touched anything

The route watches the castle windows once, on a `one of:` whose stat row is worth
about one in a hundred at level 0 (the line above). It passed on an earlier seed and
fails on the current one, so the corpus gate exits non-zero on a route the thieving
expansion did not change.

*Closes when:* `npm run oracle -- --at content` reports it PASSED — either by the
watch being retried with `until`, or by the check moving to the contest form.
