# Balance: a plan

Fourth draft, 2026-08-31, after an adversarial review that landed fourteen findings. Two of
them said the third draft was wrong about its own reasoning and both were right; those
paragraphs are rewritten rather than defended.

Shipped: step 0 at `3a046579`, composable saves at `f592becc`, the fixed-window denominator and
the resume rule at `c72e9737` and `ac6268ef`, the tool's rename at `6a10ae1c`. The measuring
instrument is now built; nothing has been rebalanced.

The tool is **`npm run simulate-activity`**. It takes a save, a loose word naming the offer and
`--at` for the place, so the ordinary call is one activity rather than a whole town.

---

## 1. What was broken, measured

Run 2026-08-30, `npm run simulate-activity -- tulsa.in-town --seeds 2`, 242 offers.

**An aggressive room cancelled an offer rather than contaminating it.** `openAggression`
(`src/runtime/runtime.ts:554`) takes the fight to the player whatever they were doing, and
`state.activeAction` is a single slot, so the offer under measurement never ran. Every offer at
`tulsa.sewer-outfall` reported byte-identical gains — the feral rat's fight, printed six times
under six other offers' names, including a `pick-lock` row showing no thieving xp at all.
**Fixed**: `GameState.engagedBy` carries the aggressor's id. 43 offers were affected.

That fix found a live bug the old sheet was hiding: at `tulsa.swamp-mire`, **eight of nine
offers were reporting the bog-lurker's death** — it takes the fight even from a combat offer
aimed at a different foe.

**The denominator is the run's own duration, and it is wrong for every offer.** A death at 7
seconds was divided by 7 seconds and reported 185,625 xp/h. Step 0 stopped that by printing no
rate for an unfinished run — right as far as it went, and now superseded, because it discards
information rather than telling the truth. The deeper fault is that a 22-second pickpocket run
and an 88-second combat run at the same location are divided by different things and are not
comparable, and neither survives contact with an hour: `core.melee-combat on tulsa.civilian` at
`tulsa.kings-road` already reports *"cycles 3 · stopped short: it was finished"* — the room ran
out of civilians.

**Fixed at `c72e9737`: denominate by a fixed window of game time.** Every offer runs for one game
hour and the rate is what the player actually holds at the end. Nothing is extrapolated, every
offer shares a denominator, and dying costs the rest of the hour. It needed no new mechanic:
`content/tulsa.dsl:1333` is an `on death:` handler that already restores health and relocates.

That subsumed three more problems. It retired step 0's `no rate` branch, which had nothing to say
once every run has a denominator; it turned `engagedBy` from a **suppression** into an
**annotation**, so a character who swats an aggressor and then works for fifty-nine minutes is no
longer a blank row; and where the offer did not last the window out, the pace inside the time it
did run prints beside the rate — a ceiling, marked as one.

**The offer stopped and never resumed, so most of the window went unmeasured.** The same fight at
`kings-road` came round three times at a one-minute window, three at five minutes and three at an
hour, while `tulsa.civilian` declares `respawn after: 45s`. Forty-one offers ended that way: they
were not measuring depletion, they were measuring a room emptying once.

**Fixed at `ac6268ef`, and the rule names no mechanic.** A run goes on for as long as the player
could go on standing where they are with what they hold, and ends where going on would mean doing
something else instead — buying bait, mending a parted line, walking back from wherever a faint
carried them. The room is asked whether the offer is on its sheet; where it is not, the clock
moves to the next moment the engine says the world has something due and the room is asked again.
A moment with nothing due is the world being done. So a respawn, a daze wearing off and an empty
bait pouch are one rule, and `nextBoundary` — already the engine's single list of what could
change — is what the waiting reads.

This is why it matters that the three cases really are different in the corpus and identical to
the tool: combat **consumes** its source and returns on a timer; thieving never consumes its mark
(`tulsa.dsl:1105-1115` — coin and xp, or a health drain and a daze); fishing never consumes the
water, and what runs out is bait and line health, which is the one case that genuinely stops.

A consequence worth holding on to: **Market Square is the free-death room.** A run that dies where
it stands wakes where it fell, so its offers fill the hour while every other row's stops at the
death. That is a fact about the world, not an artifact of the tool.

## 2. What is ruled

Not open, not re-argued below.

