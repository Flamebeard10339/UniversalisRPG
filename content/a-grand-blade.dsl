// A Grand Blade — the smithing quest, read off the design's own four lines.
// The bladesmith is dead, his son cannot take up the mantle because the notes
// are hidden, and the riddle his father left him — a real smith paves his own
// way — is not about a road. It is about the floor of his own forge.
//
// The design calls this a mining quest. `npm run oracle -- skill` names eight
// skills this world has — woodcutting, attack, health, fishing, cooking,
// thieving, smithing, crafting — and mining is not one of them, so there is no
// ore to dig and nothing here pretends there is. The whole of it is written on
// smithing instead: bars bought over `tulsa.forge-counter`'s own counter, the
// way every other blade in the game is made.
//
// The reward is two things, and only one of them the grammar can gate. A
// schematic can be made real: `# recipe grand-blade` asks for
// `grand-blade-schematic` the way `smithing.dsl`'s own recipes ask for a
// hammer — required and never spent, so only a player who was handed one can
// ever make the blade. "We can use their anvil" cannot be made real the same
// way: `npm run oracle -- recipe entity` shows a `# recipe` takes no
// `requires:` and a `# entity`'s `stations:` takes no condition either, so
// nothing in the language can gate a crafting station on a quest flag — the
// same wall `kill-it-with-fire.dsl` hit trying to gate `keeps shop:`, and the
// same answer: `tulsa.anvil`'s `strike it:` refusal is left exactly as
// tulsa.dsl wrote it, and a player could in principle stand at this station
// and craft before ever meeting the son — true before this quest existed and
// unchanged by it. What the quest actually delivers is the schematic, and the
// son's own word that the anvil is his to share now.
//
// No stage here reads a `done when:`, and that is the quest rather than the
// engine: finding the notebook is not what finishes the search, handing it to
// the son is. The stage turns on a second `tulsa.bladesmiths-son says:` block
// gated on `when: has smiths-notes`, which is where he takes the notes off the
// player and gives the schematic back.

# info a-grand-blade
version: 0.1.0
pack: quests
dependencies:
  core
  tulsa
  smithing
  combat

# quest finding-the-notes
title: A Grand Blade
log: The forge in the market row is cold, and the young smith at it does not look like a man who chose the work.

stage taken-up:
  log: I said I would find whatever his father hid from him, on nothing more than a riddle the man was fond of and never explained.
  tulsa.bladesmiths-son says:
    always
    ask: About your father's notes.
    He kept the whole of his trade in his head, or so everyone tells me now that it is too late to ask him. There should have been notes somewhere. Temperatures. Mixes. What iron wants that bronze doesn't.
    I have turned this shop over twice. Crates, the counter, the chimney. Nothing.
    The one thing of his that ever sounded like an answer was a riddle he was fond of: a real smith paves his own way. I took it for one of his jokes, the day he said it. He did not make jokes.
    -> I'll find them for you.
      goto searching

stage searching:
  log: His father's whole trade is somewhere in this shop, if the riddle means what it says: a real smith paves his own way.
  tulsa.bladesmiths-son says:
    when: not has smiths-notes
    ask: About the riddle again.
    again: Paves his own way. Not a road he built in his life that I ever heard of. I don't know what he meant by it either.
    He says it again slower, as though slowing it down might make it mean something else. A real smith paves his own way. It doesn't.
  tulsa.bladesmiths-son says:
    when: has smiths-notes
    ask: I found what your father hid.
    He goes quiet reading them, the way somebody goes quiet hearing a voice they had stopped expecting to hear again.
    "Paves his own way." He shuts the book on his thumb. "He built this floor. Never told me that either." A road-maker paves a road. My father was not a road-maker, unless he counted the anvil.
    take: 1 smiths-notes
    give: 1 grand-blade-schematic
    xp: smithing.smithing 400
    There's a blade in here too big for anything he ever sold — bar count, temper, the whole shape of it. I don't think he thought anyone would get this far. Take the pattern of it. You'll be at that anvil more than I will, the look of you.
    Use it. It's yours as much as it's mine, these days.
    goto forge-reopened

