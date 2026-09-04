# Combat: write every passive as a share of a level

Nearly every `# passive` in `combat.dsl` carries an amount somebody chose — `+3
physical-damage`, `+25 max-health`, `+12% max-health` — with nothing saying what a passive of
that rarity at that plane cost is allowed to be worth. That is how the health jewels came to
sit hundreds of points over the ladder with nothing noticing.

**Ask the module how many there are rather than trusting a count here.** `grep -c '^# passive '`
on your copy says how many, and those already carrying a `grants:` line are the ones done.

The engine now answers it. A passive says what share of a level it is worth and the number is
written for it, so a ladder that moves re-cuts every passive hanging off it. Your job is the
judgement the engine cannot make: **how much of a level each passive is worth.**

## What to write

`npm run oracle -- passive` is the reference. The form is a block of multiples:

    # passive immovable
    juggernaut, life
    grants:
      +1x added core.max-health

`+1x added` is worth exactly what one level adds to that stat. `+2x increased` is worth twice
what one level increases it by, and lands as a percent. A negative multiple takes away. The
two already converted are `combat.immovable` and `combat.reckless` — read them first.

`npm run oracle -- ladder` prints what each ladder says, and `npm run oracle -- stat` shows
which stats declare a `rounds to:` step. You do not need either to write a passive; they are
there when a result looks wrong.

## What the multiples should be

This is the whole judgement and it is yours. What is settled: a passive is worth **a share of
a level**, so the question for each is "how many levels of this stat is one point of this
worth", and the answer is usually a fraction or a small multiple. Prefer round ones — halves,
quarters, whole numbers.

What must come out of it is a **spread**, because rarity is scarcity and a rare passive that
is worth the same as a common one is not rare, it is decoration. The rarity of the jewel a
passive sits on is what should drive its multiple. `npm run oracle -- cluster-jewel` says
which passives sit on which jewels, and the jewel's own rarity and item level say how many
points a player is spending to reach it.

Say in the report what spread you chose and why — the ratio between the commonest passive and
the rarest one is the single most useful number this run can hand back.

## Three things that will bite

**A grant against a stat that climbs no `# ladder` mints nothing at all.** `core.defense` and
`combat.attack-rate` are unladdered today. `npm run oracle -- --at <your corpus>` reports every
one of these as a remark, and a run that ignores the remark ships passives that grant zero.
Where a passive wants an unladdered stat, **leave its authored modifier alone** and say so in
the report — the list of stats that turned out to want ladders is a finding worth more than
the conversion.

**A passive may carry both.** `combat.reckless` has an authored `-2 defense` on its tag line
and a `+2x increased physical-damage` under `grants:`. That is the pattern for a passive whose
halves are not both laddered.

**Some passives grant nothing at all** — three are behaviour only, with `on hit:` hooks and no
stat. They stay exactly as they are. So do the four that scale `per rage` or `per stack`,
whose worth depends on what is held rather than on the ladder; converting those is not on the
table and neither is inventing grammar for them.

## What not to do

Do not run `simulate-activity` and do not tune. The multiple is the balance. If a converted
passive reads wrong, the multiple is wrong or the stat wants a ladder — both are one line.

Do not rename anything. A separate lane renames every passive id and the two must not run
together; a run that renames as it converts makes both un-reviewable.

Do not touch `# tier`, `# profile`, `# ladder`, the damage types or the jewel plane.

## Done means

- Every passive whose worth is a share of a level says so with `grants:` and carries no
  hand-written amount for that stat.
- `npm run oracle -- --at <your corpus>` is green and reports no passive granting against an
  unladdered stat, except those the report names and explains.
- The report says the spread chosen, the ratio between the commonest and rarest passive, which
  passives were left hand-cut and why, and which stats turned out to want ladders.
