## A second body at a nested action id eats the first, and one of thieving's beats is already gone

`content/thieving.dsl` and `content/attention-to-detail.dsl` both write a plain, non-`+` body
at `watch the castle windows:` on `# location tulsa.market-rooftops`. `tulsa.dsl` declares the
location and gives it no such action, so both are lay-overs, and the later one wins.

**Verified from the built registry rather than by reading**: `npm run probe -- content --show
location.tulsa.market-rooftops` holds only `attention-to-detail`'s body. thieving's `set:
castle-watched`, its `xp: thieving 5` and its whole `say:` are not in the world. `# flag
castle-watched` is declared, referenced by its own vanished body, and **can never be set by
anything**. Nothing refused it, remarked on it, or went red.

The grammar says this about a top-level `# action`: *a second body at one of these ids is the
section, and the one already there is gone.* For an action nested under a location it says
nothing, and the silence is the fault — two modules can each believe they own a beat.

Two halves to closing it. The **engine** half is a refusal, the way two `# ladder` sections
naming `seconds to fell an even match` became a load refusal: a second plain body at a nested
action id is almost always a `+` somebody forgot, and the corpus cannot say which module owns
the beat. The **content** half is deciding what that action should do, since both bodies want
it — thieving's first-look payout and attention-to-detail's contest are not in conflict and a
`+` would carry both.

*Closes when:* a second plain body at a nested action id is refused with a message naming both
modules, and `castle-watched` is either set by something or deleted.

## The four cross obstacles type their damage twice each, and the sheet field for it is empty

Each of the four writes `if not resource.core.health > N: roll: hauled-out` and `if
resource.core.health > N: drain: N core.health` — the same N twice, per obstacle, four times
over. They omit `npc-thieving-damage`, which `# action steal` already reads, while twenty-two marks in
the file now declare it — so these four are the exception rather than, as this line first said,
the rule.

Raise the pit's drain and miss its guard and a player just above the old threshold is drained
past zero instead of hauled out, and the `hauled-out` path — with the `smirking-rogue` dialogue
that only fires off it — silently stops being reachable at that band.

**Half of this is blocked and the block is the interesting part.** The number belongs on the
sheet as `npc-thieving-damage`. The *guard* cannot be derived today: a condition's right-hand
side takes only a number, so `resource.core.health > them.npc-thieving-damage` is not
sayable. Until it is, the second copy stays and wants an `@@@`.

*Closes when:* the damage is one number on the sheet, or the grammar can compare a pool to a
stat and both halves derive.

## One scene is written twice under two stages

`thieving.dsl`'s `stage an-offer` and `stage thinking-it-over` carry the same four lines
verbatim — two long `say:` bodies, `roll: the-lookouts-share`, `goto kept-watch`. Reword the
scene or re-gate the roll and the second-thoughts path plays the old one.

*Closes when:* the accept and the second-thoughts path reach one scene.

## Nothing fires on a player entering a room, so the warden jails whoever speaks to him

The brief sends anyone the warden finds in a room with him back to the cells. There is no
trigger for entering a place, so he does it to anybody who speaks to him, and the way past
him in the cells is to walk past. The rest of the brief stands as asked: he is lured down by
a racket or out to the mess by doughnuts, is gone five minutes, and the office door and the
lockbox both check whether he is back before they open.

Ruled 2026-09-05: **build `on enter:`** — a result a `# location` takes, fired when the
player arrives.

*Closes when:* a location may carry `on enter:`, the oracle prints it, and the warden jails
on sight rather than on speech.

## Luck is fed by three jewels' worth of passives and read by one line in the world

`# stat luck` is fed by `luck-1`, `luck-2` and `unique-luck-thieving`, and the only line in
the whole corpus that reads it is a `luck vs 60:` on the tutorial dresser at
`content/first-steps.dsl:605`. `rewards scaled by: <stat>` exists on the action page — it
reaches every amount an action hands over, wherever that amount was written, so no list has
to know the stat exists — and the only action carrying one is fishing's `haul`.

Ruled 2026-09-05: **`rewards scaled by: luck` goes on `# action steal`**, and every pocket
and chest follows it.

*Closes when:* the line is written in `content/thieving.dsl` and the routes through the
pockets and chests still walk.

## `cluster-effect:` is its own keyword where it should be an ordinary modifier

`cluster-effect: +25% max-health` is a keyword of its own on `# item`, and declaring it makes
that item an **orb** — which the oracle refuses to combine with the `item-level:` that makes an
item a base:

    cluster-effect: makes probe-hood an orb, which is exclusive with
    the item-level: that makes it a base

Ruled 2026-09-05: **it should read like any other mod** — `+10% increased effect of allocated
thieving passives`, written where `tools, +15% thieving-ability` is written and folding into
the flat-then-percent arithmetic every other modifier folds into. Then an orb is not a kind of
item at all: it is an item carrying that modifier, and the exclusivity goes with the keyword
rather than being lifted as a special case.

What that needs is a modifier whose subject is a set of allocated passives rather than a stat.
`<modifier>` today is `+<amount> <stat>` and `+<percent>% <stat>`; this is the first one that
names something else.

The rogue's outfit is what the change is for. The brief asks that each piece boost *thieving
related stats of allocated passives by 15%*, and because gear cannot say that, what ships is
`+15% thieving-ability` on the hood and chestwrap and `+15% thieving-rate` on the legwraps and
sandals at level 30 — two stats standing in for one effect.

*Closes when:* the effect of allocated passives is a modifier an item may carry beside its
others, `cluster-effect:` is gone as a keyword, the five orbs in `content/combat.dsl` are
ordinary items written with it, and the four outfit pieces say the 15% the brief asked for.

## A timed buff shows in the carried list, so the world's own timers read as the player's

`the-warden-is-downstairs`, `the-warden-is-at-his-doughnuts`, `the-watch-is-elsewhere` and
`the-sand-is-running` are `# item` buffs that exist to hold a stretch of world time — the
warden being gone five minutes, the watch being elsewhere. They are carried, so they show up
beside the things the player is actually carrying, and read as something they have rather than
as a clock running somewhere else.

**The engine must not work out which buffs these are.** Whether a buff is shown is a fact
about it that the author states, exactly as `food` and `stacks` are stated: the oracle's
`<tag>` line says a tag is *a word of your own, carried and never read — the engine acts on
the words below and on no other*, so a tag the engine reads is the mechanism already there.
Inferring visibility from what a buff does would be a guess standing where a declaration
belongs, and the four above are only alike by accident.

*Closes when:* a buff declares whether it is shown in the carried list, the four warden and
watch timers declare that they are not, and nothing in the engine asks what a buff is for.

## Failing the market stall takes the player's action away with nothing said

Reported from play: failing the theft at the market square stall should raise a dialogue that
stops the action and has to be clicked through, so the player knows what happened and the run
does not simply continue. What happens today is the ordinary refusal, which says its line into
the log while the action carries on.

*Closes when:* the stall's failure raises a dialogue that ends the action under way, and the
player clicks through it before anything else happens.
