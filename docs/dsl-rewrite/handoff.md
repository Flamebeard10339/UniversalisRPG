// Handoff to a fresh Opus session. Read this, then `git log` on branch
// `dsl-rewrite` and the "Canonical docs" below. Don't re-derive what's here.

# Handoff — content DSL rewrite → automated playtest + cheaper delegation

## Your two goals

1. **Immediate:** assess how much of the *existing* CLI / test tooling can be
   salvaged and rewired onto the **new parser+runtime** to enable **automated
   bot-testing** — a Haiku agent that *plays* the game headlessly and reports
   bugs, softlocks, and immersion notes, feeding back into tests + richer content.
2. **Meta:** find a delegation procedure that burns far fewer tokens so iteration
   isn't ~2 turns / 5 hours. The prior session's cold-start tax (each `Agent`
   spawn re-reads the codebase, ~40–108k tokens) is the culprit. Hypothesis to
   test: **keep a warm swarm** — spawn a few Haiku/Sonnet agents once and dispatch
   tasks to them via `SendMessage` (which continues an agent *with its context
   intact*), instead of spawning fresh each time. Measure whether SendMessage
   actually avoids the cold-start re-read.

## State of the rewrite (branch `dsl-rewrite`)

A from-scratch, **one-directional** content DSL: text is canonical, parsed to
objects, **never regenerated** (no printer). Seven section kinds parse, hydrate,
and *run*. **52 tests pass**; `tsc` clean except 4 pre-existing unrelated errors
(`applyModuleEdit`/`contributionBundle` in `App.tsx`, `DslModuleEditor.tsx`,
`SubmitToGitHub.tsx`, `testHarness.ts` — always ignore these).

Verify anything with:
- `npx vitest run src/game/contentDsl/`
- `npx tsc --noEmit` (filter out the 4 above)

### File map — `src/game/contentDsl/`
- Foundation: `parser.ts` (`Parser<T>`, `Cursor` w/ absolute spans, `DslError`),
  `structure.ts` (`splitSections` → `RawSection`/`RawLine` indentation tree,
  `//` comments), `values.ts` (`text`/`number`/`id`/`REFERENCE`/`humanize`).
- Value grammars: `tagClause.ts`, `condition.ts` (refs as dotted paths,
  and/or/not, numeric comparison, `has [<n>] <item>`), `list.ts`,
  `actionResult.ts` (say/set/unset/give/take/xp/relocate/discover/open-modal;
  `startsResult`).
- Engine: `section.ts` (generic schema engine: fields, defaults+lazy hydration,
  flags, bare clauses, `bare`, `exclusive`, dynamic `entries`). Bespoke kinds:
  `dialogue.ts` (nodes/when/once/sticky/again/beats/menus/`{…}` text segments),
  `test.ts` (`run`/`talk`/`choose`/`use`/`travel`/`expect` directives).
- Kinds: `item` `stat` `skill` `location` `entity` (via `section.ts`) +
  `dialogue` `test` (bespoke). Dispatched by `module.ts`'s `PARSERS` registry
  (`kind → (RawSection) => object`).
