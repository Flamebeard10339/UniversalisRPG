# Combat: the base pass

Every addition goes in `content/combat.dsl`, and it is the only file this run may write.
Read it whole before adding a line. It holds the skill as it stands after being pulled out of
core and the town on 2026-09-04: the two skills and the events they pay on, the bronze and
iron sets and the knight's sword, the pasture and road animals, the town's monsters and the
proving-ground posts, thirteen jewels and five orbs, three archetypes (berserker, juggernaut,
assassin) built on rage, a stacking speed buff, venom and thorns, the meat, hide and bar-stock
recipes, and thirteen routes with their saves.

Combat depends on the town as an optional and writes onto it, the way fishing does: a foe
stands in a town room through `# location tulsa.<room>` with `+entities:`, the player takes
the two skills through `# entity tulsa.player` with `+skills:`, and what a townsman, a
guardsman or a knight drops when killed is a body laid over that entity from this file. Do
not edit `tulsa.dsl`, `core.dsl` or any other module; a change that seems to need one is an
overlay written here. The seven combat stats, the health pool, `core.melee-combat` and the
faint (`core.faint`, which the town's death handler performs) are core's and are not this
run's to touch. `npm run probe -- <your corpus> --off combat` has to go on loading a town
that walks its own routes.

Match the style of `thieving.dsl` and `fishing.dsl`: descriptive examines with no opinion in
them, grounded dialogue with a want leaking through it, no story-book narration. Nothing
diegetic is asked for here — no lessons, no duels, no smith; those are a later wave. This run
is the skill itself: its stats, its gear, its jewels, its foes and rooms, its ladder. Mark
anything the grammar cannot say with `@@@` and do not work around it.

## The grammar this run stands on, new on 2026-09-04

`npm run oracle -- damage-type stat` prints it. A `# damage-type <id>` is a heading and
nothing else. A `# stat` takes one role in a swing beside its base — `deals: <type>`,
`resists: <type>`, or `converts: <type> to <type>` — and `at most: <float> | <stat>` caps any
stat. A swing that lands adds every type its carrier deals on top of the untyped contest the
action names, takes each type's resistance off as a percent, and a resistance reads no higher
than its cap. Untyped damage is the absence of a type: `core.attack vs core.defense` is what
every swing was and still is, and a thief's caught hand or a chest's ward is untyped and
resisted by nothing.

Ruled, and not this run's to reopen:

- The types are **physical, fire, cold, lightning, chaos**, declared here. Everything but
  physical starts at 0 everywhere.
- **The attack skill levels physical damage.** `# skill attack` names a `physical-damage`
  stat that `deals: physical`, so a level is +1 and +1% physical. Weapons grant physical
  damage rather than `core.attack`. `core.attack` keeps its base and is what a monster's
  claws or a townsman's fist do by default.
- **Every type has a resistance stat and a cap stat.** The cap's base is 75 and it is itself
  capped at 90, so gear may raise a cap to 90 and no further. Resistances come from gear and
  jewels only. There is no defense skill and there will not be one: health is the defense
  skill.
- **Monsters are entities like any other**, so a foe carries `fire-resistance 40` or
  `physical-damage 6` on its `stats:` line the way it carries `attack`. A negative resistance
  takes more.
- A chain of conversions that comes back round to a type is refused when the world loads, and
  so is a stat that caps itself. Conversion is for the one or two jewels that make a build
  interesting — half of what is dealt as physical landing as fire — not for every piece.

Group every new stat under `core.combat`, keep the zero ones off the sheet with
`hidden if: not changed.<stat>`, and give the cap stats `hidden if: always`.

## What to write

### The types and their stats

Five `# damage-type` sections. For each type a damage stat, a resistance stat and a cap
stat, physical included. Rename nothing in core.

### The attack skill and the gear

Point `# skill attack` at `physical-damage`. Re-cut every weapon to grant physical damage,
and every piece of armour to grant, beside defense and max-health, a resistance where one
makes sense: bronze resists nothing, iron a little physical, and one piece per set carries
the elemental resistance that the band's typed foe makes worth wearing. Keep each set's
slots, gates and item levels and move only the numbers. A higher item level is what makes a
jewel worth more on a piece, and that, not the flat bonus, is the lever for the top band.

### The foes, in three bands

The rooms exist and the foes already stand in them; the `+entities:` overlays at the end of
the file and the town file say where. Cut each band against the ladder at its gate level,
read with `npm run ladder-check -- --world <your corpus>` and stood on with
`npm run simulate-activity -- <save> --ladder combat.attack=<L>,combat.health=<L> --at <room> --world <your corpus>`.

- **Levels 1 to 10**: the pasture, the sewer rats, the king's road guardsmen. Beginner rooms.
  The sewer is meant to be survivable standing still by a beginner who has eaten.
- **Levels 11 to 20**: the north road's highwaymen, the pinewood's wolves, the tunnel rats
  and the ratmen. One foe in this band deals a type — the pinewood in winter is cold, a
  highwayman with a torch is fire; pick one and let the examine say so — so that the band's
  armour resistance is the answer to something.
- **Levels 21 to 30**: the muster's ratkin warriors, the castle's knights, the swamp's
  lurkers and mollusks. **The muster is a room, ruled 2026-09-04, and not a wall**: a fighter
  of its level in the band's shop gear has to be able to stand in it for an hour. Cut it
  harder than fair and pay it more than fair if you like, but it stops killing that fighter
  in five minutes. The swamp is dangerous water, the lurker jumps you before you can act, and
  something that deals chaos lives there.

A foe's `respawn after:`, health and damage are what set a room's rate, and the rate is read,
never reckoned: `npm run simulate-activity` builds a route per offer and walks it under
several seeds, and dying at seven seconds costs the rest of the hour. Health experience is
paid on damage taken and attack on damage dealt, by the factors on the two `# skill` lines,
so a room that kills the player pays almost nothing on health, because the hour is spent
walking back from where a faint puts you.

### The jewels, rewritten

Every jewel here is in the old shape — a `# cluster-jewel` standing beside a `# item` that
names it — and under a flavour id. Rewrite each in the shape `content/thieving.dsl` uses
(`# item common-general-thieving` is the model): the jewel under its item, as `# item <id>`
with `cluster-jewel:` and the shape, connections and passives indented beneath it, the
flavour kept in `title:`, and the id saying what the jewel *is*, as `<rarity>-<role>-<skill>`
— `common-general-attack`, `uncommon-thorns-health`, `rare-poison-attack`,
`unique-rage-attack`. `npm run rename-section -- item:<old> <new>` writes a new id everywhere
the world reads it, saves included; use it rather than editing ids by hand, and delete each
standalone `# cluster-jewel` once its jewel is written under its item. The heartwood blade's
origin cluster is a jewel with no item of its own, and stays one.

The rarity scheme is the world's, ruled 2026-09-03. **Common** is sold in a shop and is
point-inefficient. **Uncommon** drops at one in sixteen to sixty-four and carries utility and
variety. **Rare** drops at one in a hundred and twenty-eight and is point-efficient endgame.
**Unique** comes off a boss at one in two hundred and fifty-six or worse and does something
nothing else does. Sort the thirteen onto it and give each a source. Today the armourer's
chest is a one-off cache and no shop sells a combat jewel at all, which is why the ladder
audit reads what it reads below. A counter that sells the common jewel and the bronze band
belongs behind the armoury the proving ground is walled off from: write the keeper and the
`# shop` here and stand them in a town room through `+entities:`.

Keep the three archetypes and their mechanics — rage, the stacking speed buff, venom as a
regeneration debuff, thorns — and give each archetype one jewel that adds and one that
multiplies, so half of it is not unreachable. Give one jewel a conversion. Whether the
passives get the same systematic naming (`flat-physical-small`, `increased-attack-rate-large`)
is open with the author, so do whichever is less work and say which you did.

### Routes

A `# test` asks one thing: is this path still walkable. Keep every route in the file walking,
or say plainly which one changed and why. Add one route per band that stands a fighter in
the band's first room and then its last, with the band's shop gear bought and worn, and comes
out alive; and one that buys the common jewel at the counter and slots it. No route asserts
a number a balance pass would move: no experience, no coin, no drop count, no time.

## Balance, and what was measured today

`npm run ladder-check` on 2026-09-04, before this run:

    combat.attack   level 10 asks 63    a shop sells 23  (40 short)    found anywhere 141
    combat.attack   level 20 asks 133   a shop sells 37  (96 short)    found anywhere 170
    combat.attack   level 30 asks 203   a shop sells 53  (150 short)   found anywhere 202
    combat.health   level 1  asks 0     found anywhere 566 over, and 510 over at 30

Read it as: the shops carry none of combat's ladder and drops carry all of it, and max-health
jewels are a pile rather than a ladder. The residual is a brief and never a target: close
most of the shop gap with the common jewel and the bronze band on a counter, and bring the
health jewels down onto a ladder. Print `npm run ladder-check -- --world <your corpus>`
again when you are done and put both tables in your report.

The curve is declared and it moves, so do not restate it. Read what a room pays from
`simulate-activity` at the band's rungs, with the band's shop gear worn in the save you
stand on, and put a table per band in the report: room, rung, attack rate, health rate, and
whether the hour was survived. A band's first room should read near the curve at its gate
and its last room about twice it, the way fishing's waters do. A room that reads over the
curve at every rung above its own is one a player never leaves, and one nobody survives is a
wall.

## Done means

`npm run oracle -- --at <your corpus>` green; `npm run probe -- <your corpus> --off combat`
loading a town that walks; every route in `combat.dsl` walking; the two `ladder-check`
tables and the per-band rate tables in your report; every jewel under its item with an id
that says what it is; and a list of every `@@@` you wrote and what it stands in for.
