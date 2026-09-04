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

## What should trigger a one-home audit, if anything cheap can

Ruled 2026-09-04: **it stays manual.** This line exists so the next person does not
re-derive the two detectors that were already tried and found wanting.

What happened. An adversarial audit of the authorbot directive found six facts with more
than one home, four of them already drifted. The top one had been introduced **six hours
earlier, in this same session, by the agent that had opened the day by fixing the identical
shape** — `19c65458` added `--ask-for` and `--answer` to the harness and did not touch
`.claude/skills/authoring/SKILL.md`, which was a hand-typed copy of the flag list. The cost
was not a stale list: the skill went on telling the next orchestrator to dispatch a run and
get on with something else, while the harness had begun standing a run still for ten minutes
a question, waiting for an answer nobody had been told to give. Wrong instructions are worse
than missing ones, and a milestone cadence would have shipped them.

So the trigger question is real. Two candidates were measured on the day and **both failed**:

- **Co-change mining** — flag a commit that touches one file of a historically coupled pair.
  It cannot see this pair: `scripts/authorbot.ts` has 22 commits, `SKILL.md` has 3, and they
  overlap once. Four and a half percent, so any threshold that catches it catches everything.
  The copy drifts *because* it is barely maintained, which is exactly what starves the signal.

      A=$(git log --format=%H -- scripts/authorbot.ts | sort)
      B=$(git log --format=%H -- .claude/skills/authoring/SKILL.md | sort)
      comm -12 <(echo "$A") <(echo "$B") | wc -l

- **Flag coverage** — compare the flags a parser accepts against the flags the prose mentions.
  It fires correctly on all three commits that drifted, naming exactly the missing flags each
  time. It also fires on the *corrected* state, because the fix was to delete the list and
  point at `--help`: silence is not the defect, and a detector that shouts at the right answer
  gets ignored inside a week. Extract with `grep -oE "'--[a-z-]+'" scripts/<tool>.ts | sort -u`
  against `git show <ref>:<file>`, which is the whole of the experiment.

The rule that survives both — *fire when a declared set grows and no prose describing it changed
in that commit* — needs a cursor recording what has already been looked at, or it nags forever
about a thing already decided. **A cursor is state, state is setup, and setup breaks.** That is
the trade that was refused, not the detector.

*Moves when: it happens again, **and** there is a trigger that neither nags about a finding
already judged nor rests on machinery that can itself go wrong. Until both hold, the audit is
run by hand — on a subsystem nobody has ever audited, and straight after closing a violation,
which is when the files with twins have just been touched.*