- Semantics: `scope.ts` (`scopeEntity`: bare single-segment refs inside an
  entity's actions → `<entity>.<name>`), `runtime.ts` (see below).
- Tests: `parse.test.ts`, `test.test.ts`, `runtime.test.ts`,
  `integration.test.ts`, `scope.test.ts`.

### `runtime.ts` — the new engine core (headless)
`loadModule(source)` → `Registry` (parse + hydrate + `scopeEntity`, indexed by
kind/id, dialogues by owner). `GameState` = flags/inventory/location/visits/xp/
log. `evaluateCondition`, `applyResult`, `renderSegments`, dialogue stepper
(`talk`/`choose` with last-matching-`when` entry, once/sticky/again, menu
fall-through), `useAction`, `runTest` (composable, cycle-guarded). It is written
for **test execution**, not interactive play — the playtest loop needs a thin
*interactive session* wrapper (talk → return menu → choose → expose state/log →
move), which does not exist yet.

## Salvage assessment (goal 1) — files to read and judge

Per `CLAUDE.md` the old testing tooling was tied to the *deleted* content
pipeline and is currently nonfunctional. Judge each against `runtime.ts`:
- `scripts/playtest-cli.ts` + `scripts/playtestEngine.ts` — headless replay of
  choiceId scripts. `readModule`/`loadStagedBundle` depend on the deleted
  pipeline; the sim loop may be reusable. **Best rewire candidate** for headless
  bot-play if pointed at `loadModule`/`talk`/`choose`/`runTest`.
- `src/game/agentSession.ts` — GM/agent message protocol (the shape a bot would
  drive). Check if its protocol maps onto the runtime's talk/choose/state.
- `src/game/cli.ts` — human/dev CLI.
- `src/game/testHarness.ts` — dev-only `window.__test` browser harness (one of
  the 4 broken files; imports deleted `applyModuleEdit`). User preference on
  record: extend `window.__test` over DOM-scraping, and expand `playtest-cli.ts`
  over ad-hoc scripts — but both are DSL-pipeline-broken today.
The likely path: a small headless "play session" API over `runtime.ts` + rewire
`playtest-cli.ts` to it, then a Haiku agent drives it and reports.

## Content & authoring
`content/tutorial-island.dsl` — the Miki route, authored against the grammar,
runs through the runtime (`integration.test.ts`). Authored by a Sonnet agent who
also produced a **friction report** (drove the last two features).

**Friction backlog (remaining, ranked by that report):**
1. Counter/tally — "kill 3 rats"/"gather N": an increment effect + a count
   condition. Called the most common unexpressible shape.
2. Crafting/combine verb (the bread recipe).
3. `take:`-implies-`requires: has …` sugar + a default-failure branch (the
   owner's own idea; cheap now that `has` exists).
4. Labelled-bare-field error message (`tags: …` throws a confusing error) — minor.

## Delegation findings — don't re-derive (full log: `delegation-experiments.md`)
- **Bounded/local task + heavy spec → Sonnet, clean.** 9/9 delegations correct;
  0 sent back for rework. The decisive factor is spec detail, not task size — a
  *system-wide* runtime came back clean because it was specced as 7 concrete
  pieces.
- **A big delegation's own tests are NOT sufficient QA.** The runtime passed its
  own 9 tests but had 2 bugs (effect re-fire on revisit, menu non-resume) that
  only surfaced running *real content* through it. Always integrate against a
  real input on review.
- **Design that must reconcile the whole system → main thread** (a cold agent
  can't rebuild that view). Local design delegates fine.
- **Parallel on disjoint files works** (occasionally induces a small duplication
  to consolidate on review).
- **Cost model:** total tokens go *up* (cold-start), main-context tokens go
  *down* (only the summary returns); a cheaper model can be fewer dollars despite
  more tokens. → The warm-swarm/`SendMessage` idea targets the cold-start tax.
- **Process:** append a row to `delegation-experiments.md` on every delegation;
  always review (verify + integrate).

## Conventions / gotchas
- Comment-free, self-documenting code (a cold agent reconstructed it correctly).
  Don't add comments that restate code.
- One-directional: parsers only, no `print`. `Parser<T>`, not `Codec`.
- References are dotted paths; the semantic/runtime layer interprets namespaces
  (`stat.`/`quest.`/`.visits`), not the parser.
- Commit code at milestones; **docs are committed by the user** — leave
  `grammar.md`, `delegation-experiments.md`, and this file for them.
- End commit messages with the Co-Authored-By line.

## Canonical docs to read
`docs/dsl-rewrite/grammar.md` (authoritative author reference — verified against
the parsers), `delegation-experiments.md` (the experiment log + heuristics),
`.planning/miki-questline.md` (world/story), `.planning/dialogue-strawman.md`
(dialogue design intent), `implementation-plan.md` + `postmortem.md` (why the
rewrite exists and its phases).
