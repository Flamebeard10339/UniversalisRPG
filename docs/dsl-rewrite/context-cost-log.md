# Orchestrator context-cost curve

Testing the quadratic hypothesis: does the cost of an Opus *planning* turn rise
with session context size? Running one planning session from ~12% context up to
~50%, recording usage after each turn. If per-turn budget cost climbs steeply as
context grows, that confirms the recycle-before-full discipline in
`delegation-experiments.md`. Usage values are pasted by the user (the assistant
cannot invoke `/usage`).

| Turn | My context | 5h-budget Δ | Session $ (cum.) | Cache hit | Notes |
|-----:|-----------|-------------|------------------|-----------|-------|
| baseline | 12% (124k) | 0% | $6.57 | 92% | after committing the play layer + strategy discussion; before grammar work |
| 1 | ~13% (est.) | +10% | $1.89 | 82% | strategy conclusion + 4 memory/doc writes, no big reads. 5.9M cache-read tokens for the turn — one "lean" planning turn ≈ 10% of the 5h budget. |
| 2 | 17% (174k) | +17% (10→27%) | $5.97 | 87% | coding turn: reviewed diff + committed chunk-1 partial + spawned follow-up. Delta INCLUDES the full chunk-1 Sonnet agent (125k tok) + follow-up start. Session split Opus 59% / Sonnet 41% — **my growing orchestrator context is still the majority of spend** despite delegation (cache-read 8.8M vs 5.9M). Confirms: keeping MY context small (recycle early) is the dominant lever, not which model codes. |
