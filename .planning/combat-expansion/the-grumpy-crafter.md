# The Grumpy Crafter: the lesson that teaches the plane

Write **one new module, `content/the-grumpy-crafter.dsl`**, the only file this run may write.
It is the first half of the ruling of 2026-09-04 on A Grand Blade: that quest was one thing
doing two jobs, and it is now two. This module is the small half — a miniquest a level-one
character can finish, whose whole purpose is to send the player through socketing a jewel
into a base once, diegetically, and be paid for having engaged with the plane. The other half
stays in `content/a-grand-blade.dsl` and is not this run's; hand out no schematic and do not
touch the bladesmith's son.

Read `content/combat.dsl` whole first, because every jewel, base, item level and plane rule
this leans on is declared there and was re-cut on 2026-09-04. Read `content/thieving.dsl`'s
miniquests (the lookout, the locked-out lady, the fruit stall) for the shape: they are the
model, they work, and this is that shape. Read `content/a-grand-blade.dsl` so that nothing
here reads as a second telling of it.

Depend on `core`, `combat` and `tulsa`. Do not edit any of them. Rooms and townspeople are
theirs; this module stands its own entity in a town room with `# location tulsa.<room>` and
`+entities:`, and gives a townsperson a thread with a `when:` node laid over
`# dialogue tulsa.<entity>`. Mark what the grammar cannot say with `@@@` and do not work
around one. Ask `npm run oracle` what the language allows; never read `src/`.

## Who he is

A crafter in Tulsa who is at odds with the smith's shop, and has been since the old man died
and the shop went to the son rather than to him. He believes it should have been his. He is
not a villain and he is not owed an apology: he is a competent man with no counter to stand
behind, and his grievance is that the town buys from a boy who is still learning because the
boy has a roof and he has not.

**He is outraged if the player questions him** — the claim, the succession, whether he is any
good. Write that outrage as a thread the player can pull and regret pulling; it costs nothing
mechanically and it is most of what makes him a person. Pressed past the outrage, what he
actually says is small and reasonable: he needs publicity, resources, and a stall. That is
all. Give the player the choice to needle him or to ask him what he needs, and let a `when:`
line afterwards remember which.

## What the player does, in order

1. **Meets him and gets the want out of him.** Publicity, resources, a stall.
2. **Brings him three jewels and three pieces of equipment, of any kind.** Any base with a
   plane and any jewel the world sells or drops. He will **complain** where what he is handed
   is low quality or low item level — a shop-tier common jewel in a starter base is worth a
   line of contempt and is still accepted. Read what makes a base low or high off
   `content/combat.dsl` — item level is what decides how many plane points exist — and write
   the complaint off the thing actually handed over rather than off a fixed list.
3. **He sockets them.** This is the lesson. The player watches, or does the last one himself,
   or both — whichever the grammar makes readable; `npm run oracle -- --walk <line>` when one
   line has you stuck. What the player must come away knowing is that a base holds a plane,
   that a jewel goes into a socket on it, and that points are spent to reach the socket.
4. **The player sells the three pieces to civilians.** Not to a shop: to people, by hand, one
   piece each. This is the publicity. **A named townsperson gets special dialogue** and pays
   an additional reward based on whether the piece suits them — a guard wants armour, a
   fisher does not want a helmet, and somebody who has been robbed wants anything at all.
   Work out from `content/tulsa.dsl` who is standing about and what each of them would
   plausibly want; three or four named reactions is plenty and a generic civilian line covers
   the rest.
5. **He gets his stall.** The reward is **his shop**, selling equipment. That is the quest's
   payment and it is the only thing the quest itself pays.

**Every other reward comes from who the player gave the gear to.** The quest hands over no
coin and no experience of its own worth naming; what the player walks away with is whatever
the three civilians paid, which means a player who thought about who wanted what is paid more
than one who dumped three helmets on the first three people in the square. Say that in the
report: what the best and worst distribution pay.

## Balance

A level-one character has to be able to finish this, which bounds what he may ask for: three
jewels and three bases at prices the armoury counter and the world's first drops can actually
meet, and no fight anywhere in it. That bound is about what is *reachable* — what a shop stocks
and what a first drop gives — rather than about numbers to tune, so read it off the shop and
the droptables and say in the report what a level-one player can actually get.

`npm run ladder-check -- --world <your corpus>` reads the kit against the ladder. **Do not run
`simulate-activity` and do not tune.** A passive is written as a share of a level with
`grants:`, and what a jewel is worth follows from that.

`ladder-check` on the shipped corpus, read 2026-09-04 **after the damage ladder was corrected
that afternoon**, says the two halves of the kit are wrong in opposite directions.
`combat.attack` from shops is 46.4 **over** the ladder at level 10 and 51.2 over at 20 — the
world's weapons and attack jewels are cut for a ladder five times too steep and have not been
re-cut yet. `combat.health` from shops is 10.2 **short** at 10 and 63.4 short at 20.

**So the stall does not answer an attack gap, because there is not one.** If it stocks a
weapon at all, that weapon is cut against the corrected ladder rather than against what the
armoury counter happens to sell today, and it will look weak beside the counter's stock —
say so in the report rather than matching the counter. Where the stall can honestly help is
the health side, and only a little: it is a stall a man just got, not a rival armoury, and
what it stocks is the tier a competent crafter with no premises makes.

Read the residual off your own corpus rather than trusting those figures, and say in the
report what the stall moved.

## Done means

`npm run oracle -- --at <your corpus>` green, a `# test` that walks the whole miniquest from
meeting him to the stall opening, one that walks the needling branch, one that shows a named
civilian paying more for a piece that suits them than the generic reaction pays, and a
report saying what the stall stocks, what the best and worst distribution paid, and every
`@@@` you wrote.
