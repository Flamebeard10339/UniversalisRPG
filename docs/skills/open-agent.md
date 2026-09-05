## An engine trigger has to be declared before a skill can name it

`trigger:` takes one of two things: `on empty | full`, which needs a `resource:` and gives the
author's own word for it — `# event death` over `core.health`, `# event line-parted` over
`line-health` — or one of eight words the engine already knows: `damage-dealt`,
`damage-taken`, `missed`, `evaded`, `completed`, `unfinished`, `level-up`,
`inventory-changed`.

The second family needs no section and has one anyway, because `gain <n> experience on
<event>` and `on <event>:` resolve against a declared id rather than against the engine's own
vocabulary. So a world that wants experience on a landed blow writes

    # event damage-dealt
    trigger: damage-dealt

whose whole content is the word twice. The id, the trigger and the engine's word are one fact
with three homes, and an author reading the oracle page cannot tell why some triggers need
announcing and others do not.

`# event inventory-changed` is the same shape and worse: `content/core.dsl` and
`src/content/fixture/core.dsl` both declare it and **nothing in either world names it**. It is
ceremony for a reference that was never written.

A section still earns its place where it says something the word does not — `# event
damage-taken` also names `resource: core.health`, which scopes which pool's damage counts, and
every `on empty` event is a real declaration. Those stay.

*Closes when:* an engine trigger word can be named directly wherever an event is, a `# event`
is needed only where it adds a resource or a name of the author's own, and the two
`inventory-changed` sections are deleted rather than rewritten.

*Not while an authorbot runs.* `trigger:` is grammar, and a run probes its corpus against this
checkout's parser; changing the vocabulary underneath one breaks whatever it has already
written against the old page.

## Smithing, crafting and woodcutting are still shipped, and were cut from the MVP

Ruled 2026-09-05: **the skills go and the activities stay.** A skill with no proper training
path should not stand in the world; the recipes and items it was attached to may.

All three are still in the corpus, and they reach further than their own modules:
`content/smithing.dsl` and `content/crafting.dsl` each declare a skill and a stat,
`# skill woodcutting` stands at `content/core.dsl:117` declaring no stat at all,
`content/crafting.dsl:73` gates a recipe on `level.crafting >= 15`, `content/combat.dsl`
leans on both packs and carries smithing recipes with `rate: smithing`, `content/tulsa.dsl:952`
names all four skills in one line and `content/tulsa.dsl:1328` asserts
`xp.core.woodcutting > 0`, and `content/a-grand-blade.dsl` is a whole quest built on smithing —
fifteen iron bars, a hammer, `skill: smithing 650`.

So this is not a deletion of three sections. Every `xp:` paying one of them, every `rate:`
reading one, every gate and every route that asserts against one has to say what it says
without a skill behind it.

*Closes when:* no `# skill` remains for the three, `npm run oracle -- --at content` is clean,
and the routes that walked through them still walk — including `a-grand-blade`, which keeps
its steps and stops training anything.

## Gear that refuses to be worn says nothing

`requires:` on an item is built — the iron set asks ten of both combat skills and the
Knight's Sword asks twenty Attack. The carried screen asks the same gate the equip directive
asks, so a player under the level is offered **no Equip verb at all** and told nothing about
why. `engine.equip.requires` reaches them only down the directive path, which the app does
not use.

Ruled 2026-09-05: **the verb is present and refuses out loud**, and the refusal is first
person — *"I can't wear that yet."* That is a change to the line in
`src/content/engine/engine-en.dsl:54` as well as to the screen; the line there today is
second person and reads *"You are not the {item}'s match yet, and it stays in your pack."*

*Closes when:* the carried screen offers Equip whatever the level, refusing with that line,
and the engine line reads in first person.

## A stretch is one number and can only be the player's

`inflict: <buff> for <duration>` takes a stat and reads it off whoever the buff lands on,
which is the player — so a mark's own grip cannot be in it. What ships is one
`thieving.daze-duration` at four seconds, uniform across a townsman, a guardsman and a
knight, with `brazen` and `tough` taking a percentage off it. Everything else that varies by
mark is already an `npc-` stat read off the mark.

Ruled 2026-09-05: **the base is the mark's — a knight holds a caught hand longer than a
civilian — and the player's daze resistance shortens it.** Two numbers from two sides, not
one named by the player alone.

`xp:` and `drain:` learned `[<side> ]<stat>` in the same pass, so the shape already exists
and reads `for their grip`; it is `durationOrStat` in `src/grammar/values.ts` that has not
been given a side, beside the `amount` parser in the same file that has one.

*Closes when:* `for <duration>` takes a side the way `<amount>` does, the marks carry their
own hold, and a resistance read off the player shortens a stretch that was read off somebody
else.
