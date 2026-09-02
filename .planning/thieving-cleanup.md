# Thieving: a cleanup pass over what the engine learned since you wrote it

You wrote `content/thieving.dsl` and it works: every route in it walks and
`npm run oracle -- --at content` is green. This is not a rewrite. Four things you
worked around no longer need working around, and the module still carries the
workarounds. Take them out, and leave everything else exactly as it stands.

**Your gate is `npm run oracle -- --at content`.** Run it after each pass. Every
`# test` in the module must still pass; you may not weaken one to make an edit
land. Do not open anything under `src/` or `scripts/`: everything below is on the
page, and `npm run oracle -- <kind>` prints it.

---

## 1. Every gated entity carries its gate twice

An entity's `hidden if:` refuses that entity's actions now. It did not when you
wrote this, so you wrote the condition again on each action underneath — once for
the screen and once for the engine. The module has forty-one `hidden if:` lines and
a good many of them are the second copy.

The shape to look for is an action whose `hidden if:` is the same condition its own
entity already writes, as at `content/thieving.dsl:1015` and `:1019`, `:1044` and
`:1046`, `:1054` and `:1058`.

Take the action's copy out. Leave an action's `hidden if:` where it says something
its entity does not — `:1019` and `:1033` each add a clause about a door being open,
and that clause is the action's own.

*Done when:* no action writes a `hidden if:` its own entity already writes, and every
route through the module still walks.

## 2. `run-progress` and the roads that mirror a `relocate:`

The five passages of the den's initiation and the warden's office carry conditional
roads — `run-boulder while run-progress >= 1` and its four fellows at
`content/thieving.dsl:1681`–`:1708` — that mirror the `relocate:` lines which
actually move the player through them. You wrote those roads to quiet a remark about
unreachable rooms. That remark is gone: no reading of the roads can keep up with the
ways a `relocate:` reaches a room, so it read only `adjacent:` and called every such
room stranded.

Take the mirrored roads out, and `# flag run-progress` with them along with every
`add:` and `unset:` that keeps it — it exists only to gate those roads.

*Done when:* `run-progress` is gone from the module, no road mirrors a `relocate:`,
and every route through the module still walks. `wardens-door.unlocked` on the
office road is the same shape; take that road out too, and leave the flag, which the
door itself reads.

## 3. The two sets of urchins are one entity now

An `examine:` is a line the game says, so a `{condition: words}` fragment holds in
one. It did not when you wrote this, so what a player sees of the children by the pear
cart changes by there being two sets of them: `street-urchins` at `:824` and
`well-fed-urchins` at `:829`, standing in the same location, with complementary
`hidden if:` lines and nothing between them but the words of the `examine:`.

Make them one entity and let the fragment do what the pair did — the flag that used to
pick between them is the condition inside the braces. `npm run oracle -- entity` prints
the fragment forms; `{<condition>: <words>}` is the one you want, and a line left with
nothing once its fragments are weighed is not said at all rather than said blank, so a
whole line may be conditional. `talk:` in six routes names `street-urchins`, so that is
the id to keep.

**The two widows look like the same shape and are not.** `the-widow-at-the-door` stands
on `tulsa.well-lane` and `the-widow-inside` in `thieving.widows-house` — one character
in two rooms, not one character in two states, and a fragment has nothing to say about
which room she is in. Leave them alone.

*Done when:* the two sets of urchins are one entity whose `examine:` changes on the flag
that used to pick between them, and every route through the module still walks.

## 4. The purse goes into the warden's box whole — check the writing around it

This one is already done in the file and only wants your eye on the words. The
confiscation was two binary ladders, thirty-nine lines each, counting in powers of two
up and then down and stopping at 8,191 coin; it is now:

```
# droptable purse-confiscated
confiscated = take: everything

# droptable purse-returned
give: everything in confiscated
```

`# flag confiscated` is marked `bundle`. The pack and everything worn go in, so a
jailing now strips a player whole rather than taking the coin and leaving the rest,
and the lockbox hands the whole of it back. The `@@@` on `sent-to-jail` that said the
engine could not do this has been deleted.

**Three things around it now read wrong, and they are yours.**

`caught-at-the-stalls` rolls `purse-confiscated` only behind `if inventory.core.coin
>= 1`, and says *"The purse comes off your belt and he does not count it. That goes up
to the warden's box"*. The gate is now the wrong question — a player carrying a hood
and a set of picks and no coin walks away with all of it — and the line describes a
purse where the whole pack is meant. Ask whether they are carrying anything, and say
what is taken.

The warden's-box line at `content/thieving.dsl:1525` says *On top of everything else
in the box is a purse with a paper tag tied to it*. It is not a purse any more.

And `sent-to-jail` at `:665` takes nothing at all, though jail is where a stripping
would belong. Do not add one — whether jail should strip is the owner's call and it is
written down in `docs/thieving-expansion/open-human.md` — but do not write around it
either.

*Done when:* the lines a player reads at the taking and the giving back describe what
is actually moved, and the branch that decides whether anything is taken asks about
what the player is carrying rather than about coin.

---

## What else changed under you, in one line each

None of these asks for an edit; they are here so you do not work around them again.

- **A `{fragment}` is weighed wherever words reach a player**, not only in dialogue —
  an `examine:`, a `say:`, a journal line. `{{` is a brace of its own.
- **`them.<stat>` is refused where nothing is aimed at**, rather than quietly reading
  the actor's own stat. A dialogue line has no *them*.
- **A thing with no sheet is asked for no stat**, rather than being handed the stat's
  own base.
- **`stop` stops** — the rest of the body it stands in, the rest of a `# droptable` it
  was rolled from, and the body that rolled it.
- **A `use:` a route makes that the engine refused says so to the route**, so a
  `refused` line after one is meaningful.
- **A gate an action sets itself ends that action**, whichever of `hidden if:` and
  `requires:` it is written as.
- **A road may be written out**: `-adjacent: <location>` under a `# location` means
  there is no road out of here to that place, and it stands against a far end that
  writes the road back. Writing the whole `adjacent:` line again to drop one road is
  no longer the way.
- **A plain `always` node is a greeting**, said only when no thread of theirs is open,
  and it never joins a list. `when: always` is the opposite word: a thread that stands
  open whatever the state of the world, and that is how an unconditional line is put up
  beside the rest. Two of this module's overlay nodes on `tulsa.guardsman` are `when:`
  nodes that wanted to be unconditional — `when: always` is what they should say.
- **Talking to somebody with one thing open says it outright**, with no list. A route
  that writes a thread line before its choice will be refused; write `choose: continue`.
- **A `# save` body may write its ids short**, the way every other line may.
- **A counter answers to a short id.**
