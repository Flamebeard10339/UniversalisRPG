# What is still wrong that a lane can take

**A line is deleted the day it closes.**

---

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

## `# action cross` restates `# action steal` in the file where five siblings extend it

`thieving.dsl`'s `cross` writes `attempts: 1`, `accuracy: us.thieving-ability vs
them.npc-thieving-difficulty` and `on success: xp: thieving them.npc-thieving-xp` — all three
byte-identical to `# action steal` above it, which `pick-pocket`, `pick-the-lock`,
`pick-the-door`, `slip-past` and `lift-from-the-stall` all reach with `extends: steal`.

Re-point what a thieving contest is rolled on, or change how thieving xp is credited, and every
thieving action in the game follows except the initiation run, which keeps the old rule with
nothing red.

The one line `cross` does not want from `steal` is its `on attempts exhausted: drain:`, which
is the same knot as the line below.

*Closes when:* `cross` extends `steal` and states only what is its own.

## The four cross obstacles type their damage twice each, and the sheet field for it is empty

Each of the four writes `if not resource.core.health > N: roll: hauled-out` and `if
resource.core.health > N: drain: N core.health` — the same N twice, per obstacle, four times
over. They are also the only thieving subjects that declare `npc-thieving-difficulty` and
`npc-thieving-xp` and omit `npc-thieving-damage`, which `# action steal` already reads.

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
