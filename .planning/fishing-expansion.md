# Fishing Expansion Design Doc

This document details the fishing expansion. Every addition goes in `content/fishing.dsl`. Fishing has been isolated the way thieving was: nothing outside that file names a fishing id any more, and the file is the whole skill — the water, the tackle stall, the fish, the gear, the jewels, the cooking recipes for every fish, the crafting recipes for every line and net, and the routes that walk them.

The isolation runs the other way round from what it looks like. `tulsa` no longer depends on `fishing`; `fishing` depends on `? tulsa`, and reaches into the town by writing over sections tulsa declared. A heading naming another module's id opens a body that is laid over the one there keyword by keyword, and a `+` line adds to what that keyword already holds rather than replacing it. That is how the water is stocked today:

```
# location tulsa.riverside
+entities: shrimp-shoal, anchovy-shoal

# entity tulsa.player
+skills: fishing
on line-parted:
  ...
```

Everything below is written the same way: a new entity or item or dialogue is declared in fishing.dsl with a short id, and the town section it stands in gets a `+entities:` or a `when:` node laid over it from fishing.dsl. A wholly new place — the mere — is a `# location` of fishing's own, and reaches the map by writing `adjacent: tulsa.the-narrows`, since a road answers from both ends. Do not edit tulsa.dsl, cooking.dsl or crafting.dsl; a change that seems to need one is a patch section in fishing.dsl instead.

Match the style already present in thieving.dsl. That module is complete. Prefer descriptive examine text over dramatic descriptions. Prefer grounded dialogue over dramatic dialogue. This world is a realistic fantasy immersion, not a story book. Words said by the narrator/universe like examine have no opinion about the object or person being examined. Dialogue should always contain some sort of emotion or desire leaking through the words. 

Note that some mechanics may not be expressible with the current grammar. Mark those with @@@. Most should be expressible, and if they aren't don't try working around them. Work around just need to be removed later. Note that this is not a balance pass, implement roughly reasonable numbers and move on. 

## What is already there

Read `content/fishing.dsl` before adding anything — all of it is in there now. What exists, so nothing below is built twice:

- One action, `cast`, contested `fishing vs depth`, with a line that parts on exhausted attempts. Every fish is an entity with a `depth` stat that `uses: cast`. This is the shape: one action, and the water it lands on says what it pays. Do not add a second casting action per method or per water. If a method genuinely needs a different pace or contest, that is `rate:` or `accuracy:` written on the entity's own `cast:` body, the way the trout run already slows the rate to 4.
- Three waters, all on the one river, going downstream, each a `+entities:` laid over a tulsa location: the Water Gate shingle (shrimp, anchovy, nets only), the Deep Water (trout, salmon, and the blowfish hole from the bar's crawl), the Narrows (pike at level 11, sturgeon at level 16). Nothing is fishable past level 16, which is the gap this expansion fills.
- Gear on four slots: mainhand (net or rod), offhand (bait), gloves (line), head (hat). Body, legs and boots carry nothing for fishing yet. Top of the current ladder is the horsehair line at level 15.
- Four cluster jewels, each dropping off one water. Bait is spent per cast by the `spend-bait` droptable against the `bait-persistance` stat.
- Aggie, the fishwife on Kiln Lane, has one line and buys nothing; she is tulsa's, and anything fishing has to say through her is a `when:` node laid over her dialogue. The tackle stall on Market Row — the `fishing-supplies` shop and entity, both fishing's own — sells the gear and twenty herring on ice, and buys nothing. Sunny at Sha Dynasty's already runs the blowfish quest; she is spoken for.
- The swamp beyond the Marsh Gate exists as `tulsa.swamp-mire`, and nothing in it is fished.
- The tutorial leans on fishing and comes out lopsided. Miki's unlock asks the player to reach a second level in any skill, and the only skill in front of them is fishing: a shrimp pays 18 xp against 1000 for the first level, so the route takes **56 casts and 147 seconds of game time** and the apology route ends with fifty-six raw shrimp in the pack. That is a fishing number, so it is this expansion's to fix rather than the tutorial's. Three answers were on the table — the first level is too expensive for a tutorial, netting is too cheap, or Miki should be asking on a route where the rats are already levelling attack — and the first two are yours to pick between here. `npm run simulate-activity` reads it rather than reckons it.

## A short glossary, for an author who does not fish

Every term below is real, and the mechanic that follows it is what the term becomes in the game. Use the words in prose and dialogue; anglers talk like this.

- **Swim**: the patch of water in front of where you stand. A fish entity is a swim.
- **Peg**: in a match, a numbered swim drawn by lot, so nobody picks the best water for themselves.
- **Match, weigh-in, keepnet**: an angling contest runs for a fixed time; every fish caught goes alive into a keepnet staked in the water; at the end the nets are lifted and weighed. Heaviest bag wins, and there is usually a second prize for the single biggest fish.
- **Tackle**: everything but the fish. **Rod, line, hook, float, shot** (small lead weights pinched on the line), **landing net** (the little net you lift a hooked fish out with), **creel** (a wicker basket worn on the hip for the catch), **priest** (a short weighted club that kills a fish with one tap, named for administering the last rites).
- **Bait** is something a fish eats: worms, maggots (called **gentles**), bread paste, a strip of dead herring (**deadbait**, which is what pike take). A **lure** is something that only looks like food: a spinner, a spoon, a feathered fly.
- **Float fishing** hangs the bait under a float and you strike when the float goes under. **Ledgering** sits the bait on the bottom on a weight and you watch the rod tip. **Spinning** casts a lure and winds it back. **Fly fishing** casts a near-weightless fly on a heavy line. The engine has one cast; these are words for prose and for gear examines.
- **Playing a fish**: after the hook is set, the fish runs and you let it, keeping the line tight and never so tight it parts. `line-health` is this. A big fish on light line is played for a long time; a broken line is a fish that ran harder than the line could take.
- **Spate**: a river high, fast and coloured brown after rain. Trout feed hard in a spate; a salmon pool in spate is unfishable.
- **Dusk rise**: the half hour at dusk when insects hatch and every fish in the river comes up to feed. Dawn and dusk are the hours anglers keep; midday in bright sun is the worst.
- **Water bailiff**: whoever a landowner employs to keep other people off their fishing. Rivers were owned bank by bank, and taking a fish off someone else's water was theft.
- **Poaching**: fishing water that is not yours, or fishing it in a way that is banned. **Night lines** are baited hooks tied to the bank and left overnight. **Tickling** is lying on the bank with your hand under a trout, stroking its belly until it goes still, and flipping it out onto the grass. **Netting a pool** is stretching a net bank to bank across it and taking everything.
- **Eel traps** are wicker pots, baited with offal, set in slack muddy water in the evening and lifted in the morning. Eels are caught asleep, and an eel out of the water is a rope that does not want to be held.
- **Tench** live in still muddy water and feed at dawn; the sign of them is a patch of fine bubbles on the surface. **Carp** are big, still-water fish that are very hard to fool. **Perch** are striped, spined down the back, and hold near posts and piles. **Grayling** are a clean-water river fish taken in winter.

## Base content

Add another tier of gear and jewels so progression has a way to go after level 20, and add water for it to go to. Currently the sturgeon hole at level 16 is the top of the world.

### New water

Two or three new swims, and the fish in them, with `hidden if` thresholds stepping up from where the sturgeon hole leaves off. Roughly:

- **The eel bed** in the swamp mire (level ~18). Still, black, and it smells. Eels are not cast for: an eel trap is set in the evening and lifted later. That is one entity with two actions, `set the trap` (spends a bait, marks the trap as soaking on a timer, the way the market watch's return is timed in thieving) and `lift the trap` (offered once the soak is over, gives eels, sometimes something that is not an eel). @@@ if a buff's timer cannot gate an action the trap is lifted at once and the note says so.
- **The tench hole** in the swamp mire (level ~22). Bubbles on the surface at the edge of the reeds. Rod, and bread paste rather than wrigglers, which is a new bait.
- **The mere**, a new location past the Narrows where the valley opens out into a lake (level ~26). Carp and perch. Carp are the hardest fish in the world to hook and fight for a very long time, so a high `depth` and a low rate; this is where the line tier past horsehair earns itself.
- **Old Slate**, in the sturgeon hole (level 30). The sturgeon hole's own examine already says something down there is older than the town, and this is it: a single named fish, a separate entity in the same location, hidden until level 30 and hidden forever once landed. It parts any line that is not the top tier, and it drops the top jewel and a head. See *The One That Got Away* under miniquests for what the head is for.

Every new raw fish wants a cooked item and a `# recipe` in fishing.dsl at a skill in step with the fish, the way pike and sturgeon already have one there. The recipe names cooking's skill and station whole — `station: core.stove`, `skill: cooking.cooking 8`, `burnt: cooking.burnt-food` — and nothing is added to cooking.dsl. Smoked eel would want a smokehouse station that does not exist; leave it as a cooked-eel recipe and note it with @@@.

### New bait

Bait sits in the offhand and is spent by `spend-bait`. Add two, and each new water's `requires:` names which bait it takes, so bait is a choice and not a ladder:

- **Bread paste**, cheap, for tench and carp. Sold by the tackle stall.
- **Herring strip**, deadbait, for pike and for Old Slate. Not sold: it is cut from the herring the tackle stall already sells, which is an action written on the herring item itself (`item.herring.cut for bait`, gives three strips). An angler who has been buying herring to eat now has a reason to buy it that the stallkeeper can remark on.

### New gear

A set at level 25 to 30, item-level around 20 to 30, on the three slots fishing does not use yet and above the top of the slots it does:

- **Greenheart rod** (mainhand). Greenheart is a heavy, dense timber that real rods were made of; it bends and does not break. +fishing, +max-line-health.
- **Rod and winch** (mainhand, level 30). A rod with a reel on it, so a running fish is given line instead of breaking it. The biggest +max-line-health of anything, at a cost to fishing-rate: a winch is slow.
- **Dressed silk line** (gloves). Braided silk, oiled. Above horsehair.
- **Fisherman's gansey** (body). The tight wool sweater fishermen wore, knitted in a pattern that named the village so a drowned man could be sent home. +fishing.
- **Waders** (legs). Lets you stand in the river. +fishing.
- **Hobnailed river boots** (boots). +fishing-rate, since you are not slipping.
- **Creel** — there is no slot for a basket on the hip, so this is the name of the level-30 body piece if the gansey reads too low, not a fifth slot.

Where it is sold: the tackle stall stocks the bread paste and the greenheart rod. The rest comes from miniquests and from Hob (below), who mends tackle and sells the winch and the silk once he thinks the player can be trusted with them.

### New jewels

Thieving's second class of jewels gave specific, larger bonuses rather than more of the flat ones. Fishing's do the same, and each is named for a real piece of tackle or a real thing anglers say:

- **A Good Bag**: a new stat, `haul`, that `cast` reads as `rewards scaled by: haul`, so every fish and every xp line on every water pays more without any water knowing the stat exists. This is one line on `# action cast` and is the one engine-facing edit in the expansion. The jewel's passives feed `haul`. Drops from the carp.
- **The Priest**: +fishing per level of fishing, so it grows with the angler. Drops from Old Slate.
- **Tight Lines**: line regeneration and a large max-line-health, the wheel shape. Drops from the eels' trap, rarely, as something that was in the pot that was not an eel.
- **The Pirn** (an old word for a reel): fishing-rate, the biggest of them. The prize for the fishing contest, and nowhere else.

## Diegetic in game responses. 

The main goal of this expansion to make the world feel alive. This will be done by having the world react to the actions the player takes. This is explicitly **not** a karma system. Do not implement a global scalar consisting of one or more counters that track reputation with various factions or the player's 'ethics'. This is known not to work in various other games.

The main point is: track specific acts rather than a sum, make reactions local and witnessed, and show the reaction rather than the number. A visible meter turns ethics into a score to farm. A fully hidden one makes consequences feel arbitrary. The compromise most games landed on is that the NPC dialogue is the meter.

Thieving has done this already. Learn from it. Concretely, from `docs/thieving-expansion/` and `content/thieving.dsl`:

## Miniquests

Miniquests are single game interactions offering the player some dialogue and/or a choice with a reward. They make semi-permanent changes to the game world. 

Miniquests have consequences. Local consequences include changing what reward or punishment (if any) the player receives after completing the miniquest. Global consequences are entirely composed of binary dialogue switches that encode memory of what (specifically) the player did. 

### Fishing Contest

Once the player is past level 10 the shingle at the Water Gate has a match on it: a rope of pegs along the shingle, a weigh-master with a steelyard, a keepnet in the water at every peg, and a rival, Fenn, who has won it four years running and says so. Entry is 20 coin. The prize is The Pirn and a mention. The match is judged on a single fish, the biggest, because nobody on that shingle trusts anybody else's count.

The match is on while a buff the weigh-master gives on entry lasts (five minutes of game time). Any fish landed in that time may be presented. Fenn's fish is a salmon, and the weigh-master says so at the weigh-in, so the player knows what they have to beat. The weigh-in is a dialogue with a `when: has <fish>` branch per fish the player might carry: a trout loses, a salmon ties and Fenn keeps the title, a pike or a sturgeon wins. The buff running out before anything is presented is a loss, and the weigh-master says so to anyone who talks to him after.

-> player fishes it straight and wins: The Pirn, and the weigh-master's hand. Fenn is sour, and stays sour: on every visit after he has a reason the water was wrong that day. The people on the shingle have a new thing to talk about, and one of them asks to be shown how.
	Consequences: The tackle stallkeeper has heard, and knocks the talk of a discount into the price of the greenheart rod without actually lowering it. Aggie says the fish Fenn sells her have been smaller lately, and does not say why she is pleased.
-> player presents a fish that did not come out of the river: A herring off the tackle stall's ice, or anything bought, is a `when: has herring` branch, and the weigh-master turns it over once. "This one has been on ice." The player is put off the shingle, the entry is kept, and the match is not offered again.
	Consequences: Fenn tells it to everyone. The tackle stallkeeper asks, every time, whether the herring is for eating. The people on the shingle have a `when:` line about the one with the cold fish. The guards on the Water Gate do not care, and say so if asked: nobody died.
-> player presents a fish taken out of Fenn's keepnet: A thieving action on the keepnet at Fenn's peg, offered only while the match buff runs. Fenn's salmon becomes the player's salmon, and the tie goes the other way because Fenn now has nothing to weigh. Success is not witnessed by the weigh-master. It is witnessed by Fenn, who cannot prove it.
	Consequences: The player wins The Pirn. Fenn's dialogue is the only memory of it, and it is specific: he knows what was in that net, and he knows it was a salmon, and he will say it to the player every time he sees them without once saying the word thief. Nobody else in town changes.
-> player loses honestly: Fenn is gracious in the way of a man who expected to win. The match is offered again after the buff's timer has gone round, at the same fee.

### The Water Bailiff

The salmon pool in the Deep Water is the castle's water, and always was; nobody told the player because until now nobody was watching. A water bailiff, Marle, now walks it. This is fishing's version of the rotating market watch and is built the same way: an entity that stands in the location, is sent away by a wait the player takes at the bank ("wait for him to move up the river", twenty seconds), and comes back on a buff's timer three minutes later. @@@ this is a rotation the player starts rather than one that happens to them, for the reason thieving's open-human.md already gives.

While Marle is present, a cast on the salmon pool is much harder (write the contest on the entity's `cast:` against a higher `depth` for the duration, or against Marle's own stat; whichever the grammar takes) and a failed cast is a caught poacher. A counter of how many times the player has been caught escalates what he does:

1. A word. He asks the player's name and does not write it down.
2. He takes the fish. Any raw salmon in the pack.
3. He takes the fish and the line. The line off the gloves slot, not the rod.
4+. He takes the fish, the line, and a fine of coin, and marches the player to the Water Gate. Guards there have a `when:` line about who has been marched past them, and it is not friendly.

Talking to Marle when not caught is possible and he is pleasant. He fishes, badly, on his own time. The counter is the only memory and he cites it: on the second catch he remembers the first.

-> player buys a permit: Marle sells a day on the water for 40 coin, which is a buff that lasts the same three minutes his rounds do, during which a cast on the salmon pool is not poaching. This is the honest ladder and it is expensive on purpose.
-> player never fishes the salmon pool while he is there: Nothing happens, and nothing changes. He greets the player as a regular after a while (a `when:` on a flag set by fishing the pool honestly several times while he is present).

### Hob's Traps

Hob lives in a hut on the swamp edge, sets eel traps in the mire, and cannot get out to them any more since his knee went. He will show the player where they are and ask them to lift them for him, for a share of the eels.

-> player accepts: The eel bed entity is discovered. The trap's `lift` action, while the player is doing it for Hob, hands half the eels to Hob and half to the player; after three lifts Hob gives the player a trap of their own (a flag; the eel bed's actions read it) and from then on the eels are the player's. Hob sells the rod and winch and the dressed silk line from then on, and a `when:` line on him says he is glad of the company.
	Consequences: Aggie has eel in the pan now and says where it came from. The people on the shingle say Hob has somebody.
-> player lifts the traps and keeps the eels: Hob knows how many traps he set. On the next visit he asks how the lifting went and the player may say the traps were empty. He does not believe it, and does not say so. The eel bed is still discovered; the player keeps fishing it. Hob does not sell anything, ever, and his `again:` line is about the weather. The traps stop being reset, so the `lift` action stops giving anything after the first: he is not baiting them any more, and the player has to buy bait and set them themselves.
	Consequences: Aggie has heard Hob's traps came up empty for the first time in thirty years, and looks at the eels the player sells her.
-> player refuses: Nothing is lost. He asks again on every visit, more briefly each time, and stops after three.

### The Boy at the Narrows

There is a boy at the Narrows, Rook, from the doss house, tickling trout out from under the bank with his sleeve rolled up. It is the castle's water, and he is thirteen, and he has a sack. He asks the player not to say anything.

-> player says nothing: He is there on later visits. The sack gets emptier over time; he is not a good poacher. A `when:` line on the doss house's people says one of theirs has been bringing fish home.
-> player teaches him: Requires the player to own a rod and to have a spare small net to give him. He is given the net (an item taken from the player), and from then on he stands at the Water Gate shingle with the people who are not fishing, fishing. The tackle stallkeeper notices the net, and says so with a question in it. This is the fruit-stall shape from thieving: no reward, the world is different afterwards.
	Consequences: Marle has a `when:` line about a boy who used to be on his water and is not any more, and he does not know why, and it is the only thing he says that sounds like relief.
-> player tells Marle: Marle goes to the Narrows and the boy is not there afterwards. Marle gives the player nothing; he says it is his job. The doss house's `when:` line is about one of theirs being taken up to the castle, and the person saying it looks at the player while saying it. Rook is at the Water Gate afterwards, not fishing, and does not answer when spoken to.

### The One That Got Away

Everybody in Sha Dynasty's has a story about the thing in the sturgeon hole. Three anglers at a table, each with a size for it, and Fenn's is the biggest. Landing Old Slate gives a head, an item with no value, and a sturgeon that is not the ordinary kind.

-> player shows the head at the tavern: A dialogue choice with the three anglers, `when: has old-slate-head`. The head is taken. One believes it, one does not and says the head is a sturgeon's like any other, one asks to see the scar on the gill plate that the story always had and goes quiet when it is there. From then on, three `when:` lines: one calls the player the one who landed it, one calls the player the one who says they did, and Fenn buys a drink and does not talk about the contest that day.
-> player gives the head to the tackle stall: It is nailed over the stall from then on (a `{flag: words}` in the stall's examine). The stallkeeper says the shingle has been busier since. This and the tavern are exclusive: there is one head.
-> player gives the head to Aggie: She cooks it. It is the best thing in the house for a while, and she says so, and she says the head was too old to be worth it and that she did it because nobody else would have.

## Dusk

There is no clock, but anglers keep the hours, and the world should say so. At the Deep Water and the Narrows, a `wait for dusk` action at the bank (twenty seconds) grants a buff, `the rise`, lasting three minutes, during which every rod water's rate is better and the prose on a cast says so. Fenn only fishes the rise. Marle's rounds are during the day; taking the rise and his absence together is what an experienced poacher would do, and the game does not point it out. @@@ dusk is a wait the player takes and not a time that comes; if the town ever runs a clock, this becomes a window on it.