- **The xp curve.** Xp doubles every 7 levels; 100 xp to level 2; time-to-level rises linearly
  under an optimal activity pattern. Answers the ask at `docs/skills/open-human.md:12`.
- **The pace target binds on the frontier only.** `R(L)` is what the *best offer available at
  level L* pays. An offer paying under it is not a defect — that is what makes some activities
  worth half of others and the city feel alive. What it costs is §7.1–7.3.
- **Reference builds are artifacts, not algorithms** — a bounded set of saved builds, re-derived
  on demand, accepting that a better build may have been missed.
- **Fitness is an outcome, not a weighting.** No scalar value is assigned to any stat.
- **A build's resources are not budgeted.** A tier has everything it beat plus every shop. A
  wealthy build is the point: an unskilled player has a worse one, and closing that gap by
  out-levelling is the player's business.
- **A tier's xp is a pool the search spends, not an even split** (§6.1).
- **An archetype is a jewel the build is required to carry** (§6.3).
- **Every distinct good build is kept**, one per jewel per tier — a jewel no build can win with
  is a buff finding, and a change to poison must not force a rewrite of the thorns builds.
- **Balance numbers are moved freely.** Every `xp:` line, drop rate, stat and timer is in scope
  once the honest numbers are in. Nothing in the world is pinned by having been written.

## 3. The principle everything below obeys

> **The tool never restates a rule the engine owns. It only constructs a state, hands it to the
> engine, and reads what comes back.**

Anything obeying this survives a new mechanic for free; anything violating it needs a rewrite
per mechanic, and the repo's stated largest failure mode is exactly that.

The second draft violated it twice. Both are withdrawn, and the review re-derived and upheld
both withdrawals.

**The analytical build envelope is abandoned.** It computed `(b + a·x)(1 + p·x/100)` in a
script, which is `foldStat` (`src/runtime/stats.ts:171-179`) written a second time. Three things
killed it. It was **already wrong**: `clusterScale` (`clusterEffect.ts:18-25`) multiplies a
passive's bonus before it reaches either channel, and five `cluster-effect:` items ship
(`content/core.dsl:548-568`), so the computed value fell *below* what a real build reaches — it
was not an upper bound at all. It was **not a model of player power**: `modifierCarriers`
(`stats.ts:93-121`) reaches entity base stats, passives, skills, race, buffs, worn items and
item-carried passives, and the passive plane is one of eight. And it has a **shelf life**:
capped resistances make the objective non-concave, so the greedy k-sweep stops being correct —
not looser, wrong — and capped resistances are on the roadmap.

**Solving for the best build is abandoned.** It requires a scalar objective over stats, and
there is none that is not circular: the exchange rate between attack and max-health is set by
the encounter, which is the thing being measured.

**Where the principle does not reach.** Going through the engine protects the *evaluation*, not
the *search landscape*. §6.4's greedy inherits the same non-concavity the k-sweep died of — a
cap is a plateau and greedy has no gradient on a plateau — and §6.4's fitness is discrete, so a
build gaining 30% attack without crossing a threshold scores identically to one gaining nothing.
That is a real limitation of the search, not of the measurement, and §2 already accepts that a
better build may be missed.

## 4. The xp curve

Two constants in `src/runtime/skills.ts:1-2`: `FIRST_LEVEL_COST` 1000 → 100,
`LEVELS_PER_DOUBLING` 10 → 7.

Per-level cost `ΔX(L) = 100 · 2^((L-1)/7)`. Time-to-level `T(L) = 3L + 2` minutes — the ruled
shape is linear; 3 and 2 are the instantiation. Required frontier rate `R(L) = ΔX(L) / T(L)`:

| L | 1 | 5 | 9 | 20 | 30 | 40 | 50 | 70 |
|---|---|---|---|---|---|---|---|---|
| xp/h at the frontier | 1,200 | 524 | **457** | 635 | 1,152 | 2,339 | 5,053 | 26,246 |

Non-monotonic: a trough at L ≈ 9.4 (`3L+2 = 21/ln 2`), then a 57× climb to level 70. Raw xp is
not comparable across levels by eye, so the sheet always divides by the curve. L1→70 is ~123
hours and 890,062 xp against 1,650,028 today. Independently re-derived twice, to the digit.

