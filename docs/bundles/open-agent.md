# What is still wrong that a lane can take

A bundle is a world value a variable can hold — a purse of confiscated coin, the
buffs pulled off a target, one shop's stock on its way into another. Nothing in the
language can hold one today: `# variable` holds `value: <float>` and `state.flags` is
`Record<string, boolean | number>`, so the whole named-value store is scalar.

**A line is deleted the day it closes.** The shape below is settled — it was argued
out on 2026-09-02 and what is written here is the conclusion, not the options. A lane
can take it to the end without asking.

---

## Nothing can hold a bundle, so a world edit that moves several things is written by hand

`content/thieving.dsl` takes the player's coin into the warden's lockbox and gives it
back with **two binary ladders** — `if inventory >= n: take: n` in powers of two, up and
then down — because `take:` past what is held is a no-op and nothing stores an amount.
Both ladders stop counting at 8,191 coin. Gear cannot be moved at all: `take:
everything` destroys what it takes and there is nowhere to put it.

The same hole is what would stop a weapon stealing the marks off a target, or two
shops being consolidated. All three are one shape — *move a bundle from one holder to
another* — and none of them needs to read inside the bundle.

### The shape

**A result may be bound on the line that writes it.** `purse = take: everything`. Not a
prefix line: binding syntactically makes *nothing follows it*, *the next line yields
nothing* and *two of them stacked* unrepresentable rather than refused.

**What a result yields is a fact of that result's kind**, declared where the kind is
declared, so nothing is enumerated elsewhere. Most yield nothing, and binding one that
does is refused where it is written.

**A wrapper yields nothing.** `x = one of:` and `x = if …:` are refused outright. If a
lane reaches for one it writes a `@@@` saying what it wanted, and that is the evidence
for looking again.

**A bundle is opaque to the language.** `count` is the only reading. None of the three
cases inspects one, and structure can wait until something needs it.

**Every move is a transfer between two holders, and a transfer moves what it can.**
`give: purse` moves what fits into the pack and leaves the rest in the purse, so
nothing is destroyed and no arithmetic on bundles is needed. Combining two bundles is a
transfer into a bundle; splitting one is a transfer with a filter. The player's pack
already behaves this way — a grown item cannot be spent (`engine.inputs.grown`), so
`take:` can already leave something behind.

**A bare bundle-to-bundle assignment is refused.** `y = x` either aliases one bundle
under two names, where giving from one silently empties the other, or copies it and
duplicates the player's gear. Write a transfer instead.

**A bundle survives a save, and declares its id-bearing shape.** It is serialised
state, so it lands in a `# save` body. It must say which of its parts hold ids and what
kind they name, so the reference walk reaches into it — a bundle serialised as opaque
json would be a second, larger instance of the bug that the save body already has.

*Closes when:* `content/thieving.dsl` moves the purse into the warden's box and back
with no ladder and no ceiling, gear included; a route walks it; and a route pins that
a give into a full pack leaves the remainder in the bundle rather than destroying it.
