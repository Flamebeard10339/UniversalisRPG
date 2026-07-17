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
| 3 | 18% (189k) | +8% (27→35%) | $7.67 | 89% | LIGHT turn: reviewed + committed chunk-1 completion + 3 doc/memory edits, NO new subagent spawned. Still +8% — at 189k context the fixed context re-read (cache-read 11.1M) makes even a no-heavy-work turn cost ~8% of budget. Opus 60%. This is the quadratic floor rising: the per-turn cost of *existing* is now the issue, independent of the work done. Recycle here. |

## Read of the curve (after 3 turns)

The session hit **35% of the 5h budget across ~4 substantive turns** (context 124k→189k). Two things are clear:
- **The per-turn floor rises with context.** A light turn that spawned nothing still cost +8% at 189k, vs the +10% of a heavier turn at 124k. The cost of *carrying* the context is overtaking the cost of the work.
- **Delegation shifts work to Sonnet (40% of spend) but does NOT stop the Opus-context climb (still 60%).** So delegation is necessary but not sufficient; the orchestrator MUST be recycled, not just kept lean.
- **Budget, not context %, is the binding limit** — we reached the recycle decision at only ~18% context but 35% budget. Recycle triggers should key off the budget meter.

Recycled at turn 3 (clean boundary: chunk 1 committed, state in `MEMORY.md` + `project-dsl-branch-deliverable`).
