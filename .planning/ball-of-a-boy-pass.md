# Ball of a Boy: the pass it is owed

This is a pass over `content/ball-of-a-boy.dsl`, the only file this run may write. Read the
module and its note, `.planning/planning_quests/Ball of a Boy.md`, before changing a line.
The note is what the author wants and this pass makes the module do it; of the eight quests
that ship, this is the one furthest from its note. Keep the route in the file walking, or
say plainly what changed and why, and add a route for each branch you build.

Do not edit `tulsa.dsl`, `combat.dsl` or any other module. A change that seems to need one
is an overlay written here, the way fishing and thieving do it: a `when:` node laid over
`# dialogue tulsa.<entity>`, a `# location tulsa.<room>` body with `+entities:` or
`+adjacent:`, a `# entity tulsa.<id>` body with an action of its own. The sewer rooms, the
guards, Larry, Mouse and the grate are the town's; the feral rats and the two ratmen are
combat's and already stand in the sewer. Match the style of `thieving.dsl`: descriptive
examines with no opinion in them, grounded dialogue with a want leaking through it. A `@@@`
marks what the grammar cannot say; do not work around one.

## What the note asks for and the module does not do

Measured 2026-09-04 by reading both side by side; nothing below is a guess.

- **The quest pays nothing.** The note pays 1,000 health experience and 1,500 thieving
  experience at the end, and a further 500 coin as a bounty if the news is brought to the
  guard captain rather than to Larry. The module gives no experience anywhere and has no
  captain branch. Both are wanted: the captain (`tulsa.guard-captain`, in the barracks) takes
  the report with the bounty, Larry takes it without.
- **The toll.** The note has the guards at the sewer entrance dismiss you, then take a
  thousand coin to let you in, haggled down to two hundred with Larry if a cooked herring is
  in the pack (`when: has core.cooked-herring`), and a flag remembering that the guards were
  bribed. The module takes five coin and no herring, and has no dismissal.
- **The second way in.** Three people know it — Charlie the Tramp always, the Town Crier
  and Oolga while the quest stands at its first two stages — and none of them say so in the
  module. Each wants a `when:` node laid over their dialogue. Which way it is (Oolga's cellar
  wall) the town already knows; this quest has to say it.
- **A safe landing or an ambush.** Entering by the guarded entrance lands you in a room
  clear of rats; entering the other way, the rats ambush you. The junction is combat's
  room and the rats stand in it; the shape that says this here is two ways in that arrive in
  two different rooms, and the module has one.
- **Four progression hints, all absent.** The wall signs point toward the market; examining
  the grate while the ball is being sought says the boy is waving through the bars; the boy,
  spoken to then, says the ball must have washed through the locked door; and Mouse's own
  first lines point at the sewer entrance round the back of the castle. The town's grate
  currently says the opposite — that what the boy lost went under the castle long ago — so
  the quest's reading of it is a `{flag: words}` fragment laid over it while the stage holds.
- **The barred room locks behind you.** The way back closes until the key on the table is in
  the pack or the lock is picked from the inside at thieving fifteen. Killing both ratmen
  sets a flag the guards can later refer to. The module's door is a plain one-way pick.
- The design aside about dodging so the ratmen hit each other is not a beat; leave it.

## What stands

The fourth stage where Larry names ratmen and does not ask after the boy is good and stays.
The book on the table is in the note with its text left blank; write it, since the room is
where the mutagen is first read about. The two ratmen are `combat.ratman`, re-cut today onto
typed damage, and the fight in a locked room has to be walkable by a player who has just
reached level five in thieving: stand a save at the door and read
`npm run simulate-activity -- <save> --world <your corpus> --at tulsa.sewer-locked-room`.

## Done means

`npm run oracle -- --at <your corpus>` green, every route walking, one route per ending
(Larry, the captain, the bribe, the back way), and a report saying what each of the note's
beats became and which, if any, wanted a `@@@`.
