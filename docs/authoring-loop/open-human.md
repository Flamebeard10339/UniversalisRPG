# What is still wrong that needs Yonatan

The queue nobody else can take. Everything here is open; nothing here is done. **A
line is deleted the day it closes** — not struck through, not annotated, deleted.
Git holds the reasoning, and the commit that closes a line is where the reasoning
belongs. Nothing here records what has been decided: a ruling a later agent could
get wrong is a test, or a line in `CLAUDE.md` if it is a rule about the work rather
than about the game.

Each line says what is wrong, how it is known, and what would close it. A line
without evidence is a hunch and does not belong here yet.

Everything here waits on the owner: his play, his reading of the writing, or a
ruling nobody else can take. **Under each line is one italic clause saying what
would move it into `open-agent.md`** — the decision that is missing, named, and
`npm run handoff` reports a line that carries none. A line whose clause would have to
read *nothing moves it, and no work hangs off it* is not an open line at all: it is
either a ruling, which goes to a test, or an observation, which belongs in git. It is
deleted. A line that arrives here from `open-agent.md`, because a lane got into it and
hit a judgement that is his, carries that same clause written out of what the lane had
already measured. The `hand-over` skill states when a line crosses, in both
directions.

---

## Oolga's one condition is the only thing she asks and nothing enforces it

*Kill it with Fire* turns on her saying it: clear my cellar of rats and have every
one of them still breathing when you are done. Nothing in the quest reads whether a
rat died, and the route that walks it end to end kills four of them — the melee
action takes whatever in the room is aggressive, and the cellar's four feral rats
are aggressive. She then congratulates the player for not killing one.

The mechanism to hold her to it exists: the rats are `tulsa.feral-rat`, and a stage
can ask any condition. What is missing is the ruling. Failing the quest on a dead
rat is a hard failure state this game has none of yet; letting it stand makes her
closing line a lie in the common case; counting the kills and having her say a
different thing is a third quest's worth of writing.

Measured on 2026-08-29 by walking the route: it ends holding eight rat pelts.

*Moves on a ruling on what a broken promise costs a player here. Any of the three
is a lane's work once it is named; guessing between them is the one thing that
cannot be done, since it is the quest's whole point.*
RESPONSE: I don't understand this one. The solution is to make the celler rats have a different id (but the same title) and track the number of kills. If it is 0, the player killed none. Am I missing something?
2) There are no hard failure states. Only alternate paths. The game should simply acknowledge the player's actions in the form of dialogue and reward. Oolga's quest completes when the player does what she asks. How the player achieves that determines rewards and dialogue. 

## Whether a quest may take an NPC's conversation for the whole of a stage

`birds-and-the-bees` is written and walks its own route end to end, and it is not in
the corpus. Its first stage puts an opening on Kelsa, and a quest's `<entity> says:`
takes the **whole** of that entity's dialogue for as long as its stage stands — so
tulsa's own `blunt` node, the one that says *if you are here about the bees, say so*,
stops being reachable from a fresh game and `tulsa.kelsa-takes-the-answer-she-asks-for`
stops walking.

Measured on 2026-08-30, four ways. Giving the quest thread its own distinct `ask:`
does not help — the takeover is not about the ask text. Gating the quest block on
`when: kelsa.the-third-hive.visits >= 1` makes tulsa's route walk again and the quest
unreachable: that condition never reads true, qualified or bare. Stepping tulsa's route
past the quest's opening first makes both walk in English and fails under
`translationSurvival`. The written module is not in the tree; it is rebuilt for about $4 by handing its brief
back to `npm run authorbot`, which is cheaper than carrying it.

Three shapes, and choosing between them is the ruling: a quest's line may sit
**beside** an entity's own threads rather than replacing them; or tulsa's `blunt`
stops being `always sticky` and yields; or Kelsa's stranger conversation is **meant**
to disappear once she has hired someone, and tulsa's route is what is wrong.

*Moves on which of those three is the game. All three are a lane's work once named;
the third also means ruling that a corpus route may be rewritten because a quest
superseded the path it walked, which nothing here has done before.*
RESPONSE: The way kelsa's conversation has to go is that her dialogue in tulsa needs to be removed to be replaced by the quest. She is asking about the bees there as a preamble to the quest. 
But the larger question here is more interesting. We need to support two quests that are using the same NPC while running in parallel. That is the only requirement I can think of. 

