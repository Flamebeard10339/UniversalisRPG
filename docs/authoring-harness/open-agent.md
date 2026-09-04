# The harness that authors the world — what a lane can take

`npm run authorbot` hands one brief to an agent over a copy of `content/`, refuses it the
engine, and counts every reach. `--floors` gives it `floors/` instead and tells it the opposite
thing about balance. `.authorbot/runs.jsonl` records what every run was asked for and what it
cost. This folder is that machinery's, not any one world's.

**A line is deleted the day it closes.**

---

## Whether parallel runs that share their best would beat runs seeded one after another

Raised by the author 2026-09-04: three speedrun agents at once, sharing their best route every
ten minutes, or writing to a board they all read.

**The cheap version of this already works and is the thing to beat.** Thieving's floor went
4.75× the curve → 2.13× → 1.04× → 0.93× across four runs, the first being a naive route the
author wrote in five seconds to give the lane somewhere to start and the three after being
sequential refinements of it. `floors/` is already the shared state, and the speedrun brief
already says a run seeds from it and hands back something faster. So the question is not
whether sharing helps — it demonstrably does — but whether sharing *concurrently* beats
sharing *between* runs, and nothing measures that yet.

The experiment that would decide it costs about an hour and no new machinery: dispatch a floors
brief, re-dispatch it seeded from its own result, twice. If each run improves on the last, the
sequential path is enough and parallelism only buys wall-clock. If they plateau at once while
three independent runs from the same seed find different strategies, sharing concurrently has
something to offer.

Two things to hold on to if it is ever built. **A board is the wrong shape**: turns are the
scarce resource, prose between agents cannot be checked, and what is worth sharing here is
typed — a route body and the minutes it took, which the orchestrator can re-walk and verify
before publishing, so no run can poison the pool with something that does not hold. And this
works for floors runs and almost nothing else: they never write `content/`, so every agent's
world is byte-identical and a route found in one provably walks in another. Authoring runs
share neither a scalar to compare on nor a portable artifact.

**Premature convergence is the risk, not the plumbing.** Three agents that all see the best
route at minute ten refine one answer instead of finding three; share late and sparsely.

*Closes when:* the three-seeded-runs measurement is on the table, and either it says sequential
seeding plateaus — in which case a verified route leaderboard is worth building — or it says it
does not, and this line is deleted.

## A run spends turns discovering which corpus is its own

`birds-and-the-bees-pass` reached for the engine four times and every one was a `grep` at
`content/tulsa.dsl` or an absolute path into this checkout rather than at its own copy. The
refusal explains the copy well once it fires, but the instinct it corrects is the natural one.

A related false positive is fixed: a command naming the run's own corpus is no longer refused
for saying the word `content` elsewhere in itself, which had cost `plague-matters` a turn on an
exclude pattern. What is left is the first reach, which teaches by being refused.

Small, and possibly not worth fixing: a line in the system prompt naming the corpus path in the
same breath as "read any of them" might spend more attention than the refusal costs.

*Closes when:* a run stops spending turns on this, or it is ruled cheap enough to keep.

## The run log is gitignored, so the history is one machine's

`.authorbot/runs.jsonl` holds thirty runs and about nine and a half hours of authoring, most of
it backfilled from workdirs that temp will eventually clear. It is gitignored because the
timings are this machine's, because an append-only file conflicts whenever two runs land on one
branch, and because it is measurement rather than source.

That is defensible and it means the history dies with the machine. If it is ever worth keeping,
the answer is probably not to commit the file but to write a digest — runs, medians, the
outliers and what they cost — that a human reads and git keeps.

*Closes when:* the history is either ruled disposable or given somewhere durable to live.