**`R(L)` lives in `scripts/`.** `xpForLevel` is already exported (`skills.ts:5`), and `T(L)` is
a designer's assumption nothing shipped reads.

### 4.1 The world pays about an order of magnitude more than the curve asks

`R(1)` is **1,200 xp/h**. Standing at `tulsa.in-town` — a level-1 character in Market Square —
the best offer within reach pays tens of thousands, and it does so over a genuinely full hour
without dying or running dry. **No linear `T(L)` reconciles that**: matching it needs
`T(1) ≈ 0.2 min` while still giving 123 hours. So the awards move, not the time function. Per §2
that is expected and nothing in the world is pinned.

**Do not quote a rate from this section.** Every figure measured so far has been overturned by
the next fix to the instrument — the extrapolated numbers were wrong by an order of magnitude,
and the numbers that replaced them were wrong again until the offer learned to resume. What is
established is the shape: **the frontier is roughly an order of magnitude above target at level
1**, and that survived both corrections. Re-measure with `npm run simulate-activity` at the head
of the curve pass and work from that.

Two things the measuring taught that are not numbers, and will hold:

- **A rate that ends in a death is dominated by when the death lands.** A rebalance that moves
  survival time moves those offers far more than one that moves an `xp:` line. Read the
  `while it ran` column beside the window rate before attributing anything to an award.
- **One offer may sit far above every other.** Under a frontier ratio that flattens the whole
  level to near zero and says more about the outlier than about the 241 offers beneath it. That
  is §7.2's first bullet arriving on day one, and the curve pass has to answer it rather than
  average over it.

### 4.2 Blast radius, verified

- **The two highest-throughput sources are not `xp:` lines**: `content/combat.dsl:42` and `:52`,
  `gain 2 * amount experience on damage-dealt` and `gain 15 * ... on damage-taken`. They are not
  *instead of* the 25 authored `xp:` lines — both move.
- **Nine shipped saves shift level.** 45 saves exist, 9 carry any xp, and **all nine shift**.
  Worst: `the-bars-crawl.fresh-for-the-brew` +19 fishing *and* +19 cooking (L22→L41);
  `tulsa.rodded-up-at-the-deep-water` +14 (L5→L19), silently clearing the `>= 10` and `>= 15`
  gates on the large net (`fishing.dsl:92`) and horsehair line (`:135`). Nothing reddens — `xp`,
  `inventory` and `resources` are `walked: false` (`src/runtime/save.ts:88-94`) — the saves just
  stop being the characters they were written as.
- **Twelve level-gated `requires:`**: `a-grand-blade.dsl:119`,
  `combat.dsl:148,156,164,172,182`, `cooking.dsl:45,53,61`, `crafting.dsl:88`,
  `fishing.dsl:92,135`. Reached 6–10× sooner in xp terms.
- **41 of the 66 numeric `assert:` lines** sit on `walked: false` roots (inventory 28, xp 10,
  resource 3).
- **Direct curve assertions** in `skills.test.ts:64-71, 82, 88-91` and `conditions.test.ts:56-60`,
  including a golden table and a test whose *name* says "doubles that cost every ten levels".
  The curve's own contract: rewritten, not deleted.
- **Fixtures on `xp: lore 1000`**: `stopsOn.test.ts:23,30`, `span.test.ts:59`, and
  `moments.test.ts:86`, whose case is described as *"a skill crossing four thresholds as five
  payouts of 1000 land on it"* — under the new curve about eleven.
- **`first-steps.apology-route-full-end`** records 56 raw shrimp and 1,008 fishing xp; its route
  runs `until highest-level >= 2` (`first-steps.dsl:357`), so it will earn ~108 xp and ~6 shrimp.
- **Callers**: `conditions.ts:28-29`, `effects.ts:252-253`, `session.ts:633-635`,
  `skill.ts:47-55`, `span.ts:47,49`, and **`stats.ts:46`** — the `level` counter feeding every
  skill's per-level stat grant, and the mechanism behind the self-accelerating measurement in the
  open lines. `level.<skill>` and `highest-level` are the only forms that can name a level
  (`grammar/condition.ts:33-39`), and no authored `per level of` clause exists.

## 5. Composable saves — shipped