## Whether a section written over another module's may name its own module's ids

Nine of them, found on 2026-08-30 when the first pass's five modules were merged. A
`# entity tulsa.oolga`, a `# location tulsa.deep-water` or a `# dialogue tulsa.guardsman`
written from a quest may name **nothing** of the quest's own — not a flag, not an item,
not an entity, not another quest's stage. The corpus loads either way; only printing it
and reading it back says so, which is why no authoring run could see it and why all five
hit it.

The corpus already answers it one way: ball-of-a-boy's own comment says the toll flag is
tulsa's, *set here because nothing else sets it*, and `corners-slathered` and
`wurm-defeated` are kill-it-with-fire's flags declared in tulsa for the same reason. So
the four merged quests were made to follow it — tulsa now holds the bladesmith's
notebook, the reporter, the mire's rat-toad, the blowfish and its hole, and three flags.
That cost three guard lines that could not follow it, marked `@@@` in
`the-swampy-menace.dsl` and listed by `npm run notes`.

The other way is that this is a printer defect: an overriding section belongs to the
module that wrote it, and print-back is what loses that. Every quest wants its own
monster in a shipped room, so the rule as it stands means the town file grows a section
per quest and a quest cannot be lifted out cleanly.

*Moves on a ruling on which of the two it is. If the rule stands it wants writing where
an author meets it — nothing the oracle prints says it. If it is a defect, the fix is a
lane's, and the five pieces pushed into tulsa come back to their own modules.*
RESPONSE: No, this is a defect. All flags of a quest must be named inside of the quest. We want to keep a clean workspace. If Tulsa is loaded alone, it should read as if there is no hint of any quest inside of it (other than being strangely empty). In fact, the only time an entity or item should be taken out of a quest module is if another module needs it. Then it is put into a shared module both mods use (like tulsa). This is basic programming hygiene. Of course, Tulsa is not just a dummy module. It has the purpose of being a skilling location. Those genuinely do belong in tulsa and not in any quest. If it is a little bare, that means that there aren't enough skilling tasks in the city and is a useful metric. 

## Whether the view may declare two paths aliases of one fact

Held open for a conversation the owner asked for: *"I'm not convinced we need aliases
in the first place. This needs a discussion. What are the pros and cons. What is the
shape either path will take."* The discussion was had on 2026-08-25 and its substance
is below, so it is not re-derived; what is left is the choice.

**What is broken.** The view-parity harness proves every string the engine puts in a
view actually reaches a player on all three surfaces. It works by counting words, so
when two paths carry the same word at the same moment neither is ever proved.
Measured at `/look` in the Guide House: `choices[].detail` and `entities[].title`
hold *identical* word sets, so mutating `formatChoices` in `scripts/lib/replLines.ts`
to drop `choice.detail` entirely **passes the suite**.

**Shape A — the view declares its aliases.** A declaration saying these paths are
several names for one fact, after which the cheap rule (*a shared word must be drawn
once per bearing path*) applies to everything else. Measured: the rule kills the
mutant and raises exactly three false alarms — `location.title`, `planes[].name`,
`action.label` — and all three are exactly the alias groups, so they look declarable.
*Against it:* the declaration is a hand-kept list of what counts as one fact, which is
the failure mode `CLAUDE.md` opens by naming. A new alias fails the harness until
someone adds it; a path that stops being an alias keeps its exemption silently.

**Shape B — every driver reports its text keyed by the subject it hangs off.** Then
aliasing falls out rather than being declared: same subject, same fact. Nothing is
kept in sync. *Against it:* it is a change to all three drivers rather than to the
harness, and it is the expensive path.

**There is no shape C.** The obvious *"then stop carrying three names for one place"*
does not exist: `location.title`, `discovered[].title` and `locations[].title` are
three different **lists** that legitimately mention the same place, not three
redundant paths to one field. Collapsing them is not available, and that was checked
— a per-line unit gives the same answer, because those two share a chunk for exactly
the reason they share a word.

