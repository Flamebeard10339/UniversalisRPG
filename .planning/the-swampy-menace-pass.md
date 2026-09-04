# The Swampy Menace: the pass it is owed

This is a pass over `content/the-swampy-menace.dsl`, the only file this run may write. Read
the module and its note, `.planning/planning_quests/The Swampy Menace.md`, before changing a
line. Keep the route walking, or say plainly what changed and why.

Do not edit `tulsa.dsl` or `combat.dsl`. The swamp, Oolga, the guards and the herb patch are
the town's; the lurkers and mollusks that make the mire dangerous are combat's and stand
there already, so the note's "plenty of monsters who are all aggressive" is met and wants
nothing from this pass. Match the style of `thieving.dsl`. A `@@@` marks what the grammar
cannot say; leave the one about the captain in the doorway and do not work around it.

## What the note asks for and the module does not do

- **The order of collection changes the dialogue.** The module's herb-find rolls off the
  running count, so the three finds arrive in the same words whichever herb came first.
  The note keys the finds to the herbs: the deformed eggs come with the first herb *found*,
  the trashed alchemy supplies with the second, whichever they are. Key the words off which
  herbs are in the pack (`has core.marsh-thistle`, and so on) rather than off the count.
- **The objectives list updates as herbs come in.** A stage `log:` is one line, but a line
  the game says may carry `{<condition>: words}` fragments, so one log can read "I have
  {has core.marsh-thistle: the thistle,} {has core.fen-root: the root,} ..." and change as
  the pack does. Write it that way.
- **Fight or run.** The rat-toad ambushes on the third herb and the note lets the player
  run. The toad is aggressive and jumps the player; whether a player engaged by it can walk
  out of the mire is a question for the tool, not the grammar page — stand a save on the
  third find and write the walk as a route. If the engine refuses the walk, mark it `@@@`
  and say what it did.

## What stands

The reward matches the note as reworded today: 3,000 coin and 6,000 health experience,
paid whichever of Oolga or the captain is spoken to first. The three guard threads that
point at the captain stay; they are the note's "any guard". Oolga standing there with combat
stats so a weapon can be used on her is the beat the note asks for and stays.

## Done means

`npm run oracle -- --at <your corpus>` green, the route walking, a second route that
collects the herbs in a different order and reads different words, and a report saying what
the run to the swamp edge from the ambush did.
