# Cooking: the pass it actually needs

`content/cooking.dsl` is 173 lines and is the other half of the fishing/cooking split. **Read it
before changing a line of it.** Read `content/fishing.dsl` too — it is the finished module in
this pair and the one to match for style, and it is where every fish recipe lives.

This is a narrow pass. Three of the four things you might expect to be wrong with cooking are
not, and they were measured today rather than assumed.

## What is right, and is not to be touched

**The payout ladder is correct.** A recipe's `skill: cooking.cooking <n>` is the experience one
craft pays, and `rate: core.cooking-rate` is 6 a minute, so a recipe's ceiling is exactly
`n x 360` an hour. Measured at `--ideal` from a cook standing at Aggie's stove at level 30 with
every raw ingredient in the pack:

    cooked-carp      18 xp   6,480/h   2.2x the level-30 curve
    cooked-perch     16      5,760     1.9x
    cooked-tench     14      5,040     1.7x
    cooked-sturgeon  12      4,320     1.4x
    cooked-eel       10      3,600     1.2x
    cooked-pike       8      2,880     0.97x
    cooked-beef       5      1,800     0.6x

2.2x at the top is the line fishing sits on, and five of the seven offers come within 2x of the
frontier, so a cook at 30 has a real choice of what to stand at. **Change no `skill:` number in
any recipe, in this file or anywhere.**

Note where those come from: everything from pike upward is declared in `fishing.dsl`, not here.
Cooking's own recipes stop at beef. That is the split working as designed — cooking is the skill
other skills feed — so **do not move those recipes into this file and do not duplicate them.**

If you sweep cooking yourself and see a flat ceiling that never rises with level, that is the
`tiers.cooking-*` saves carrying only shrimp, anchovies, trout, salmon, chicken and beef. It is
an artefact of the save, not the world. It cost this session a wrong conclusion; do not repeat it.

## What is wrong

### 1. The three pieces of cooking gear can be got nowhere at all

`chefs-hat`, `oven-mitts` and `cast-iron-pan` are declared here and that is the only place they
appear in the world. No shop stocks one, no droptable rolls one, no quest hands one over. They
exist only inside the reference saves in `tiers.dsl`. A player cannot own a single piece of
cooking gear by any route.

Give them a home in the world. The three cooking jewels are already one-off finds in tulsa —
the end drawer of a range, the spike on the bar's pass rail, the spoon crock by Aggie's stove —
so the world already treats a kitchen as a place things turn up. A seller is the obvious answer
for gear, the way the tackle stall is fishing's, and a kitchen that sells to cooks fits Sha
Dynasty's or Aggie's or Market Row. Pick one and make it fit the town rather than adding a
general-store line.

### 2. Cooking's ability ladder is 37 short at 20 and 86 short at 30

`npm run ladder-check` reads what a cook can reach against what the ladder asks:

    level      what the ladder asks    what exists anywhere    short by
    1                            0                    61.6         over
    10                        63.0                    77.0         over
    20                       133.0                    96.0         37
    30                       203.0                   117.0         86

The reason is that cooking's gear stops: the chef's hat at level 20 is the top of it, three
slots are used and four are empty, and the highest item-level anywhere in the skill is 8-14.
Fishing had exactly this problem and answered it with a band at 25 to 30 on the slots it was
not using, at item-level 20 to 32 — read `# item greenheart-rod` and the five pieces after it,
and match that shape. **A higher item-level is the point**: it is what multiplies a jewel rather
than adding a flat number, and ability comes from jewels rather than from the base.

Two or three pieces will close most of 86. Say in your report what `ladder-check` reads
afterwards; closing it exactly is not required and chasing the number is how a world gets sanded
flat.

### 3. Nothing proves cooking walks

`cooking.dsl` holds **no `# test` at all.** Every other skill module in the corpus has routes.
Write some: a cook standing at a stove turning a raw thing into a cooked thing and eating it, a
cook buying the gear you gave a seller and wearing it, a burnt dish. A route asserts the path —
what it is holding, where it got to — and **never a number a balance pass would move**: no
experience, no coin, no time, no drop count.

`fishing.dsl`'s own `# test` sections are the shape to copy, and `the-lanes-are-where-the-cooking-is`
in that file already walks a cook between two kitchens.

## What this module may reach

`# info cooking` depends on `core` and `combat` today. It may **not** depend on `fishing` —
fishing depends on cooking and a cycle will be refused. If you need to write over something
tulsa declares, take a soft `? tulsa` and lay a body over it, exactly as `fishing.dsl` does with
`# location tulsa.market-row` and `+entities:`. Do not edit `tulsa.dsl`.

## Style

Match `fishing.dsl`. Descriptive examines with no opinion in them, grounded dialogue with a want
leaking through it, no story-book narration. A kitchen is a workplace and the people in it are
tired.

## Done means

`npm run oracle -- --at <your corpus>` green — loads, round-trips, every route walks — and a
report saying where the gear is sold, what `npm run ladder-check` reads for cooking afterwards,
and which routes you wrote.
