# Combat lessons: the world teaches fighting

Write **one new module, `content/combat-lessons.dsl`**, the only file this run may write.
It holds miniquests that show a player how fighting works without anybody saying the word
"tutorial": each is one interaction with a person in town who wants something, a choice or
two, and a world that remembers. Read `content/combat.dsl` whole first, because every foe,
type, resistance and jewel these lessons point at is declared there and was re-cut today;
read `content/thieving.dsl`'s miniquests (the lookout, the locked-out lady, the fruit stall)
for the shape, since they are the model and they work.

Depend on `core`, `combat` and `tulsa`. Do not edit any of them. People, rooms and foes are
theirs; a lesson stands its own entity in a town room with `# location tulsa.<room>` and
`+entities:`, and gives a townsperson a thread with a `when:` node laid over
`# dialogue tulsa.<entity>`. Match the style of `thieving.dsl`: descriptive examines with no
opinion in them, grounded dialogue with a want leaking through it. Mark what the grammar
cannot say with `@@@` and do not work around it.

## The lessons

**The drunk who picks fights.** A regular at Sha Dynasty's — the bar has a `drunk-patron`
already, or write one of your own — boasts he will show you how the wolves in the pinewood
are dealt with, or the rats in the sewer, and goes. When the player follows, he is on the
ground and the room is what it is: the wolves are aggressive and came at him before he had
his fists up, and they come at the player the same way. That is the whole lesson: some things
attack you the moment you stand there, and the room, not the player, decides when a fight
starts. `stands: <guise> for <duration>` is how he lies there for a while, and the guise's
examine says what happened to him. Afterwards he has a thread about it, and a townsperson or
two has a line about the state he came back in.

**The guard's bout.** A guardsman at the barracks or the castle gate will spar. A bout is a
fight that ends before anybody dies: work out in the grammar what that is — a sparring partner
who yields on a threshold, an action with `attempts:`, a guise that takes the fight off him
when he is down — and let him talk the player through what the sheet's numbers do while they
fight: accuracy against evasion decides whether a swing lands, attack against defense decides
what it takes off, attack rate is how often. `open modal: stat-breakdown` is a result that
puts the player's own sheet in front of them, and the guard can say to look at it. He pays a
little attack experience and a line for later; he remembers whether the player won.

**The armourer on types.** The counter behind the armoury is combat's (the base pass wrote
it); its keeper has one thing to teach and it is new in the world today: damage has types,
some things resist some of them, and a piece of armour with the right resistance is the
difference between a room you can stand in and one you cannot. Point the lesson at whichever
foe combat.dsl made typed in the second band, and let the lesson end with the player wearing
the piece that answers it, bought or handed over, and standing in that room to feel the
difference. Which types and which piece is the corpus's to say, not this brief's.

**Not here.** The smith's lesson on socketing a jewel is A Grand Blade's and is not this
module's; hand out no jewel and explain no plane. Nothing here is a quest in the journal's
sense unless it has to be; a miniquest is a thread and a flag.

## Consequences

Local: what each lesson pays or costs. Global: a `when:` line on a person or two that says
what the player did — the drunk was left where he fell or was helped up, the bout was won
or lost, the armourer's advice was taken or not. No meter, nothing summed.

## Balance

Every fight a lesson stages has to be walkable by a player who has just left the tutorial
and fought the sewer: stand a save at that point and read each with
`npm run simulate-activity -- <save> --world <your corpus> --at <room>`. A lesson pays
experience like a room in the first band would in the time it takes, and no more.

## Done means

`npm run oracle -- --at <your corpus>` green, a `# test` per lesson that walks it to its
ending and one for the other ending where there is one, and a report saying what each
lesson became and every `@@@` you wrote.
