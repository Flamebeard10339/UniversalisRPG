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

### `audit-probe-tooling` pass 2 — 2026-08-03, independent auditor

Both tools carried the pass. Everything below is a gap I hit while using them in anger, ordered by
what it cost.

**1. "Which tests actually cover this line?" — the scope guess is the whole game, and nothing helps.**

Every mutation needs a `tests` scope, and the scope decides what the verdict means. I had no way to
ask, so I read the test file by eye and grepped for the symbol. I guessed wrong at scale: a
fourteen-mutation battery run at file scope produced five `SURVIVED`, and when I re-ran the survivors
against the whole suite one of them (`universe-drops-globals`) turned out to be `KILLED` — the file
scope simply did not contain the test that catches it. Cost: one entire battery re-run, ~6 minutes,
and five findings I nearly wrote up on a scoped verdict that would not have held.

The tool already knows a scoped `SURVIVED` is the weaker claim; c8 exists to say so. It could act on
it: **re-run survivors against the whole suite automatically** (`--escalate`), or report
`SURVIVED (file scope only — not confirmed against the suite)`. Either would have removed the round
trip and the near-miss.

**2. "Show me what vitest actually printed." — I created and deleted test files in the repo to see it.**

The highest finding of pass 1 was about which stream mutate reads. To confirm it I needed vitest's
stdout and stderr, separated, from a run with a failing test. `mutate` captures both into `raw` and
now prints a tail on `ERROR`, but there is no way to get them for a `KILLED` or `SURVIVED`. So I
wrote `scripts/zz-audit-tmp.test.ts`, ran vitest by hand with `> out 2> err`, and deleted it —
twice. That is exactly the abandoned-`zzprobe*.test.ts` pattern this branch's Deliverable was
written to end, reproduced by the auditor of the branch that ends it.

**What would have answered it:** `--keep-output <dir>`, writing `<mutation>.stdout` / `.stderr` per
run. A `--verbose` that printed the tail for every verdict rather than only `ERROR` would have got
me most of the way.

**3. "Refuse my manifest before you spend four test runs on it."**

My first harsh manifest had one wrong `find` — two spaces of indentation where the file has none.
`mutate` measured four unmutated baselines, ~90 seconds of test runs, and *then* printed
`applied nothing — the manifest was refused`. `refuse()` is pure and needs nothing but `files.read`;
the baseline pass is the most expensive thing in the run. Running them in that order is free to fix.
Cost: one round trip, and it will cost more the first time someone refuses a whole-suite manifest.

**4. "Would this mutation change what I think it changes?" — there is no dry run.**

`find` is exact text, so the whole authoring loop is: guess the bytes, run the tool, read the
refusal, adjust. Three of my mutations needed a `cat -A`/`grep -n` round trip against the source to
get indentation right. A `--dry-run` printing the unified diff each mutation *would* produce, with
no baseline and no test run, would collapse that loop and would also have caught entry 3. It would
also catch the more dangerous version: a `find` that matches something other than what was meant,
which currently produces a confident verdict about a mutation you did not write.

**5. "Ask the per-module round trip." — probe cannot, so I imported `src/content/` from a scratch file.**

`roundTripUniverse` and `roundTripModule` answer two different questions, both live. `--round-trip`
reaches only the first. To ask the second — does serializing module X alone preserve X's edits, the
contribution-system H1 shape — I wrote a twelve-line `tsx` scratch file importing
`src/content/roundTrip.ts` by absolute path. It reaches into the content layer from outside any
layer, which is the shape the branch exists to remove, and it is the second time in two passes that
the interesting question needed a hand-rolled runner.

**What would have answered it:** `--round-trip-module <id>`, or `--round-trip=module|universe`. The
implementation is already exported and already tested; only the flag is missing.

**6. "Is a journal live right now, and where is it?" — no command, and the crash does not say.**

To find the journal I ran `node -e "path.join(os.tmpdir(), ...)"`. When I wedged it with a truncated
file the stack trace named `scripts/mutate.ts:310`, not the journal path — so the one instruction the
tool gives ("delete it if you know it is gone") has nothing pointing at what to delete.
`npm run mutate -- --journal` (print it, `--journal clear` to drop it) would answer both, and would
give the busy-message somewhere to send people.

**7. "Show me this record" — the vocabulary is split and I guessed wrong.**

`--show variable.travel-seconds-per-unit` is refused; `--show variables.travel-seconds-per-unit`
works. The accepted list mixes nine singular section kinds with three plural registry map names, and
the refusal prints them in one undifferentiated row. I read `# variable` in the DSL and typed what
the DSL says. Cost: one round trip. Either accept both spellings, or group the list
(`kinds: … | maps: …`) so the two vocabularies are visibly two.

**8. What should stay out of the tool.**

I wanted `mutate` to generate a manifest from a diff — take the branch's changed lines and propose
mutations. It should not. Choosing what to break *is* the audit judgement, and the two mutations that
mattered most this pass (reverting the H1 and H2 fixes verbatim) are ones no generator would have
proposed, because they are semantic reversions rather than syntactic perturbations. A generator would
add volume and bury them. The `find`/`replace` manifest, written by hand, is the right shape.

I also do not want `probe` to gain assertions. `--each` exiting 0 on a table of rejections is right,
and the moment it can fail on a predicate it becomes a test framework with worse ergonomics than
vitest.

### What has since changed — 2026-08-03, branch author

Not a rebuttal, and the entries above stay as written; this only stops a later reader treating a
closed gap as open.

- **Entry 1 (scope guessing) is closed by the tool, not by discipline.** A scoped `SURVIVED` is now
  re-run against the whole suite automatically and reported as `one.test.ts -> whole suite`. The
  near-miss that cost a battery re-run cannot happen: a narrow `SURVIVED` no longer exists as a
  final verdict. It is also the performance fix — a thirteen-mutation battery went from ~12 minutes
  at whole-suite scope to **33 seconds** at file scope, because only survivors pay for the suite.
  Baselines are measured on first use for the same reason.
- **Entry 3 (refuse before the baselines) is closed.** The manifest is validated first.
- **Entry 5 (the per-module round trip) is closed.** `--round-trip=module` asks it; the hand-rolled
  `tsx` file is no longer the only route.
- **Entry 6 (find the journal) is partly closed.** The journal is per-checkout, an unreadable one is
  reported by path and discarded rather than crashing, and a live one names its path in the refusal.
  There is still no `--journal` command to print or clear it.
- **Entry 7 (split `--show` vocabulary)**: the refusal now groups them as `section kinds:` and
  `registry maps:`, so the two are visibly two. Both spellings are still not accepted for one record.
- **Entries 2 (`--keep-output`), 4 (`--dry-run`) and the rest of 6 are open**, and entry 8's two
  "leave it out" arguments are accepted as written.