**The recommendation on file: neither, yet.** What was actually at risk is one mutant
in a test harness, and that specific hole — `choice.detail` going missing unnoticed —
is now shut: `scripts/lib/replLines.test.ts` holds every choice the shipped opening
view gives an owner to saying it, and the mutation it was written against was made and
watched to fail. So only the general question stands here. Shape A buys it at the price
of the one thing this repo spends 11.5% of its commits undoing. Shape B is what the
repo's own doctrine selects and should be taken the next time a driver is open for
another reason, not on its own account.

**Measured again on 2026-08-26, and the hole is wider than one mutant.** A lane
rebuilding the shop found that `stats[].from[].title` carries
`["Base","Attack","Elf","Health", ...]` — every word of which is also held by
`stats[].title` or `player.race.title`. So `drawnHere` never proves that path for
**any** driver and `driftingPaths` filters it as "drawn by none". The terminal was
missing a whole screen and the harness was structurally incapable of noticing.

What the lane did about it is a third option this line did not have. Rather than
declaring aliases or rekeying every driver, it added a claim beside the
word-counting one: the walk opens all nine screens and compares what it opened
against `MODAL_NAMES` **read off the engine**. That is a reachability claim, not a
word claim — it asks whether a surface can get to a screen at all, which is the
question the word counter cannot ask. It was verified by reinstating the
terminal's gap and watching it fail. Cost: each driver now walks once, memoized,
so the larger script runs faster than the old one (2.9s against 3.7s).

That does not answer this line, but it changes what is left of it. Reachability
is now covered; what is still unproved is whether the *words* on a reached screen
are the right ones when two paths share them.

*Moves when: the owner picks a shape, or accepts the recommendation and this line is
deleted, with the commit that deletes it naming the blind spot and naming B as its
answer if it ever matters.*

## Whether a fishing spot is a thing you can use up

Your reading of the corpus on 2026-08-26: *"fishing should be just like `# action
melee-combat`, just for fishing."* The enumeration you caught is fixed — what a parted
line costs is now a `# droptable` under the tackle that declares it, so a seventh net is
one line in the file someone is already editing. The four duplicated casts are not, and
the reason is a decision rather than a defect.

A lane built the shape rather than asserting it could not be built. `src/grammar/action.ts:315`
refuses a side-naming action that declares no `depletes:`, so `accuracy: my fishing vs
their depth` is rejected at load. Adding `depletes:` to get past it **loads** — and then a
measured minute of netting recorded the shoal *felled by the first fish and not coming
back*, plus `combat.attack: 2` banked per landed cast. That second one is the thing
`content/fishing.dsl`'s own header exists to refuse, and it cannot be scoped away:
`damage-dealt` takes no `resource:` and the arity check refuses one.

Both are fixable in content — `respawn after:` for the shoal, and the stray experience is
about 7% of the benchmark — but fixing them means accepting that a fishing spot is a thing
that gets used up and that casting trains your arm a little. That is a decision about what
fishing *is*.

There is a third path and it is the one a lane recommends: relax that grammar line so a
side-naming action needs no `depletes:` at all, which the runtime already supports
(`runtime.ts:264` fires target hooks without it). Then the four casts become one action and
four waters with no shoal felled and no arm trained. It is engine work, not content.

*Moves when: he says whether a water may be depleted, or whether the grammar should stop
requiring it. The first is a content afternoon and changes what fishing means; the second is
a small engine change and changes nothing about the game. A lane cannot pick between those.*
RESPONSE: No, water cannot be depleted. I feel like we can bypass any engine changes for now by just setting the respawn time to instant. It is very important however that fishing doesn't drift from combat because that is a one-home violation. 

## Whether Market Square should read as crowded or as legible

It carries twelve entities and eight roads. That is what "alive" costs at the busiest room in
the game, and it is the room every road in town runs through by design.

The travel half is capped — the sheet now stops at one step out and the rest is on the map —
but nothing caps the entity list, and nobody has decided whether it should. A square you can
read at a glance and a square that feels like a market are not obviously the same screen.

