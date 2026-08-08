# graph-based-items-research

**Retired 2026-08-07. Do not work this spec.** It gated `items-mods-and-crafting` on whether a rolled
directed graph of mod nodes, interacting through a universe-wide resonance relation, gives the player
real and legible agency. That spec was rewritten the same day to replace the graph with an authored
passive tree grown by slotting orbs: balance is local to an orb rather than global to the resonance
constants, and legibility — which the clauses below name as the load-bearing uncertainty no probe
could settle — is answered structurally by a tree the player reads. There is no graph left to
research. `docs/smithing/topology-probe.md` stands as a measurement of a design not taken.

Everything below is the promise as it was written, kept as history.

## Deliverable

One short report, beside `docs/smithing/topology-probe.md`, answering whether placing mods into a
graph gives the player agency — and therefore whether `items-mods-and-crafting` should be built at
all. The probe measured a synthetic model and reported that placement is worth 24% against an oracle
where interchangeable slots are worth 5%, and that the obvious heuristic leaves 27–33% on the table.
This branch decides whether those numbers mean what the spec built on them assumes.

Its primary output is a **control surface**, not a verdict on one operating point. Choosing how much
agency this game wants is a decision about a game that does not exist yet, and committing to a
number now is a bet placed before there is anything to feel. A system whose dials are known can be
retuned when play disagrees; a system tuned once by argument cannot. So the report establishes what
range is reachable and how to move within it, locates today's defaults inside that range, and only
then asks whether the defaults are a sane place to start.

Proof:

- Agency is defined as a ratio, and it is measured against luck rather than absolutely. **Skill
  spread** is power(best placement) over power(naive placement) on identical drops; **luck spread**
  is power(luckiest) over power(unluckiest) drop sequence of equal length at fixed skill. A player
  experiences skill as mattering when the first is comparable to or larger than the second, and a
  mechanic whose arrangement spread is impressive while luck dominates it is a lottery the player is
  right to read as one. The report states what observation would refute the claim; a definition no
  result could fail is not one.
- Acceptance is a band with two edges, not a minimum. Below the floor the decision is
  indistinguishable from a slightly better drop. Above the ceiling the naive player is no longer
  making a worse choice, they are paying a tax for not having read a wiki. The report names both
  edges and says where `greedy = 0.668–0.719` falls between them — at two-thirds of optimum the
  defaults sit nearer the ceiling than the floor, which is the opposite of the risk the probe's
  framing implies and is the direction this report should be most careful in.
- Every parameter that moves agency is named with its direction, its usable range, whether its
  effect is monotonic, and which other parameters it interacts with. The probe already found several
  — pool size (F13), max in-degree and its ceiling (F17), node count, the gain and damp magnitudes,
  the resonance relation's sign, and tier width — but they are scattered across findings rather than
  presented as a control surface. A parameter whose effect is not monotonic is not a dial, and the
  report says so instead of listing it.
- The report locates the shipped defaults on that surface and states whether the reachable range
  brackets half and twice the current agency. If the answer is no in either direction, that is a
  finding about the mechanic's flexibility and belongs in the verdict, because a system that cannot
  be retuned when play disagrees is the bet this branch exists to avoid placing.
- It separates three questions the existing numbers do not distinguish: whether the placement
  decision **matters**, whether it is **non-trivial**, and whether it is **legible** — whether a
  player can reason toward the better placement rather than finding it by accident. The first two
  are measured; the third is measured nowhere. `greedy = 0.668–0.719` is where this bites, because
  one number is doing two jobs: it is the evidence that placement is a real decision and the
  evidence that the obvious play is wrong by a third. Which one a player experiences turns on
  whether the resonance relation is visible to them. The report takes a position and says what would
  settle it.
- It accounts for permanence and incremental acquisition. F15 measures a wealthy player with the
  whole pool in hand, and the probe already concedes that part of the 24% is irreducible because the
  oracle sees the future. The report says how much of the measured agency survives a player placing
  mods one at a time, without foresight and unable to undo — and whether what remains reads as a
  decision or as a tax.
- It states which findings depend on the synthetic model's stat vocabulary and which survive the
  shipped one. `items-mods-and-crafting` already concedes F6 and F8 do not transfer until the real
  stat set supports tags; the report either extends the model, scopes the claim to what transfers,
  or explains why the difference does not bear on agency.
- It names the counterfactual it beats, in the same units. The claim that matters is not that graphs
  give agency but that they give more of it than the simpler thing they would replace —
  interchangeable slots, a pure ranking, or a flat mod list — and a reader must be able to see the
  comparison rather than infer it.
- It ends in exactly one of three verdicts, and the verdict is about the reachable range rather than
  one operating point: the surface is wide enough and the defaults sane, so `items-mods-and-crafting`
  proceeds; it is wide enough after one named extension, specified precisely enough to execute; or
  the mechanic cannot be moved to where this game would want it and that spec is retired. "More
  research" that does not name which research is not a verdict.
- Every number it cites is either reproducible — naming the command, branch and parameters that
  produce it — or marked as a judgement. The probe living on `smithing-topology-probe` rather than
  main is not an obstacle: naming the branch is enough.

## Decisions

- **Tunability is asked before sufficiency, because it is the answerable question.** "Is 24% enough
  agency?" cannot be answered by anyone who has not played this game, and nobody has. "Can this
  system reach half or twice that, and by turning what?" is answerable today from the model that
  already exists. Establishing the range converts the threshold from a bet placed now into a choice
  made later with better information, which is the whole reason this branch gates the build.
- **Agency is measured against luck, not on its own.** An arrangement spread of 1.5x means nothing
  if drop luck swings power by 3x over the same interval — the player will read the game as a
  lottery and be right. Every absolute agency number in `topology-probe.md` is uninterpretable until
  it is put beside the luck spread of the same run, and that comparison does not exist yet.
- **The band has a ceiling, and the defaults are near it.** The probe presents "the obvious
  heuristic captures only 67%" as unambiguously good. Read the other way, a player who does not
  understand the resonance relation plays at two-thirds power, which is a knowledge tax rather than
  a decision. Naming the ceiling is what stops this branch from optimising into opacity.
- **A negative verdict is a success.** This task exists because the answer might be no. A research
  task that can only conclude yes is advocacy with a bibliography, which is why the clauses above
  require a refutable definition and admit a retire-the-spec outcome.
- **The deliverable is judgement, not volume.** The probe is 2,500 lines and 20 findings; the gap is
  not more measurement but a reading of what has been measured. The report should be short enough to
  hold in one sitting and should state its verdict before its argument.
- **Legibility is the axis, and no probe settles it.** A search over arrangements can say the best
  placement beats the obvious one by a third. It cannot say whether a player can tell, and a
  decision a player cannot reason about is a lottery with extra steps. Naming this as the load-
  bearing uncertainty is most of this branch's value.
- **`items-mods-and-crafting` waits on the verdict, not on this branch's length.** A one-page report
  that answers the question closes this branch. The gate exists so the answer precedes the
  investment, not so the investment is delayed by a document.

## Open questions

- Whether legibility can be answered at all without something playable. If it cannot, the honest
  form of verdict two is "build the cheapest playable slice and look", which is a different shape of
  answer than more simulation and would make this branch's extension a prototype rather than a
  study. The report is allowed to reach that conclusion.