stage forge-reopened:
  log: The forge in the market row has a fire in it again, and the schematic for whatever the old man was building toward is mine to make good on.
  complete
  tulsa.bladesmiths-son says:
    always
    ask: About the forge, now.
    again: Fire's lit. Anvil's yours as much as it's mine, these days.
    Fire's lit for the first time since he died. Feels like it should have taken more than a book under a paving stone.

// --- what this quest owes the world ---

// The floor's own half of the riddle, and the only object it hangs off: the
// forge's own examine already says the anvil "stands unused in the middle of
// the floor," so a player who has heard both halves — the son's riddle and
// the room's own words — has everything paves his own way needs. No further
// gate: a player who tries this before ever meeting the son gets the same
// notebook a little early, and still has to bring it to him to make anything
// of it.
# entity tulsa.anvil
flags: notes-found
search under the anvil:
  hidden if: notes-found
  time: 8
  give: 1 smiths-notes
  set: notes-found
  say: One flag under the anvil's foot sits proud of the others, cut to fit around it rather than under it — set by whoever set the anvil there in the first place. It lifts on a fingernail. Underneath, wrapped against the damp, is a notebook that has not seen daylight in years.

// Required and never spent, the way `smithing.dsl`'s own hammer is: nothing
// stops a player from being handed one and losing it to a shop or a chest,
// but nobody who has not stood in the forge and heard both halves of the
// riddle is ever handed one to lose.
# item grand-blade-schematic
title: The Grand Blade Schematic
examine: Bar count, temper, and the whole shape of a blade too big for anything the shop ever sold, copied out in a steadier hand than whatever wrote the original.

// The one thing in the game the son's father never got to make. Ten points
// clear of a Knight's Sword and asking five levels more of the arm swinging
// it, which is what "best in the game" costs the one time it is not merely
// dropped or bought.
# item grand-blade
title: Grand Blade
examine: A long, plain blade with nothing on it a smith would call decoration, and an edge that does not argue with anything it meets.
slot: mainhand
requires: level.combat.attack >= 25
value: 900
item-level: 14-20
weapon, +28 attack

// The notebook the riddle turns up. Nothing but this quest has any use for it,
// so it is declared here and handed out by the line this module writes over
// tulsa's anvil.
# item smiths-notes
title: The Bladesmith's Notes
examine: A notebook wrapped in oilcloth, the pages gone soft at the corners from being read standing up.

# recipe grand-blade
station: anvil
in: 15 iron-bar, 1 hammer, 1 grand-blade-schematic
out: 1 grand-blade, 1 hammer, 1 grand-blade-schematic
skill: smithing 650
rate: smithing
say: You work from the pattern rather than around it, and the blade that comes off the anvil is not shaped like anything either of you made before.

// --- tests ---

# save outside-the-forge
{"version":13,"location":"tulsa.market-row","inventory":{"core.coin":1000,"smithing.iron-bar":15,"smithing.hammer":1}}

// Start to finish: hear the riddle from the son, read the room's own half of
// it under the anvil, bring the notes back, and walk out with the schematic
// and the pattern for the blade it unlocks. The bars and the hammer are
// bought off `tulsa.forge-counter`'s own stock exactly as any other smith's
// would be — nothing about carrying them in already is this quest's claim.
# test a-grand-blade-start-to-finish
load: outside-the-forge
travel: forge
talk: tulsa.bladesmiths-son
choose: finding-the-notes.taken-up.bladesmiths-son.0.said
choose: I'll find them for you.
assert: finding-the-notes.searching
use: entity.anvil.search-under-the-anvil
assert: has smiths-notes
talk: tulsa.bladesmiths-son
choose: finding-the-notes.searching.bladesmiths-son.1.said
choose: continue
assert: not has smiths-notes
assert: has grand-blade-schematic
assert: finding-the-notes.forge-reopened
craft: grand-blade
assert: has grand-blade
assert: has grand-blade-schematic
assert: inventory.smithing.iron-bar = 0
