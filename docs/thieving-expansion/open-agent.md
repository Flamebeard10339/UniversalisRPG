# What is still wrong that a lane can take

Every line here is a question the oracle did not answer while `content/thieving.dsl`
was being written, found by building a scratch module and reading what the engine
did. **A line is deleted the day it closes.**

---

## The thieving module carries every gate twice, where a pointer would do

An entity's `hidden if:` refuses its actions now, so a gate written on the entity is
the whole of it. The module was written before that was true: every gated entity
carries the same condition again on each of its actions, once for the screen and once
for the engine.

*Closes when:* no action in `content/thieving.dsl` writes a `hidden if:` its own entity
already writes, and every route through the module still walks.

## `run-progress` is a counter kept only to quiet a remark that is gone

The unreachable-room remark has been taken out of `src/runtime/worldRemarks.ts`: it read
only `adjacent:`, so a room entered by `relocate:` looked stranded, and no reading of the
roads can keep up with the ways a `relocate:` reaches one. The five passages of the den's
initiation and the warden's office therefore still carry conditional roads that mirror
their relocations (`run-progress`, `wardens-door.unlocked`) for a reader that no longer
exists.

*Closes when:* `run-progress` and the roads that mirror a `relocate:` are gone from
`content/thieving.dsl` and `npm run oracle -- --at content` still passes every route.

## A stat used as a `one of:` weight is a raw ratio, and the page does not say so

Measured over thirty rolls at three levels: `thieving-ability:` against `100x` hits
once in thirty at level 1 and five in thirty at level 20, while `thieving-ability vs
25:` and an `accuracy:` contest hit about a third of the time at level 1. Nothing on
the page distinguishes the two, and `content/attention-to-detail.dsl` uses the raw
form for a check that is meant to be passable at level 0.

*Closes when:* the `<weight>` line of the page says the stat stands as a weight beside
the numbers around it, and names the contest form as the shape for a check.

## The paired entities stand in for a fragment the engine now takes

An `examine:` is a line the game says, so `{condition: words}` holds in one. The
module was written before that was true: `street-urchins` and `well-fed-urchins` are
two entities standing in one location with complementary `hidden if:` lines, differing
in nothing but the words of their `examine:`. One entity says that now.

The two widows read like the same shape and are not: `the-widow-at-the-door` stands on
`tulsa.well-lane` and `the-widow-inside` in `thieving.widows-house`, so they are one
character in two rooms rather than one character in two states, and the fragment has
nothing to say about which room she is in. Leave them.

*Closes when:* the ragged and fed urchins are one entity whose `examine:` changes on
the flag that used to pick between them, and every route through
`content/thieving.dsl` still walks.

