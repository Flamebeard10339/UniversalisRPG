# Audit tooling friction

Feedback on `npm run probe` and `npm run mutate` from the agents that use them, collected so the
tools can be refined against real use rather than guessed at.

This is **not** a backlog. Nothing here is triaged, promoted or scheduled, and an entry is not a
finding — a finding says the tool is wrong, an entry here says the tool did not have a way to answer
something an auditor wanted to ask. Entries accumulate until there are enough to read holistically;
the point is to see which gaps keep recurring across independent passes, because a gap that shows up
three times is a design signal and a gap that shows up once is a preference.

A real defect still goes through `docs/audits/` and `npm run tasks -- triage` as usual.

## What an entry should say

- **What was being asked.** The audit question, not the command.
- **What was reached for instead.** A hand-rolled script, a `git` command, a scratch vitest file,
  reading source by eye — whatever filled the gap.
- **What it cost.** Round trips, wall-clock, or a wrong answer that had to be walked back.
- **What would have answered it.** A flag, a different output, a new command, or nothing — "this
  should stay out of the tool" is a useful entry too.

## Entries

<!-- Append below. Newest last. Name the pass and the date. -->