`f592becc`. A `# save` takes an `over:` line naming the saves it is written over, laid down left
to right with its own body on top. Record fields take the keys every layer writes; everything
else is taken from the last layer that writes it. So a build and a progress state are two files
rather than four, and the corpus needs **builds + progress states** rather than their product.

Layering reads `SAVE_FIELDS`' existing `shape` and adds no per-field taxonomy. The third draft
justified that by claiming a property beside `walked` would be a hand-kept list; **that was
wrong** — `walked` is a *required* field on `SaveFieldRule` (`src/runtime/save.ts:36-47`), so
`tsc` forces every new field to answer, and its own comment says so. It is the repo's approved
one-home pattern. The real reason to stay shape-driven is redundancy: a `compose` rule would
duplicate `shape` for 18 of 19 fields.

**One field is named**: `MINTS_IDS = 'instances'`. A composition where more than one layer
carries item copies is **refused**, naming both layers, because every run mints from the same
counter — a copy in each layer is literally the same id, and silent overwrite would rebind the
first layer's gear to the second's with no prune warning to catch it.

**That refusal is on §6's critical path, not past it.** A tier build *is* grown gear, so it
carries `instances` by definition. Nine corpus saves carry rolled copies and one of them —
`first-steps.miki-route-end` — is a *quest progress* save holding a rolled iron sword. Composing
a tier build with any such progress state is refused today, and that is exactly the pairing §6.2
needs to derive a quest requirement. Instance-id remapping is the prerequisite, and it needs the
set of places an id can appear to be made derivable first.

## 6. Tier builds, and the matrix

### 6.1 A tier is a per-skill xp pool

A tier at level L grants **N × the xp needed to bring one skill to L**, N being the number of
skills the activity uses — two for combat (attack, health), one for fishing. Start there.

It is a **pool the search spends**, not an even split. An even split says only "every relevant
skill is at L", which the multiplication adds nothing to. A pool is a real degree of freedom: it
makes *"the best tier-4 combat build dumps everything into attack and ignores health"* a finding
rather than an assumption, and it disposes of `core.woodcutting`, which declares no `stat:` and
whose level therefore grants nothing — the search simply never spends there, with no special case
written anywhere.

Tiers are **not comparable across activities**, and that is the point: it is what lets a
requirement read *"20 fishing, 50 combat"* rather than *"tier 3"*.

### 6.2 Every offer has a row: tier × offer → xp/hour

Do not ask whether a tier *beats* a thing. Ask **what it earns from that offer in an hour** —
which is what §1's fixed window makes answerable.

Asking "beats" covers 29 of 100 entities. Cooking is contested against nothing (`accuracy:
cooking` with no `vs`, `content/cooking.dsl:145` and seven more); crafting difficulty is only a
recipe `rate:`; thieving difficulty is a bare weight inside the action block
(`tulsa.dsl:1108-1115`) that never fails terminally; woodcutting declares no stat; 70 of 100
entities carry no stats at all. Asking "what does it earn" covers **all 242 offers**, and a
monster a tier cannot beat is simply the degenerate row that pays nothing.

Read off the matrix, all derived:

- a monster's level — the lowest tier that earns from it
- a tier's drop pool — everything it earned from, plus shops
- a quest's requirement — the lowest **per-skill profile** that completes it, from its progress
  save. A lattice, not a scalar, which is what produces *"20 fishing, 50 combat"*.

**So `level:` is never authored, on any kind.** The second draft's field is withdrawn entirely:
a second authority on difficulty whose only cross-check was structurally blind to it, and 105
hand-written numbers that would all go wrong at once the day a mechanic changed what a level can
survive.

The interesting rows fall out for nothing: an offer no tier earns from, an offer tier 1 earns
from that was meant to be late-game, and an offer whose tier **moved** since the last run.

**Item gates are not power gates.** 13 of the 26 `requires:` in `content/` gate on holding a
thing, and three of those — `sewer-key`, `sunnys-poison`, `blasting-charge` — come from quest
dialogue rather than from beating anything or from a shop. The matrix reads those as "no tier
completes it", which is indistinguishable from "too hard". A quest requirement has to be read as
a profile **plus a set of held things**, and the second half comes from the progress save it is
measured from, not from the tier.

### 6.3 The archetype is the jewel the build is required to carry

