# Kill it with Fire: the pass it is owed

This is a pass over `content/kill-it-with-fire.dsl`, the only file this run may write. Read
the module and its note, `.planning/planning_quests/Kill it with Fire.md`, before changing a
line. Keep both routes walking, or say plainly what changed and why.

Do not edit `tulsa.dsl`, `combat.dsl` or `cooking.dsl`. A change that seems to need one is
an overlay written here: a `when:` node laid over `# dialogue tulsa.<entity>`, a
`# location tulsa.<room>` body with `+entities:`, a `# shop` of this module's own with a
counter entity stood in Oolga's house through `+entities:`. The groundwurm and the poison
recipe are the town's; the cellar rats are combat's. Match the style of `thieving.dsl`. A
`@@@` marks what the grammar cannot say; do not work around one.

## What the note asks for and the module does not do

- **Oolga's potion shop.** The whole point of the reward, and nowhere in the world: no
  `# shop` of Oolga's exists, and her dialogue says shelves are behind her and stops. Write
  the shop and its counter here, `hidden if:` the quest has not settled (`# shop` takes
  `hidden if:` since 2026-09-03, and the counter is an entity that `keeps shop:`). What she
  sells is potions, and the world had nothing to put in a potion until today: damage now has
  types, and a resistance is a stat gear and buffs grant. Stock three or four draughts as buff
  items — a `+<n> <type>-resistance` for a few minutes, a regeneration draught — priced so
  they are worth carrying to a hard target and not worth carrying to grunts. Read the
  resistance stats off `npm run oracle -- stat` and `content/combat.dsl`; which types the
  bands deal is in that file too.
- **Her grumbling.** Step one opens with Oolga complaining that things were better in the old
  days, and only then the glint in her eye. The opening skips straight to the glint.
- **Asking around.** The note has the player find out that Sunny at Sha Dynasty's is the one
  who knows how to repel animals, from other people in town. The module has Oolga send you.
  Put the pointer on a townsperson or two (the crier, Charlie) with `when:` nodes, and let
  Oolga be vaguer.

## What stands

The rats-killed counter and the halved reward are not in the note, but the note does say the
rats are to be left breathing, and a penalty for not doing so is a fair reading. Keep it.
The 1,500 cooking experience matches the note. The vodka hand-over stays.

## Done means

`npm run oracle -- --at <your corpus>` green, both routes walking, a route that buys a
draught at the counter after the quest and one that finds the counter shut before it, and
a report listing the draughts with what each costs and grants.
