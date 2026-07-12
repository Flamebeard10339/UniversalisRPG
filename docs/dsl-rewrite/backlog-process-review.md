# Process drift audit — how the DSL architecture drifted this badly

This replaces the hypothesis list originally written in this file with actual
findings from git history and the (locally-only, untracked) `.planning/`
directory. Short version: the process failure wasn't "nobody noticed the
problems." Every major problem in `postmortem.md` was noticed, in writing,
*before* it metastasized — the round-trip gap, the module-conflict-cascade,
the contribution-mode/DSL duplication, and the need for exactly this kind of
audit were all written down as explicit to-do items ahead of time. None of
them were acted on before more feature work landed on top. That's the actual
finding, and it's a sharper, more actionable one than "be more careful."

## Timeline

The whole project spans about 25 days (first commit `8465481` "Implemented
base stack" on 2026-06-17 to the DSL teardown on 2026-07-11). Within that:

- **2026-06-30**: `.planning/json-rendering-redesign.md` is written — a design
  doc for the structured JSON editor, arriving at "one recursive render
  function dispatching on value type, not three renderer types, with
  list-mode declared in schema rather than inferred at runtime." This shipped
  the same day as a small, well-scoped commit (`cff4406`, 2 files).
- **2026-07-02**: `.planning/mod-centric-refactor.md` is written and the
  "mod centric data refactor" commits follow (`67c4ee6` → `26a900a`) over the
  same day.
- **2026-07-08**: The DSL is spiked and versioned to 0.2 and 0.3 *the same
  day* (`856a7f6` spike → `56de839` "DSL 0.2" → `f0c23aa` → `a942aed` DSL
  editor with ghost text → `7f16bd7` "DSL 0.3", plus `e7c3590` "removed legacy
  contribution mode" the same day, -3277 lines).
- **2026-07-09**: `a1085ca` "DSL 0.4" and `95a75ef` "Added additional semantic
  rules to the DSL + culled most of base-core" — two more version bumps in
  under 24 hours, plus a full day of Edit-tab UI iteration.
- **2026-07-11**: `dcc74f6` → `c1ea386` → `c6beedf` → `47f41fb` → `4584d22` →
  `a0765d7` — six substantial architecture commits rebuilding the entire
  GitHub contribution flow, extending the `# patch` grammar, adding the
  differ, and packaging/splitting the bundle — **all on a single calendar
  day**, each one building directly on the previous commit's output within
  hours. This is the entire system `postmortem.md` calls "hacky." There was
  no gap between any of these commits large enough for a design pause; each
  one was reacting to what the previous commit had just made possible or
  broken.

Four major DSL version bumps in ~36 hours, then the entire contribution/patch
system built in one day, is the concrete shape of "feature-reactive grammar
growth" — not a vague pattern, a literal same-day chain of commits with no
room between them for the "does this fit the existing shape" question to get
asked.

## The fixes were already written down — three times — and not done

**1. The round-trip gap.** `.planning/todo.md:51`, in a short numbered list
dated (by position in the file) to shortly after the DSL's initial rollout:
*"2. Create a DSL->Object->DSL for every object that is deterministic and
doesn't change on repeated loops."* Item 4 in that same list is blank — the
list itself was abandoned mid-thought. This is the exact fix `postmortem.md`
identifies as the root cause of the round-trip gap, written down as a known
next step, and never implemented. It wasn't an oversight; it was a captured
requirement that lost a priority fight against new features (the entire
contribution/patch rebuild on 07-11 shipped on top of the still-missing
round-trip, adding a bigger structure — the differ — on the missing
foundation rather than building the foundation first).

**2. The module-conflict-cascade.** `.planning/todo.md:64-74`, under a
section literally titled **"Think required"**: *"Need a stable fix for module
failure cascade: see CLAUDE.md,"* quoting CLAUDE.md's own line that the bug
"has happened twice." The user correctly triaged this as needing real
architectural thought (not a quick patch) and wrote it down — under a heading
that exists specifically to mark "don't just code this, think first." No
architectural fix followed; the cascade's blame-and-disable-whole-module
design was unchanged at deletion time. A problem correctly identified as
deserving deliberate design time got the label, not the time.

**3. The contribution-mode/DSL duplication.** `.planning/todo.md:426-458` is
the DSL's actual design conversation, and it's explicit: *"I do think
contribution mode needs a complete refactor (rip out everything and start
over)... Essentially what I am suggesting is creating a DSL for the
application and scrapping the contribution mode features entirely."* The plan
was for the DSL to **replace** structured/visual content editing, not run
alongside it. `e7c3590` ("removed legacy contribution mode," -3277 lines, same
day as the DSL spike) executed exactly that. But structured editing came back
within days as `ContributionMapEditor.tsx` and was never reconciled with the
DSL text — `postmortem.md` finds these as two permanently disconnected
authoring surfaces at deletion time. The plan called for one system; a second
one grew back and nobody revisited whether that matched the original
intent.

**4. The audit itself.** `.planning/todo.md:221-226` is a 4-step plan written
before most of the grammar/contribution work: *"1. Cull the old UI... 2. Fill
out the rest of tutorial island in DSL format, see how it feels... 3.
Aggressively flag every inconsistency/inefficiency in the workflow. Set aside
our assumptions and consider how it should work, rather than how it does.
Then refactor unless there is a good reason for it... 4. Make refinements to
the DSL + ContentModule based on the results with the goal of simplifying,
hardening and reducing edge cases."* Step 3 is, almost verbatim, the audit
that produced `postmortem.md`. Separately, `.planning/todo.md:107-120` ("Pre-
0.1.0 Release Readiness Audit") explicitly asks *"(Is the DSL -> Game workflow
efficient or convoluted?)"* as a question to answer before release. Both are
the right instinct, written down twice, ahead of time — and both times, step
4-shaped work (the patch grammar, the differ, the bundle packaging) shipped
before step 3 happened. The step-3 pause got skipped in favor of the next
feature twice in a row, which is exactly how the grammar reached 781 lines and
the contribution pipeline reached six architecture commits in one day before
anyone (human or agent) actually did the "set aside assumptions" pass — until
this session forced it externally.

## What this rules in and out

- **Not a knowledge problem.** The right calls (round-trip needed, cascade
  needs a real fix, one system not two, pause-and-audit before more features)
  were all made correctly, on paper, ahead of time.
- **Not (primarily) an AI-agent problem.** These plans predate and span
  multiple sessions/tools (the JSON-rendering note explicitly mentions
  struggling to brief "codex"); this is a project-level pattern, not one
  agent's blind spot in one sitting.
- **A forcing-function problem.** `.planning/` is a rich, honest planning
  practice — but it is **not tracked in git** (`git check-ignore` confirms
  it's not even gitignored, just never `git add`ed) and `todo.md` alone is
  2500+ lines. Writing "think required" or "aggressively flag every
  inconsistency" into a file with no owner, no due condition, and no link to
  the commits that should have been gated by it, produces exactly what
  happened: correct intentions with no mechanism that makes acting on them
  cheaper than shipping the next feature.
- **A same-day-velocity problem.** Multiple full version bumps and a whole
  subsystem rebuild landing in single-day chains left no natural pause between
  commits for the "does this fit" question — velocity itself was an enabling
  condition, not just insufficient planning.

## Concrete workflow changes (not "be more careful")

1. **A "step 3" is a commit, not a todo line.** When a plan explicitly
   sequences "build → live with it → audit → refine" (as `todo.md:221-226`
   did), the audit step needs to be a scheduled/blocking unit of work — e.g.
   a commit or PR titled after it — not a line in a todo file that competes
   with unrelated items for attention. If step 3 doesn't produce its own
   artifact, step 4-shaped work will keep happening instead of it, as it did
   here twice.
2. **A repeated bug is a stop-and-fix signal, not a stop-and-document
   signal.** CLAUDE.md recording "this has happened twice" and `todo.md`
   copying that line into a "Think required" bucket are both documentation of
   the problem, not resolution of it. Treat the *second* occurrence of the
   same failure mode as a hard gate: no new feature work in that subsystem
   until the architecture (not the symptom) is fixed.
3. **Track `.planning/` in git, or accept it will be invisible pressure.** A
   152KB untracked todo file holding the correct architectural calls is doing
   no better than not having them, if nothing forces a periodic pass over it
   before starting adjacent work. At minimum, commit it (or a curated subset)
   so "what did we already decide about this" is a `git log`/`git blame` away
   instead of a manual scroll through an ever-growing personal file.
4. **A design lesson learned for one subsystem should be checked against the
   next adjacent one before it's built.** `json-rendering-redesign.md`'s "one
   recursive dispatch, not N special-cased renderers, config declared not
   inferred" is the exact fix the DSL grammar needed and didn't get, written
   eight days before the DSL spike, for a sibling system. A lightweight habit
   — before starting a new authoring/rendering surface, skim `.planning/` for
   design docs about adjacent surfaces — would have surfaced this for free.
5. **When a "rip it out and replace it" plan is only half-executed (the old
   thing removed, the new thing shipped, but the two were never reconciled
   when the old *concept* crept back in), that's worth a deliberate check, not
   silent acceptance.** `ContributionMapEditor.tsx` reappearing days after
   contribution mode was explicitly removed "to be replaced by DSL" should
   have prompted "does this contradict the plan," not just been built on
   instinct as an obviously-needed feature.
6. **Same-day, multi-commit architecture chains are a signal to insert an
   explicit pause, not evidence of good momentum.** If a subsystem is
   accumulating multiple substantial-rewrite-shaped commits within hours of
   each other (version bumps, "rebuild the X flow," "extend Y grammar"), that
   velocity itself is worth flagging — not to slow down, but to insert one
   explicit "does the next commit still fit the shape of the first one today"
   checkpoint before continuing the chain.

None of the mechanisms above are DSL-specific — they apply to any subsystem in
this project (or any project) where a plan correctly anticipates a problem and
implementation outpaces the check meant to catch it.