"Archetype" has no runtime concept — `content/combat-expansion.dsl:3-6` says so outright, and
`berserker` / `juggernaut` / `assassin` are the first tag in a passive's tag list and nothing
else. A tool taking "one build per archetype" from a list of names would need that list kept by
hand: the shape §6.2 abolished `level:` to avoid.

**Instead: for each cluster jewel, the best build that is required to carry it.** The subject
list is `registry.clusterJewels`, so it derives itself and a jewel added next month gets a row by
existing. Fifteen rows per tier, each directly actionable — *"builds forced to carry wrath
underperform at tier 4"* — and each independent, so a change to poison does not touch the thorns
rows.

**Required to carry, not restricted to.** Shape capacities are `point` 1, `spindle` 3, `ring` 6,
`wheel` 7, `double-ring` 12; item levels run to 18. Restricted to one jewel, a `ring` build
spends 6 points of 18 and a `crossroads` build spends 1, so "it performed badly" would mostly
mean "it had a small shape". Worse, `causeway` and `crossroads` are **connectors** whose whole
function is reaching other jewels — restricting to one would score them at zero by construction.
Requiring inclusion lets the search spend the rest of the pool wherever it likes and judges a
connector on what it enables.

A build is up to six equipment slots, each worn item with an `item-level:` carrying its own plane
and budget, and some bases arrive with a jewel already (`core.heartwood-blade` declares
`origin-cluster: heartwood-core`). *Required to carry* reads cleanly across that: the jewel
appears somewhere in the build.

### 6.4 Finding the builds

A seeded, reproducible search — greedy plus restarts over what the registry declares, candidates
constructed **through the engine's own doors** (`mintBase`, `slotJewel`, `allocate`,
`applyClusterEffect`), so connectivity, budget and every future placement rule are enforced by
the engine rather than modelled. Fitness is the build's own row in the matrix.

Fifteen constrained searches rather than one unconstrained one. Each is smaller than the free
space, and the constraint prunes harder than free search would.

A tier artifact must be re-derivable without an agent fleet. Agents may seed starting points; the
search is the thing of record.

### 6.5 A tier artifact is fingerprinted, because it drifts silently

A save stores `allocatedPositions: [1]` — a position *index* — and a `roll`. The passive at that
position is looked up at read time from `placement.jewel.positions[position]`
(`src/runtime/clusterEffect.ts:31`), and every range it declares is re-sampled at the stored roll
by `rolledAt` (`:47-49`).

**So editing a jewel's position list, or a passive's bonus range, changes what every stored build
grants — with no error, no diff in the save body, and no signal.** Adding capped resistances means
adding passives to jewels, which means every tier build becomes a different character while
looking identical on disk. That collides head-on with §6.2's regression signal: after any jewel
edit there is no way to tell *"the offer changed"* from *"the build silently became someone
else"*.

**Fingerprint it.** Store, beside each tier artifact, a hash of the resolved contribution set —
what `statBreakdown` reports for the built state. Derived from the engine, so it is not a second
authority on anything; its only job is to answer whether this is still the same character. On
re-read, recompute and compare; a difference is reported and the tier is re-derived or explicitly
accepted.

The same drift applies to the nine shipped saves that carry cluster planes today.

## 7. The ratio sheet

`npm run simulate-activity` prints, per offer, its **ratio to `R(level)`**, with the frontier marked per
level. Nothing asserted, one column a human scans — the shape `npm run review` has. A rebalance
that moves every number keeps the frontier near 1; one that breaks something puts a row at the
top. A regression check that cannot pin a number by construction.

*Nothing asserted* is not *nothing stored*: §6.2's "an offer whose tier moved" needs a previous
value on disk, and §2 already accepts stored artifacts. The prohibition is on a **test** pinning
a balance number — `CLAUDE.md`'s testing section, and `WALKED_FIELDS` (`src/runtime/save.ts:117`)
which makes it impossible for `expect:`. **Note:** `CLAUDE.md` points at `src/runtime/session.ts`
for `WALKED`; it is `src/runtime/save.ts:117`, and that pointer should be corrected.

### 7.1 The frontier is per (level, build), not per level

*Available at level L* means reachable, survivable and unlocked — all readings off §6.2's matrix,
so §7 cannot ship before §6 as a dependency rather than a preference. It also depends on §6 for
its **argument**: `npm run simulate-activity` takes one save and sweeps from it, so "per level" needs the
tier artifacts as input, which changes the command's shape.