*Moves when: he stands in it and says. If it should be thinned, the lever is which entities
stand there rather than a number in the engine; if it should not, this is deleted.*
TODO: (don't move this to open-agents.md) Need to thin this out, will happen when we do another pass over the map once quests are roughly finished. 

## Whether a stalled bar should empty or hold where it stopped

While a run is stalled — a rate taken to zero by a debuff, which is what being caught
pickpocketing now does — the published fraction is `0`, so the bar empties rather than
freezing where it had got to. The lane that built the stall published a `stalled` flag beside
it so a renderer could draw it stopped, and did not go further.

Holding the drawn number needs a span stored on `Cadence`, which is a real change to the shape
the runtime keeps per attempt. The lane judged that out of scope rather than guessing at it.

*Moves when: he sees a stall and says whether an emptied bar reads as "you are stopped" or as
"you lost your progress". If the second, it is a field on `Cadence` and the publisher reading
it.*
RESPONSE: The stall should just reduce the recovery rate of the resource. The resource should therefore stall halfway complete. There should be no fancy flag or anything like that. It should be a timed (de)buff that reduces the thieving rate to 0. 

## Miki's lent net can be destroyed, and his line then points at nothing

`on line-parted:` takes the tackle when `line-health` empties. Miki's `again:` line — the one
a player gets on every talk after the offer — points at the net already in their pack, so a
player whose net has parted is told to use a thing they no longer hold.

Remote rather than theoretical: the shrimp shoal drains 1 line-health per miss against the 6
the small net grants, so it takes a run of misses. The window is still an exit, so it is not a
softlock — it is a line of dialogue that becomes false.

*Moves when: he says whether the tutorial's lent net should be exempt from parting, or whether
Miki should have something to say to a player who broke it. The first is a condition on one
droptable; the second is a dialogue node and is the better writing.*
RESPONSE: No exemptions. It is a regular net. Miki should simply offer the player another net if they have none in their inventory. 

## A tie-break that decides which module's body wins is provably dead

`addressable`'s `declares` tie-break says in its own comment that when two modules write a
section at one address, the **declaring** module's body is kept. Measured while the naming rule
was being folded into one place: **533 of 533 shipped sections take the true branch**, so the
tie-break never decides anything and the behaviour reduces to *last source wins*.

The lane re-expressed it faithfully rather than changing it, which was right — but that leaves a
comment claiming a rule the code does not enforce, and the two ways out are not equivalent. Making
the comment true needs a `staged ||` exemption, or the shadowing rule that lets a staged edit
override a shipped section breaks. Deleting the tie-break makes the code honest and quietly ratifies
*last source wins* as the rule.

*Moves when: he says whether a declaring module's body should beat a later one, or whether last
source wins is the rule and the tie-break goes. The first is a small exemption and keeps staging
working; the second is a deletion and a renamed test. A lane cannot pick, because both are
defensible and one of them changes what an edit staged over a shipped section does.*
RESPONSE: Load order determines everything. Any other heuristic we come up with will break under real world conditions. Mods can already control load order with their dependencies.

## Whether the second quest may pick up while Miki is still mid-lesson

`leave-tutorial-island.adrift` is gated only on `tulsa.market-square.touched`, and two things
reach the market before Miki finishes teaching: the window, and the dresser lockpick through the
front door. So a player who has found the town while a loaf is still unbaked gets Miki's leaving
line standing beside the lesson he is in the middle of.

The **words** are repaired: the dismissal and the "last word" journal line are gone, and a route
proves both threads now stand together (`first-steps.the-town-is-found-before-the-lesson-is-over`).
That was measured as a real guard — it reddens when the island thread is closed mid-lesson and
nothing else does.

The **structure** is yours. The obvious fix is
`when: tulsa.market-square.touched and finding-your-feet.sendoff`. It was measured and not taken,
because it breaks exactly one route — `the-apology-survives-going-out-of-the-window` — and commit
`b07cdbdb` shows that route was written *because* both quests speak there, having already measured
and rejected the alternative of removing `adrift` from the list.

There is no third way with the flags as they stand: they cannot say *Miki is not waiting on you*
without enumerating stages, since `snubbed` stays set after apologising.

*Moves when: he says whether `leave-tutorial-island` may pick up at all while `finding-your-feet`
is mid-lesson. If it may not, the gate is one line and the route that protects the overlap is
deleted with its reasoning in the commit. If it may, this is deleted and the words already
repaired are the whole of the answer.*
RESPONSE: Quests should have starting requirements (other quests, level requirements, etc), but that is a separate question. Miki's quest does not stop any other quest from starting. 