A tier build and a floor build at the same level have different offers available, so there is no
*the* frontier at L. **The column names the build it is quoted for** — the tier for the activity
the offer pays into, derivable from which skill it pays.

### 7.2 The frontier is a maximum, and the hazard is the seed axis

Three problems, and the third is not the one the third draft named.

- **One overtuned offer sets the pace for everything else.** An activity accidentally paying 3×
  *becomes* the frontier, and every correctly-tuned offer at that level then reads as paying a
  third of target — a distortion that points away from its own cause.
- **It is discontinuous.** Adding one strong offer at level 12 drops every other level-12 ratio
  with nothing else having changed.
- **The third draft claimed max-of-N bias grows with world size. Measured, it does not**: growing
  the corpus a hundredfold with non-frontier offers moves the frontier **0.2%**. The effect scales
  as √(2 ln N) and only among offers already within noise of the leader, so it is about crowding
  at the top of one level, not about size.

  **The real hazard is the seed axis.** Per-offer variation across seeds is ~11%, the gap from
  best to second distinct offer is ~19%, and rates are reported per seed. Taking the frontier as a
  max across seeds means `--seeds 12` instead of `--seeds 1` lifts it ~11% and drops every ratio
  ~11% **with nothing in the world having changed** — a false regression triggered by a
  command-line flag.

  **The rule: mean over an offer's finished seeds, then max over offers.** A mean over *offers*
  would contradict §2's frontier ruling and nobody proposed it; a mean over *seeds* contradicts
  nothing and fixes the first and third bullets together.

### 7.3 A second column, because the frontier permits a dead world

Binding only on the frontier means a row far below it is not a defect by construction — the
ruling working as intended, and also why a world with one good activity per level and 241
worthless ones satisfies the sheet completely, while *"the city feels alive"* is why the ruling
was made.

So a second reading off the same runs: **how many offers sit within 2× of the frontier at each
level.** A level whose count is one is a level with one thing to do.

Under the old denominator this column was unreadable: 44 offers were suppressed by `engagedBy`
and 45 more paid something but produced no rate, so 62% of paying offers had no row and the count
would have read flat. §1's fixed window is what makes it mean anything.

## 8. Work order

Steps 0–3 built the instrument. Nothing has been rebalanced, and that is deliberate: three
successive measurements were overturned by the next fix to the tool, so the first act of step 4
is to measure again rather than to trust anything written here.

0. **Make the tool honest** — done, `3a046579`.
1. **Composable saves** — done, `f592becc`.
2. **Fixed-window denominator, and the resume rule** — done, `c72e9737` and `ac6268ef`.
3. **Rename to `simulate-activity`** — done, `6a10ae1c`.
4. **Land the curve** — done, `64173326`, `3a1529a7`, `71e6a885`, `2940045e`. The assertion sweep
   over the 41 is the one part not done: it waits on the ruling in `docs/balance/open-human.md`.
   The nine saves are regenerated. `equip:` was throwing away its own refusal, so the twelve level
   gates were unprovable; fixed, and one is now pinned.
5. **Instance-id remapping** (§5) — done, `803eab3c`. Where a minted id can be named is declared on
   `SaveFieldRule` beside `walked`, so `tsc` makes a new field answer.
6. **The matrix** — the search, the fingerprinted tier artifacts, the outcome matrix, the derived
   readings.
7. **The ratio sheet** — the ratio column quoted against a named build (§7.1), under §7.2's rule,
   beside the within-2× count (§7.3).

---

# Open lines

Handoff form, for `docs/balance/` — **not** `docs/skills/`, whose `open-agent.md` currently reads
"Nothing" and which measures a different feature.

## For a lane

## The saturation the design is denominated in may not exist in the early game

Attack xp is paid per point of damage dealt (`combat.dsl:42`), a skill level grants `+1` flat and
`+1%` to the skill's stat (`skill.ts:47-55`) through the unbounded `level` counter at
`stats.ts:46`, and `combat.attack` names `core.attack`. Damage buys levels which buy damage. Today
the loop is slow enough to ignore: the pace test at `tulsa.dsl:1778-1782` stays at level 1
throughout. Under the new curve 350–750 xp is levels 4–7 and attack rises roughly 1.7× *mid-run*,
so the measurement accelerates itself.

A maximum selects whichever offer that acceleration inflated most (§7.2), so the frontier
concentrates this error where a mean would dilute it. This is a precondition for trusting the
column, not an improvement to it.

*Blocked on step 4* — under today's curve the effect does not appear.

*Closes when:* a run at a fixed node is measured at several window lengths and the rate is shown
either to converge, naming the level above which it does, or not to.

## Nothing proves the level gates a shifted save now clears

`fishing.dsl:92` and `:135` gate the large net and horsehair line on `level.fishing >= 10` and
`>= 15`. No route proves either refusal, which is why step 4's nine shifted saves redden nothing
while quietly changing what their characters can wear.

*Closes when:* a route pins at least one `requires:` refusal, or the `refuse:` grammar is shown
not to reach it and the line moves to the author. Related: `docs/open/open-agent.md` records that
`refuse:` takes no `use`.

## Whether any row in the matrix is non-monotone

Reading "the lowest tier that earns from it" as a difficulty assumes more of a stat never makes an
outcome worse. The shipped thorns does **not** break it: `# passive retribution` is `when hit:
drain: 5 health from them` (`combat-expansion.dsl:127-129`), a flat cost per landed hit, so total
thorn damage falls as attack rises. A scaling reflect would break it, and so would anything keyed
on a ratio such as an enrage below half health. A violation is a finding, not a tool failure.

*Closes when:* the matrix is checked for non-monotone rows and either none are found or the ones
found are named.

## A fixture marked `aggressive` may not be hostile at all

`scripts/balance.test.ts` had a wasp marked `aggressive` that had never engaged anyone: neither it
nor the player declared a faction, and `hostile()` treats two faction-less entities as the same
side, so the aggression path was unexercised. Fixed there. A manual sweep of the others has a
shelf life of one commit.

*Closes when:* a derived claim in `src/content/dsl.test.ts` holds every `aggressive` declaration
to being hostile to something — subjects generating themselves, per `CLAUDE.md`'s Mission.

## The four-hour backstop comment is stale

`src/runtime/runtime.ts:609` says *"Nothing in the corpus spends more than half a minute here."*
The sweep produces `core.melee-combat on tulsa.oolga`, which never resolves and burns the full
four game hours: `hitDamage` floors damage at 1 (`stats.ts:202-205`) while `core.regeneration` has
base 1, so a build that cannot out-damage regeneration never terminates. That cell is precisely
the "one tier below" case a matrix exists to find.

*Closes when:* the comment says what is true, and §6.4 states what a non-terminating cell costs
and how it is scored.

## For the author

## Where the line sits between a balance number and a path fact

41 of the 66 numeric `assert:` lines sit on `walked: false` roots, so giving `assert:` the
blindness `expect:` has would kill all of them — including real path proofs, since
`inventory.coin = 0` after a purchase proves the purchase happened.

The candidate rule: a number a *balance pass* would move is a balance number; a number a scripted
hand-over produces is a path fact. Under it `inventory.coin = 6` is balance and
`inventory.small-fishing-net = 1` is a path fact.

*Moves when: he states the rule, or rules that the candidate is it. Then the sweep over all 41 is
a lane's afternoon.*

## What N is, per activity

§6.1 sets a tier's pool at N × one skill's cost, N being the skills the activity uses. Two for
combat, one for fishing. Whether that is the right size is a judgement only play answers.

*Moves when: the first matrix is read and the tiers either land where they should or do not.*

## Whether a jewel no build can win with is buffed or accepted

§2 rules that a jewel with no winning build is a finding. Whether the answer is to buff it or to
accept that it is not meant to carry a tier — `crossroads` is a connector and may never win one —
is not a lane's call.

*Moves when: the first matrix shows a jewel with no winning build at any tier.*

## Whether a derived requirement is ever shown to a player

§6.2 produces *"20 fishing, 50 combat"*. There is nowhere to put it: `# quest` has no `requires:`
field (`src/content/sections/quest.ts:33-41` — stages carry `done when:` conditions), nothing
authored can hold a derived profile, and `docs/skills/open-human.md` already records that a
`requires:` refusal never reaches the screen. Whether this is a designer's instrument only, or
something the player reads, changes what has to be built.

*Moves when: he says whether a player ever sees it.*
