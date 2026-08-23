# Delegation experiments

A running log of subagent delegations on the DSL rewrite, kept so a real
conclusion about *when delegation pays off* can be drawn once there are many
data points. Any single row proves little; append to it, don't reason from n=3.

## How to add a data point

After delegating a task to a subagent, record: the model, a one-line task
description, the subagent token count + tool calls + wall time (from the Agent
tool's usage footer), how heavily the task was pre-specified (this is a major
confound — a task handed the exact edit measures typing, not design), whether
the result was correct, and what the review caught.

## Data points

| # | Model | Task | Sub-tokens | Tool calls | Wall | Spec detail | Outcome |
|---|-------|------|-----------:|-----------:|-----:|-------------|---------|
| 1 | inherited | Cold-read: describe the comment-free code with zero context (readability probe) | 37.9k | 6 | 65s | n/a (read-only) | Correct — reconstructed every mechanism; flagged the real rough edges |
| 2 | Sonnet 5 | Implement entity action modifiers (`requires`/`hidden if`/tags/`on success`) reusing existing codecs | 91.7k | 23 | 307s | medium (scope + corpus given, design left open) | Correct, well-scoped; self-flagged its own two smells (F1 duplication, F2 try/catch) |
| 3 | Haiku 4.5 | Replace F2 try/catch dispatch with a non-consuming `startsResult` peek | 42.9k | 12 | 87s | high (exact regex + exact edit handed over) | Correct, clean, one-shot; added the locking test |
| 4 | Sonnet 5 | Dialogue `{…}` text fragments → literal/interpolate/conditional segments | 74.0k | 21 | 217s | medium-high (forms + examples + files constrained) | Correct; forced to duplicate the REFERENCE regex (couldn't touch condition.ts), which it self-flagged |
| 5 | Sonnet 5 | **Design** + implement the `# test` kind (composable test grammar) | 74.2k | 24 | 171s | medium (starting vocab given, design left open) | Correct; coherent minimal grammar, independently reused repo conventions (`<obj>.<objId>.<actionId>`, the condition grammar) |
| 6 | Sonnet 5 | Write the complete grammar reference (doc synthesized from the parsers) | 107.9k | 35 | 431s | medium | Doc correct + rigorous — it verified examples against the running parser; but its one novel "discovery" mis-framed load-bearing code as dead, and review corrected the framing before it entered the canonical doc |
| 7 | Sonnet 5 | Build the headless runtime (load + condition eval + effects + dialogue stepper + `# test` runner) | 93.8k | 29 | 357s | high (7 concrete pieces specified) | Green on its own 9 tests — but they missed two cases real content needs (once/sticky effect-refire, menu fall-through); both surfaced only at integration |
| 8 | Sonnet 5 | Author tutorial-island content + friction report | 101.7k | 26 | 522s | medium (grammar doc + questline given) | Content parses and runs; friction report high-signal — confirmed the predicted item-possession gap |
| 9 | Sonnet 5 | Add the `has` inventory-possession condition (grammar + runtime + content + doc + tests) | 77.2k | 37 | 179s | medium-high (feature fully specified) | Correct, one-shot; integration stayed green |
| 28 | Sonnet 5 (cold spawn, Opus orchestrator) | **Named-tests Chunk C — session recorder + `/create-test`/`/create-valid-test`.** `Recorder{history,startSave}`; `handleCommand` wraps `handleGameplayCommand` as the single recording choke point (pushes `result.recorded`); `buildCreateTest` (existence-check→fail; prepend `load: <id>-start` + emit `# save <id>-start` unless history already leads with load; `valid`→append `expect: <id>-end` + `# save <id>-end`; register test+saves into live registry; paste-ready output); live-mode branch records `begin:`/`wait: <elapsed>`/`cancel`; `runLiveAction`→`Promise<{cancelled}>`. | 113.2k | 45 | 481s | high (Recorder shape + choke-point placement + prepend-load reproducibility rule + register-for-immediate-run + live begin/wait/cancel recording + mandated record→emit→reload→replay round-trip gate, scope=only play-cli.ts+test) | **Correct, one-shot; tsc 0 (default + targeted scripts/), 350→356 green (+6). Round-trip gate passes.** Independent diff read + real piped CLI smoke (`/wait 2`→`/create-valid-test smoke`→`/test smoke` PASSED, `smoke-start`=`{"version":1}` empty new-game save). Clean design: `handleGameplayCommand` holds prior logic untouched, wrapper adds the two create-* commands + one choke point; `savedGameFromSerialized` mirrors parseSaveSection's post-JSON step (no RawSection needed); `beginInnerForChoice` derives from `recordedForChoice` (no dup). Sound self-flagged generalization: `-start` collision checked whenever a start-save is emitted (both create-test variants), not only `valid`. Known limitation noted (not solved): character-creation modal isn't a directive, so name/race isn't captured — replayed test starts from `<id>-start` which predates the modal. No planner rework; review = diff + full suite + targeted tsc + piped e2e. **NAMED-TESTS DELIVERABLE COMPLETE (A+B1+B2+C).** |
| 27 | Sonnet 5 (cold spawn, Opus orchestrator) | **Named-tests Chunk B2 — wire CLI onto the unified interpreter.** `scripts/play-cli.ts`: prompt accepts raw directive lines via shared `parseDirectiveLine`+`applyDirective`; slash aliases (`/cancel`/`/load`/`/expect`/`/assert`/`/wait`) rewrite to colon form (retired the bespoke `/wait`); `/test <id>` + typed `run:` share `runTestCommand` (PASSED/FAILED); `/expect`/`/assert` WARN (`✓`/`⚠`) not abort; `recorded?` on CommandResult populated for typed directives + numbered choices (mirrored maps, dialogue-by-label). | 108.4k | 44 | 443s | high (exact command routing order, DRY slash→colon rewrite, warn-not-abort assertions, recorded-mapping per PlayChoice kind, scope=only play-cli.ts+test, STOP-if-need-new-export cap) | **Correct, one-shot; tsc 0 (incl. targeted scripts/ check — default tsconfig excludes scripts/), 343→350 green (+7).** Independent diff read: routing order sound (`/test` before alias rewrite; null-directive slash falls through to the unchanged unknown-command check, then numbered-choice); `recordedForChoice` maps `action`→`use: <id-rest>` etc. correctly; `main()` untouched (typed input already routes through handleCommand, live numbered path preserved). Sound small addition beyond spec: also catch `DslError` from `parseDirectiveLine` (a bad `/assert` line) into the existing `Error:` idiom. Good finding: tutorial-island's travel edges are all alias-hidden by stairs free-relocate, so no genuine `travel` PlayChoice there — used a dedicated fixture rather than assuming. No planner rework; review = diff read + targeted `tsc scripts/play-cli.ts` + full suite. **PAUSED post-B2 at user request for manual CLI testing before Chunk C (recorder).** |
| 26 | Sonnet 5 (cold spawn, Opus orchestrator) | **Named-tests Chunk B1 — unify directive parser + executor (no CLI).** Extract `parseDirectiveLine(text)` (the sole directive-line parser, shared by `parseTest` + later the CLI); factor `use`/`travel`/`craft` payload sub-patterns; add arm-only `begin:` directive (`begin: use entity.x.y` / `craft` / `travel`, inline verb); add `applyDirective(session, directive)` (single gameplay/assertion executor) in session.ts; MOVE `runTest`+`TestResult` from runtime.ts onto `applyDirective`; update importers. | 110.4k | 62 | 448s | high (exact executor cases mirroring old runTest, `begin`→beginAction map, hard "runTest builds session WITHOUT startSession to preserve empty-location semantics" + no-cycle + no-play-cli caps, DRY rationale given) | **Correct, one-shot; tsc 0, 338→343 green (+5).** Independent diff read: `parseDirectiveLine` returns null→parseTest keeps span-aware error; `begin:` inline-verb grammar avoids the double-colon with zero duplicated regex (factored payload consts); `applyDirective` mirrors old runTest exactly; runTest rebuilt with direct PlaySession literal (no startSession) so the miki-route `travel:`-from-empty-location test still passes. Sound self-flagged call: `wait`/`cancel` cases call `resolve()`/`state.activeAction=null` directly rather than the `wait()`/`cancelAction()` session wrappers, because those wrappers end in `view()` which throws on an unset `state.location` (some time.test/runtime.test tests never travel) — commented at both sites; reproduces pre-refactor semantics. No cycle (runtime imports nothing from session). No planner rework; review = diff read + reported suite/tsc. |
| 25 | Sonnet 5 (cold spawn, Opus orchestrator) | **Named-tests Chunk A — save model + test grammar (no CLI).** New `save.ts` (sparse versioned save = diff vs `initialState(registry)` baseline, `log` excluded; `diffState`/`serializeSave`/`loadSave` in-place/`compareSave`/`parseSaveSection`); `# save` section (single-line JSON body) wired into `PARSERS` + `Registry.saves` + loadModule; test directives: rename condition `expect:`→`assert:`, new `expect: <save-id>` (save-compare), `load: <save-id>`, `cancel`; `runTest` cases; extract shared `startingLocationId` reused by `startSession`; migrate 9 `expect:` content lines + test fixtures. | 123.3k | 52 | 449s | high (full save-diff model + version contract + exact grammar/regex + runTest cases + migration list + hard "no play-cli.ts" cap, both grammar forks pre-ratified with user) | **Correct, one-shot; tsc 0, 338 green (156 in contentDsl).** Independent diff read: `save.ts` matches spec (sparse diff, version-checked load/compare, in-place mutation for caller-held refs); grammar rename + new directives clean, no keyword collision; `startSession` refactor preserves the `!state.location` guard. Self-flagged: (1) runtime↔save circular import — required by the spec's file shape (runTest needs compare/load; save needs createGameState/Registry), safe since every cross-ref is function-body-only not module-eval — accepted (save.ts is a natural runtime-hub extension); (2) `loadSave` resets `log` to `[]` (fresh transcript on load) — correct reading; (3) `# save`'s `expect:` reference in grammar.md left stale (doc, out of scope — user owns grammar.md). No planner rework; review = diff read + reported suite/tsc. |
| 10 | Sonnet 5 (cold spawn) | Build `session.ts` interactive-play layer over `runtime.ts` (choice enumeration + apply) + tests | 99.9k | 25 | 470s | high (full interface + enumeration rules + test route specified) | Correct, one-shot; only minimal runtime change (export `useAction`); test drives the full real route through the choice API |
| 11 | Sonnet 5 (**warm resume** via SendMessage, continues #10) | Rewire `playtest-cli.ts` onto `loadModule`+`session.ts`, delete obsolete `playtestEngine.ts` | 82.5k | 37 | 692s | high (steps + arg surface specified) | Correct, one-shot; replays full Miki route green. **But warm resume was not cheaper — see warm-swarm finding.** |
| 12 | Sonnet 5 (cold spawn) | Counter/tally `add:` effect (grammar+runtime+tests) + bare-field error message | 125.1k | 58 | 562s | high (2 labeled pieces, exact content edits) | A1/A2/error-msg correct & green; **correctly STOPPED** on the content-wiring piece — proved empirically that the exact edit I specified collides with entity auto-scoping (`add` unscoped while a sibling `hidden if` scopes → the rat gate never trips → infinitely farmable). A **planner spec error**, caught by the STOP escape hatch + the "verify empirically" instruction, not an agent error. |
| 13 | Sonnet 5 (cold spawn) | Finish counter/tally: scope `add:` in scope.ts + wire `tutorial.rats-killed` content ripple + grammar.md | 62.4k | 28 | 153s | high (3 labeled pieces, exact edits, resolution pre-decided by planner) | Correct, one-shot, no STOP; 59 green, replay green, tsc clean. The follow-up to row 12's STOP — a planner-designed resolution executed cleanly. |
| 14 | Sonnet 5 (cold spawn) | Declarative `# recipe` kind (parser/runtime/session/`craft:` test directive) + wire tutorial-island bread flow to real crafting + tests | 142.2k | 85 | 708s | high (full grammar + exact seams + content rewrite + node-ordering spec, design pre-ratified in Opus) | Correct, one-shot; 59→68 green, tsc clean (only pre-existing deleted-pipeline errors). Reused `values.quantified` across give/take as told. Flagged 3 deviations honestly — one necessary (`travel:` prefix, since `runTest` never sets a start location), two judgment calls kicked up to the planner (a stale doc line left untouched; the dialogue/recipe cooking-xp double-grant). Review made two integration edits: removed the redundant dialogue xp, fixed the stale doc line. No rework sent back. Largest chunk yet (142k) and still reviewable — the design-ratified-first, exact-seams spec kept it single-pass. |
| 15 | Sonnet 5 (cold spawn) | `take:` affordability gate + `on failure:` branch (entity.ts parse + runtime `useAction` atomic-fail + inventory floor) + tests | 88.7k | 45 | 313s | high (exact `useAction` logic handed over, design pre-ratified) | Correct, one-shot; 68→77 green, tsc byte-identical error set (zero new). One **correct** self-flagged deviation: extended `scope.ts` to entity-scope `onFailure` refs like `onSuccess` (else a bare `set:` in `on failure:` would scope inconsistently — a latent bug, not a design question) with a locking `scope.test.ts` case. Exactly the adjacent-consistency fix a good agent *should* make and flag, not grave-digging. No planner edits needed; review = read diff + independent test run. |
| 17 | Sonnet 5 (cold spawn, Opus orchestrator) | **Branch-closeout Chunk 1 — decommission.** Delete dead legacy play/contribution wiring (9 files: legacy stores + contribution components) + quarantine salvageable GUI to `attic/` (App.tsx, ContributionMapEditor, testHarness trio via `git mv`) + placeholder `main.tsx` + strip 3 dangling package.json scripts, to get the non-compiling branch to tsc-0 + test-green | 51.7k | 25 | 160s | high (exact keep/quarantine/delete file lists ratified from a prior read-only survey; hard caps + STOP escape hatch) | Correct, one-shot. 64 tsc errors → 0; build green; 249 tests pass; quarantined suite confirmed not run; contentDsl core untouched. Change surface matched the ratified table exactly — review (git status + contentDsl-touch grep) caught nothing. Preceded by a separate read-only Explore survey that produced the decision table (the survey/ratify gate that de-risked mass deletion); two earlier broad Explore surveys were killed mid-run by a 5h-budget session limit, recovered as partial output. |
| 22 | Sonnet 5 (cold spawn, Opus orchestrator) | **Chunk 4 unification B2 — recipes as spannable fights + stations as capabilities.** Compile recipe→B1 Action at load (`Registry.recipeActions`, `repeating=time>0` so `time:0` stays instant), rewrite `craft()` to arm a `recipe.<id>` activeAction through `resolve()`, capability-based `recipeCraftable` (entity `stations: string[]` ↔ recipe `station:` required capability), burn via `accuracy:`+`burnt:` (⇒ escapeAfter 1 + symmetric-take onEscape), rewrite resolve.test cooking gates onto recipes (#5, multi-hit `tree` kept non-recipe), migrate bread/oven content. | 157.9k | 51 | 708s | high (full recipe→Action compile map + exact craft/resolver seams + station-capability model + mandated gates handed over; combat-math/skill-burn/questline-content out of scope) | **Correct, one-shot; tsc 0, 281→284 green (+3 gate tests).** `recipeAction`/`craft`/`recipeCraftable` all matched spec exactly on independent read. 4 deviations, all flagged & sound: (1) kept entity keyword `stations:` (plural) not the brief's `station:` — the generic `section.ts` ties keyword↔object-key with no alias, so symmetry would mean editing the shared engine for a one-off; the plural/singular split is arguably BETTER (entity provides-many vs recipe needs-one); (2) defensive `repeating&&duration<=0` guard in craft; (3) the migrated associativity test's `flags` assertion went vacuous (recipe results have no `add:`/`set:`), leaving `xp` as the batching signal; (4) added a distinct `stove`/`camp` capability scenario to prove matching isn't coincidental to reusing "oven". **Review caught a coverage regression the migration introduced:** turning `campfire` (which carried `on success: add+xp`) into a recipe left NO test exercising `onSuccess` batching-per-completion under resolve splits — the EXACT Pass-1 bug class, still live for entity actions (tutorial `roast chestnuts` uses onSuccess). Orchestrator restored it inline (a `kiln` repeating entity action w/ onSuccess + a 20-split associativity gate asserting flags+xp), which also re-confirmed `add:` inside onSuccess entity-scopes to `kiln.bricks-fired`; 285 green. Classic "green delegation proves self-consistency, not coverage — the review must check what the diff quietly stopped testing." |
| 23 | Sonnet 5 (cold spawn, Opus orchestrator) | **Playable-CLI P1 — character creation (name/race).** `GameState.player{name,race}` + `pendingModal`; `resolveReference` handles `player.*` (return type widened to include string); `open-modal` sets `pendingModal`; `PlayView.pendingModal` + `submitModal(session,{name,race})`; `play-cli.ts` shell prompts name (free text, default Adventurer) + race (fixed 4-item list) when `pendingModal==='character-creation'`. Races-as-DSL-content explicitly deferred. | 94.6k | 49 | 303s | high (exact state shape + seams + fixed race list + hard "don't make races DSL content / don't touch .dsl" caps, design pre-ratified in Opus) | **Correct, one-shot; tsc 0, 285→289 green (+4).** Diff minimal & fully in-scope. Two sound self-flagged judgment calls: (1) widened `truthy()` to treat `''` as falsy so unset `player.name` behaves under `when: not player.name` — safe since `state.flags` only holds bool/number, `''` can only come from `player.*`; (2) discovered action-level `say:` is plain text (only dialogue `say` runs through `renderSegments`), so it did NOT try to "fix" action-say interpolation (correct — tutorial content only uses `{player.name}` in dialogue nodes) and rewrote its own test to a dialogue node to match reality. No planner rework; review = diff read + independent tsc/vitest. |
| 24 | Sonnet 5 (cold spawn, Opus orchestrator) | **Playable-CLI P2 — `--live` real-time driver (the big L2 chunk).** Extract `armAction`/`armCraft` (arm `activeAction` without resolving first unit) + side-effect-free `actionFirstUnit`/`craftFirstUnit` probes; `useAction`/`craft`→arm-then-resolve (byte-identical); session `beginAction` (arm spannable, route instant/talk/dialogue/travel through instant food-buff-safe path); `play-cli --live` real-time tick loop over `wait()`/`resolve()` w/ progress bar, `/speed <n>`, Enter-to-stop; pure testable `liveTick`. Design (arm seam + probe-branch to preserve food buffs + pure `liveTick`) pre-ratified in Opus. | 213.9k | 106 | 1382s | high (3 labeled pieces A–D, exact seams, hard "don't touch resolve/food-buff/travel/content" caps, readline-concurrency behavior specced + non-hang mandated) | **Correct, one-shot; tsc 0, 289→307 green (+18).** Big diff, reviewed as one; armAction refactor confirmed byte-identical (`takesSelf` = old `required.has(objId)`); real wall-clock `--live` runs verified by orchestrator (progress bar spans time, repeating action completes cycles → 1 chestnut at 4s, clean exit 0, piped non-hang proven). Self-caught a real bug mid-impl: a `Promise<Promise<LineResult>>` return would be silently flattened by the caller's `await`, breaking the pending-read handoff — fixed via an out-param box. Restructured `main()` from `for await` to a manual asyncIterator so the live loop can borrow the same iterator (races pending read vs 200ms tick; EOF resolves read as done→guarantees piped termination). Good adjacent catch: hoisted the character-creation modal check to fire after BOTH live/instant branches (an instant action reached via beginAction could otherwise open a modal without prompting). **Surfaced a pre-existing gap (not a regression):** `tsconfig` `include:["src"]` ⇒ `scripts/**` never type-checked by `tsc --noEmit`; play-cli.ts only caught by a standalone check the agent ran. Flagged as a follow-up task chip. Minor deferred polish: per-completion `say` narration batches to end of a live span rather than surfacing per item. No planner rework; review = diff read + independent tsc/vitest + real timed `--live` playthroughs. |
| 21 | Sonnet 5 (cold spawn, Opus orchestrator) | **Chunk 4 unification B1 — action-model core.** Unify `speed`/`accuracy`/`ability` as uniform stat axes (drop bespoke `speedStat`), add target `health` + `escape after`/`on escape:` (raw→burnt), RNG-in-`GameState` (LCG cursor, sequential draws) for associativity-preserving real rolls, deterministic fast-path (closed-form fights) vs stochastic path (attempt-by-attempt), fold in #3 keyword-lift generalization. | n/a (hit shared session API limit mid-fix) | n/a | n/a | high (full fight-model + two-path resolver + RNG/associativity contract + mandated stochastic-associativity/raw-burnt/multi-hit test gates handed over; recipes/stations/combat-math explicitly out of scope) | **Terminated early by the shared 5h session limit** while fixing a regression it had already correctly diagnosed (zero-`time:` non-repeating action never runs `resolveSegment` so `attemptsMade` stays 0 — needs the `duration<=0` instant-fire in `applyDueBoundaries`; the fix WAS in place at runtime.ts:689). Left tsc-0 but 14 red — all cascading from ONE cause: it authored the ratified `# stat cook-success base: 0.7` fixture but hadn't made `stat.base` accept decimals (integer-only shared `number` parser), so `loadModule` threw for every `loaded()` test. Orchestrator finished inline: added a targeted `decimal` parser for `stat.base` (left integer `number` for item/xp/flag counts, per the `time:` precedent) → 277→281 green, tsc 0. Independent review: the three mandated gates are meaningful (stochastic associativity asserts `rng` + inv/flags/xp across 25 non-boundary splits @ 100k input; raw→burnt distribution; mid-fight-split multi-hit) and the `onEscape` scope-consistency fix + locking test landed. Two accepted notes: `inputLimit` reads `results` take not `onEscape` take (only wrong for a pathological asymmetric on-escape; symmetric cooking correct); stochastic+input-exhaustion associativity is one-shot-tested only. Stayed strictly in B1 scope (no recipe/session/content touch). |
| 20 | Sonnet 5 (cold spawn, Opus orchestrator) | **Chunk 4 Pass 1 — deterministic time resolver + spannable/looping actions + timed buffs.** Segment-based `resolve(state,registry,toTime,random)` (closed-form completion batching, buff-expiry + input-exhaustion boundaries), `activeAction`/`activeBuffs` state, `statValue` modifier stacking, `speed:`/`repeating` grammar, food-tag→buff, rewired `useAction`/`wait`/`runTest` through resolve. Associativity property test written first | 215.4k | 72 | 1036s | high (resolver ALGORITHM handed over exactly incl. the associativity invariant + segment/batching math; local grammar surface left open; STOP cap) | **One real correctness bug, caught by REVIEW not its own tests.** tsc 0/0, 266→277 green, associativity property (40 runs) + test 1 (1500) + test 4 (O(1)) all green — BUT `onSuccess` on a repeating action fired **once per segment** (partition-dependent) while `results` batched correctly, i.e. non-associative onSuccess = live-driver over-fires vs REPL = the exact divergence the design forbids. Slipped because the property fixtures had no `onSuccess` and the assertions never compared `xp`/`flags`. Orchestrator fixed inline (route onSuccess through `applyResultBatch`, 1 line) + closed the fixture/assertion gap; re-verified 277 green. Classic "a big delegation's own green tests prove self-consistency, not correctness — the review must reason independently" (see runtime-QA finding). Secondary (accepted, not fixed): partial `progress` carried in seconds not fraction ⇒ <1-completion phase shift when a buff boundary lands mid-completion (associative, so NOT a REPL/live divergence); float off-by-one risk in the input-limit completion count at fractional durations (EPSILON only guards the completion boundary). Largest delegation to date (215k) and still one-pass-plus-a-review-fix. |
| 19 | Sonnet 5 (cold spawn, Opus orchestrator) | **Branch-closeout Chunk 3 — agent-mode REPL.** Interactive stdin REPL (`scripts/play-cli.ts`) over the existing `session.ts` API (`startSession`/`view`/`apply`/`wait`): numbered-choice + `/wait`/`/state`/`/help`/`/quit` handling split into a pure `handleCommand` + thin `readline` shell; reports final `state.time` as the section sim-length; deliberately no wall-clock/multiplier (deferred to chunk 4). + 6-case test + one `package.json` script | 75.8k | 27 | 337s | high (full behavior + pure-handler split + hard "time only via wait()/apply()" constraint + exact 3 touch points, design pre-ratified in Opus) | Correct, one-shot; tsc 0/0, 260→266 green (+6), zero regressions (both re-verified independently by the orchestrator). One **correct** self-flagged deviation: switched `main()`'s loop from `rl.question` to `for await (const line of rl)` after an isolated repro showed the former silently drops all-but-first line on piped/non-TTY stdin (Node 24) — an I/O-shell fix that leaves the pure handler untouched. Pure-handler design held; time only moves via `wait()`/`apply()` as specced. No planner rework; review = diff read + independent tsc/vitest. |
| 18 | Sonnet 5 (cold spawn, Opus orchestrator) | **Branch-closeout Chunk 2 — deterministic time substrate.** `GameState.time` + pure `advanceTime` seam; `Action.time:` cost (parse + apply on success-path only); session `wait()` + `PlayView.time`; bare `time` reference; `wait:` test directive; tests + grammar.md. Wall-clock injection / buffs / regen / travel+craft time all explicitly deferred | 89.0k | 39 | 251s | high (7 labeled sub-pieces P1–P7, exact seams + placement, explicit deferred list + scope caps, design pre-ratified in Opus incl. 3 ratified decisions) | Correct, one-shot; 249→260 green (+11), tsc 0, no regressions, purity preserved (no Date.now). Review (read diff) confirmed the two subtle points — time-cost lands only on the success path, `time` reference precedes `visits`. Good adjacent judgment flagged: used an inline decimal regex rather than reuse the integer-only shared `number` parser (out of scope to touch). One verify misfire (ran `npm run playtest` with no required args → misread the arg error as "CLI broken"; harmless, suite covers it). No planner rework. |
| 29 | Opus 5 (cold spawn, Opus orchestrator) | **Audit: DSL load path** (`src/grammar`+`src/content`, never audited). Read-only; verify-every-claim mandate; exemplar doc handed over as the evidence bar. | 178.7k | 48 | 888s | n/a (read-only; method prescribed, findings open) | 15 findings, every one fixture-verified. H1 redefinition = `Map.set` (measured before/after table), H2 20-of-44 reference fields (full enumeration + per-field fixtures), M2 `action.ts` is the parser `section.ts:1` records as *rejected* (differential table). Correctly re-ran the prior audit's M1 table rather than trusting `references.test.ts`, and confirmed the fix landed — bounding its own H2. Orchestrator spot-verified H2's false comment, M2's line counts and the rejected-alternative claim; all held. |
| 30 | Opus 5 (cold spawn, Opus orchestrator) | **Audit: Testing procedure** (`scripts`+`test.yml`+`# test`/`runTest`/CI). Read-only; brief mandated *adversarial* gate testing — for each gate, construct a violation it catches AND one of the same spirit it misses. | 200.2k | 84 | 1786s | n/a (read-only; adversarial method prescribed) | 12 findings; the adversarial framing is what produced H1 (a throwaway commit that stripped comments *and* deleted `npm test` from the workflow, certified "comment-only"). Also refuted its own prediction (`audit-status` merge-commit attribution is correct) and **retracted two measurement tables mid-audit** — one run in a worktree without `node_modules` where vitest exited non-zero and scored every mutant "caught". That accident surfaced M6 (CRLF). Documented both in a Corrections section. Orchestrator confirmed H1 at `comment-only-diff.ts:38` and M1 at `audit-status.ts:83`. |
| 31 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit: Build & deployment.** Read-only; brief split verifiable-locally (build, deps, tsconfig) from reason-only (`publish.yml`, Gradle) and required each finding be labeled with which it was. | 101.3k | 47 | 449s | n/a (read-only; verify/reason split prescribed) | 11 findings, labels honoured. Ran the real Vite build and read `dist/index.html` for H1 rather than reading the config. Reported `npm audit`'s 3 high/3 critical as dev-only and informational instead of inflating them — the honesty instruction held under a tempting finding. Orchestrator verified H1/H2/L1/L3 directly. |
| 32 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit: User interface** — a system whose main path (`src/ui`) does not exist. Brief said so explicitly and told it not to pad. | 103.6k | 39 | 416s | n/a (read-only; anti-padding instruction prescribed) | 6 findings, none padded, and the "was this worth running" self-assessment was the useful part: no code to audit, but two teardown passes left residue that ships today (dead CSS in the bundle, 49 KB orphaned `public/content/`, 8 unused deps) and a `vite.config.mjs` comment describing a directory deleted nine days earlier. Also corrected a *memory note* — `attic/` is gone, not quarantined. Orchestrator verified the attic and dependency claims. |
| 33 | Opus 5 (cold spawn, Opus orchestrator) | **Clause audit: store + lifecycle** (c2/c3 of `task-system-real-world-friction-spec`). First use of *isolated git worktrees* — each auditor got its own worktree with a `node_modules` junction, so mutation edits could not corrupt a sibling's test run. | 173.8k | 85 | 2321s | n/a (read-only; mutation mandate prescribed) | c2 unmet, c3 met-but-weakly-proven. Reproduced the branch's originating failure end to end (`done` → `git checkout -- docs/tasks.jsonl` → `check` reports nothing). Proved the store migration lossless (188→188, 0 fields lost) rather than asserting it. |
| 34 | Opus 5 (cold spawn, Opus orchestrator) | **Clause audit: spec identity + proof targets** (c1/c4). Brief seeded three orchestrator hypotheses explicitly framed as "verify, do not assume". | 148.2k | 72 | 1194s | n/a | c1/c4 unmet. **Refuted the orchestrator's own headline hypothesis** (the `## Baseline` duplication) by mutation — the parser was correctly scoped. Killed c1 with `return null` in the vitest branch leaving 176/176 green. |
| 35 | Opus 5 (cold spawn, Opus orchestrator) | **Clause audit: CLI + hook + gates** (c5–c8). | 172.0k | 61 | 1580s | n/a | c5/c8 unmet, c6/c7 met. Turned a "flaky" test into a reproducible failure (3/3 plain, 3/3 shuffled, 3/3 isolated) — the distinction that mattered. Supplied the wall-clock measurement the spec required and the branch never recorded (105.3s → 39.3s). |
| 36 | Opus 5 (cold spawn, Opus orchestrator) | **Whole-diff audit: architecture + scope**, no clause verdicts. Deliberately overlapped the other three to test convergence. | 170.0k | 46 | 921s | n/a | 20 findings. Found the unsatisfiable-gate defect that sat *inside another auditor's scope and was missed there*. Answered the bootstrap question (13 folded tasks closed, none attached) that none of the clause auditors owned. |
| 37 | Opus 5 (cold spawn, Opus orchestrator) | **Reconciliation** of the four reports into one audit record. Not an audit — merge by root cause, preserve reproductions, flag disagreements. | 154.9k | 11 | 526s | high (dedup rules, severity rule, output skeleton prescribed) | 44 findings → 36 (7H/17M/12L); 14 merged by root cause, 9 with independent corroboration. 11 tool calls for 155k tokens — reading dominates, so this is cheap per unit of judgment and a good delegation shape. |
| 38 | Sonnet 5 (cold spawn, Opus orchestrator) | **Mechanical transcription** of the audit record into the store via the repo's own CLI. Explicitly "do not exercise creative judgment". | 168.4k | 42 | 733s | high (exact command shape, safety constraints, 5 verification steps) | Recorded cleanly; diff was pure append, no serializer churn. Diagnosed a real defect en route: `npm run tasks --` with a >8191-char argv **fails silently** on Windows (exit 127, no output) because it routes through `npm.cmd`. Sonnet was the right tier — the task was quoting discipline, not judgment. |
| 39–43 | Sonnet 5 ×5 (cold spawn, Opus orchestrator) | **Fix round**, five sequential chunks against pass-1 findings (gate blockers; closing-commit anchor; freeze + audit-prompt; robustness seam; dogfooding). Each brief prescribed the *design decision* and demanded TDD + self-mutation. | ~1.07M | 532 | 8217s | very high (design prescribed, not delegated) | All five landed; suite went from 1 failing to 831 green. **But pass 2 found the round introduced 3 regressions.** Two workers correctly refused a prescribed acceptance criterion that was wrong (one proved a requested repro was information-theoretically impossible; one flagged that its fix retracted a protection). Prescribing design bought correctness *within* a chunk and bought nothing *across* chunks. |
| 44–46 | Opus 5 ×3 (cold spawn, Opus orchestrator) | **Audit pass 2** in isolated worktrees: clauses c1–c4, clauses c5–c8, and one scoped purely to "did the fix round make anything worse". | 594k | 317 | 6454s | n/a (read-only; mutation mandate + explicit distrust of the prior agent's self-verification) | 6/8 clauses met, up from 3/8. The regression-scoped auditor found all 3 regressions; the two clause auditors found none of them — each clause looks fine in isolation. Also found a structural contradiction (two clauses that cannot both be satisfied) that neither pass-1 nor any single-clause view could surface. |
| 47 | Opus 5 (cold spawn, Opus orchestrator) | **Pass-2 reconciliation** into a permanent audit record, with instructions to preserve per-auditor finding labels for downstream citation. | — | — | — | high (dedup rules, label-stability rule, output skeleton) | Written as the durable evidence base for the superseding refactor spec. |
| 48a | Sonnet 5 (cold spawn, **worktree isolation**, Opus orchestrator) | U0: remove two inherited regressions from `scripts/tasks.test.ts` — an ambient-repo diff-range assertion and a fixture writing a failing test into `scripts/lib/`. | 61.8k | 13 | 196s | high (exact line refs, named acceptance, explicit refusal invitation) | **Refused, correctly.** The worktree was cut 54 commits stale: `tasks.test.ts` was 1372 lines, none of the target material existed, and the branch's own spec file was absent. It proved the staleness four ways (`merge-base` = HEAD, zero unique commits, 54 behind, ff clean) before declining, and declined the fast-forward too because that would have pulled in `docs/tasks.jsonl` — off-limits per the brief. Cost of the harness fault: 62k tokens, no damage. |
| 48b | Sonnet 5 (cold spawn, **main tree**, Opus orchestrator) | Same brief, re-dispatched without worktree isolation after row 48a. | 184.6k | 98 | 22m15s | same brief plus a start-state assertion (`verify you see a7e71d9 or later`) | Both regressions fixed, mutation-proved. Notable: it ran the empirical question I asked instead of assuming, and **my prescribed design was wrong** — `test.exclude` suppresses a file even when named as an explicit vitest run target, so the excluded-directory approach would have silently broken all five proof-target tests. It found the narrower alternative (dedicated gitignored dir + a VITEST-gated sweep). Also reported a *third* test with the same ambient coupling, outside its named scope, rather than widening silently. 43 files / 832 green / 48s. |
| 49 | Opus 5 (cold spawn, Opus orchestrator) | U1: reconcile inherited store state against two audit archives (2391 lines), verify the spec's 25-label subsumption mapping, triage unfiled pass-2 findings. | — | — | — | high (four numbered questions, the wrong-by-3x premise flagged up front, refusal invited) | Staffed as design work per the swarm theory's synthesis rule, not handed to a cheap model as bookkeeping. |

## The fix round is where delegation got expensive (rows 39–47)

- **A regression-scoped auditor is worth more than another clause auditor.** Rows 44 and 45 verified clauses and found zero of the three regressions row 46 found, because a regression is invisible from inside any single clause. If a round of fixes is delegated, commission someone whose only question is "is anything worse than before".
- **Prescribing the design does not prevent design error — it relocates it.** Rows 39–43 executed the prescribed designs faithfully and well. Two of those designs were wrong (a binding rule that missed a case; an acceptance criterion that was unobtainable). The workers caught both and said so, which is the argument for briefs that invite pushback: both flags arrived as "your prescribed design may be wrong", which is language the brief explicitly asked for.
- **Fixing one defect can promote another.** A pass-1 medium became a pass-2 high purely because the fix removed the mask it was rated behind. Severity is not a property of a finding alone; it is a property of the finding plus everything still broken around it.
- **Orchestrator-ordered work is not exempt from audit.** The single worst outcome of the round — a 17-minute gate, a live shell-exec path in CI, and two proof targets that prove nothing — came from a chunk the *planner* ordered, executed exactly as specified. Audit the planner's chunks hardest.
- **Cost check.** The fix round cost ~1.07M subagent tokens and produced a branch that was still not mergeable. The two audit rounds cost ~1.18M and produced the finding that the real defect was structural. The audits were the better spend, and that has now been true in every row group where both appear.

## The refusal invitation is now paying for itself (rows 48–49)

- **Verify the worker's start state in the brief, not just its finish state.**
  Row 48a burned 62k tokens because `isolation: "worktree"` cut from a base 54
  commits stale. The worker caught it; the brief did not ask it to. Every brief
  since carries a one-line assertion — *verify you see `<sha>` or later, stop if
  not* — which costs one tool call and turns a silent wrong-tree run into an
  immediate stop.
- **"Run the experiment, don't reason about it" is worth a paragraph in the
  brief.** Row 48b was asked two empirical questions about vitest rather than
  told the answers. Both came back against my prescription: `test.exclude`
  suppresses a file even when it is named as an explicit run target, which
  would have silently broken all five tests the design was meant to protect.
  Prescribing a mechanism from reading is how a planner injects a defect that
  every downstream verification then confirms.
- **Two correct refusals in two dispatches.** Rows 48a and 48b both declined
  something — a stale tree, and a prescribed design — and both were right. The
  invitation is cheap to write and it has now caught a harness fault and a
  planner design error in a single round.
- **A worker reporting out-of-scope defects beats a worker fixing them.** Row
  48b found a third test with the same ambient coupling, named it, and left it
  alone. That kept its diff auditable and kept the unit's acceptance honestly
  unmet rather than quietly widened.

## Session usage snapshots

Whole-session totals (not per-delegation), logged at recycle points to calibrate
the "% of 5-hour budget per turn" recycle signal from the operating agreement.

| Date | Orchestrator model | 5h budget used | Weekly budget used | Session cost | Active / wall time | Opus / Sonnet split | Cache hit | Rows covered | Note |
|------|--------------------|---------------:|--------------------|--------------|---------------------|----------------------|-----------|---------------|------|
| 2026-07-17 | Opus (this session) | 77% | 36% (all models) | $10.72 | 31m44s / 1h8m | 55% / 45% | 96% | 8–15 | Recycle point; switching next chunk to a Sonnet orchestrator as a new experiment (cheaper turn rate, testing whether planning/review quality holds without Opus) |
| 2026-07-17 | Sonnet 5 (first orchestrator run) | 89% (started this convo at 79%, cross-session rolling window) | 37% (all models) | $3.18 total ($0.41 at model-switch checkpoint, so ~$2.77 marginal for the full chunk below) | 8m29s / 11m18s (this chunk: ~7m8s active) | 100% Sonnet | 95% | 16 | One full orchestrator cycle for row 16: Explore-agent ground-truth survey (no stale-memory trust) + design/scope decision + delegation spec + independent review (diff read + own test run) + docs/memory bookkeeping + commit. See verdict below. |

### Verdict — Sonnet-orchestrator trial #1 (n=1, promising but not conclusive)

**Quality held.** No sign of degradation vs. the Opus-orchestrated rows: the
Explore-agent survey caught that `runtime.ts`/`session.ts` already anticipated
item actions (contradicting the stale memory summary, which didn't know this)
— i.e. it verified ground truth instead of trusting a prior write-up, exactly
per house rule. It surfaced a genuine architecture fork (the disconnected
legacy timer/buff engine) unprompted and made a defensible scope cut (defer
the buff, ship item-actions + consume-and-narrate) rather than either ignoring
the gap or improvising a design that would collide with the legacy system.
The delegation spec was exact-seams enough that the coding agent one-shot it
with zero rework, and review caught nothing wrong on an independent diff read
+ own test run before commit.

**Cost is not yet a clean comparison.** The $10.72 Opus baseline (rows 8–15)
covers 8 delegations plus a full day's accumulated planning context; this
$2.77 marginal cost is one delegation's full cycle from a cold start. Not
apples-to-apples — no matched same-scope Opus chunk to diff against. What IS
notable: the *orchestrator's own overhead* (survey + design + review +
bookkeeping, not the sub-agent's 77.1k tokens) was the majority of that
$2.77, and it's the exact category the operating agreement predicted would be
~5x cheaper under Sonnet. Need several more chunks, ideally with the same
shape, to get a real read.

**Operational note:** the 5h budget was already at 77% (Opus session) before
this conversation started, and this one chunk pushed it to 89% — leaving
minimal headroom before the 2h reset. A Sonnet orchestrator is cheaper per
turn, but a long-running conversation still accumulates the cache-read
quadratic (4.2M cache-read tokens this session) — the recycle discipline
from the operating agreement still applies, just with more turns available
per budget unit, not unlimited ones.

| 16 | Sonnet 5 (cold spawn, **Sonnet orchestrator** — first non-Opus planner) | Extract shared `action.ts` from `entity.ts`; give items an `actions:` block (schema wiring); wire `eat` on `bread`/`cooked-shrimp` (consume+narrate only, buff explicitly deferred); doc + tests | 77.1k | 44 | 257s | high (exact extraction target, exact wiring pattern to mirror, exact content shape, explicit out-of-scope list) | Correct, one-shot; 77→78 green (confirmed independently), tsc byte-identical (64/64). Dispatch worked with zero `runtime.ts`/`session.ts` changes, as the orchestrator's ground-truth survey predicted — agent verified this empirically per instructions rather than assuming. One good unprompted catch: the `baked` dialogue node promised a stat "buff" from eating that this task deliberately didn't implement, so the agent rewrote those two lines to avoid the game lying to the player — correct scope judgment, not scope creep. |

Rows 4 and 5 (and 7 and 8) each ran **in parallel** as two background Sonnet agents on disjoint files. Rows 10 and 11 were the **warm-swarm probe**: 11 continued 10's agent via `SendMessage` instead of a fresh spawn. Rows 12→13 are the **STOP-then-cold-respawn pattern**: chunk 1 took two cold spawns — 12 correctly stopped on a planner spec error (125k), 13 executed the corrected spec (62k) — instead of warm-resuming 12. Validates the no-warm-resume rule: a fresh cold spawn on a fixed spec cost *less* than dragging 12's 125k transcript forward would have, and kept the two diffs cleanly separable for review.

## Findings so far (directional, not settled)

### Token efficiency — depends which budget
- **Total tokens: delegation costs more.** Every spawn cold-starts and re-reads
  files the delegator already holds in context. Haiku spent ~43k tokens to
  change ten lines; inline that is ~5–8k. The cold-start tax is fixed overhead
  that dominates small tasks.
- **Main-context tokens: delegation is cheaper.** Only the ~1k summary + the
  diff return to the main thread; the 40–90k of churn never enters it. In a
  long session where the main context window is the scarce resource, this is
  the real win — delegation trades *total* compute for *main-context* runway.
- **Dollars: model choice can flip it.** Cheap-model tokens can undercut
  inline-Opus even with the cold-start waste, because the price-per-token gap
  exceeds the token-count gap. "Delegate to a cheaper model" can be *more* total
  tokens yet *fewer* dollars.

### Review value — mostly not from discovery
Both implementation agents were honest and self-flagged their weak spots, so the
review rarely *uncovered* something hidden. Its value was: (1) **independent
verification** — re-running tests/tsc and confirming the engine file was
untouched, cheap insurance against a false "it works"; (2) **severity +
architectural synthesis** — e.g. connecting F1 to the upcoming `dialogue` kind,
which no agent did; (3) a **decision gate**. Discovery value would rise with
less-reliable agents or lower-spec tasks — i.e. exactly the cheap-model regime.
Review pairs *especially* well with cheap delegation.

### Trivial tasks — wasteful on tokens/latency, but that's the wrong lens
F2 was over-served: 87s + a cold-start to change ten lines. On raw efficiency,
inline wins trivial work. Delegation earns a trivial task only when **context
preservation** is the goal, and a cheap model makes the waste affordable.

### Haiku — one success, but too easy to generalize from
F2 shows Haiku executes a *fully specified* small change cleanly. It does not
show where Haiku's reliability drops, because the design was handed over. Needs
a **low-spec probe**: a small task described by intent only (no regex, no exact
edit), to isolate "can the cheap model design a small fix" from "can it type
one." Run 2–3 before concluding.

### Parallel disjoint-file delegation works — but can induce duplication
Rows 4 and 5 ran concurrently, split so they touched disjoint files (a safe way
to parallelize on one working tree). Both landed correct with zero conflict. But
the split *forced* row 4 to re-declare a shared regex it couldn't import (it was
barred from `condition.ts`, which the other agent's boundary also excluded), so
the tactic traded conflict-safety for an induced duplication that review then
consolidated. Lesson: parallelize on disjoint files freely, but budget a small
review-cleanup when the tasks would naturally share a primitive.

### A large delegation's own tests are not enough QA — integrate against real input
Row 7 (the runtime) was the most *system-wide* delegation yet, and it came back
green on its own 9 tests. But those tests were internally consistent and
*incomplete*: the runtime re-fired effects on a node revisit and abandoned a node
after a menu choice, and **neither showed until row 8's real authored content ran
through it** (integration). Lesson: for a big delegation, "the agent's tests
pass" proves self-consistency, not correctness — the review must run it against
an independent, real input. This also sharpens the design-heavy finding below:
the runtime was system-wide *and* delegated fine — the decisive factor was the
7-piece spec, not the scope.

### Friction reports are a distinct delegation payload
Row 8's real deliverable wasn't the content, it was the friction report — a
language model authoring against the grammar for the first time is a usable
instrument for *intuitiveness*. It independently confirmed the predicted
item-possession gap (`requires: lockpick` reads as "holding one" but is a bare
flag) and surfaced a bare-vs-qualified reference ambiguity we hadn't decided.

### Design-heavy delegation — the "poor fit" claim was too broad
Row 5 was the design-heavy experiment. Given requirements, a starting vocabulary,
and world context (via `.planning/` files), a cold Sonnet agent produced a
coherent, minimal grammar and made good independent calls — reusing the repo's
`<obj>.<objId>.<actionId>` addressing and the shared condition grammar rather
than inventing parallels. So design-heavy delegation is **not** automatically a
poor fit. The distinction that actually matters is *local vs. system-wide*: a
bounded new component with clear requirements delegates fine; a design that must
reconcile the whole architecture (the one-directional pivot) does not, because
that whole-system view is exactly what a cold spawn can't rebuild.

### Warm-swarm (SendMessage continuation) — the token savings did not materialize
The hypothesis (handoff goal 2): spawning fresh re-pays a ~40–108k cold-start
re-read every time, so keeping an agent warm and dispatching follow-ups via
`SendMessage` (which continues it *with context intact*) should dodge that tax.
Rows 10→11 tested it: 11 continued 10's agent instead of cold-spawning.

**Result: warm resume was *not* cheaper.** Task 11 was the *smaller* task (rewire
one script vs. build a layer + tests), yet cost **82.5k tokens / 37 tool calls /
692s** — more tool calls and more wall-time than the from-scratch task 10 (99.9k /
25 / 470s), and only ~17k fewer tokens despite being a lighter job. The agent
*did* reuse context correctly (it re-read only `playtest-cli.ts` +
`playtestEngine.ts` + one grep; it did **not** re-read `runtime.ts`/`session.ts`/
content — it held them from task 10). So context continuity is real and the
file-re-reads were genuinely avoided.

**Why it still cost so much:** a `SendMessage` resume carries the *entire prior
transcript* (~100k from task 10) forward as a context prefix that is re-ingested
on every subsequent model turn. Over 37 turns spanning 692s — far past the
~5-minute prompt-cache TTL, so repeated cache misses — reprocessing that retained
transcript dwarfed the handful of file-reads it saved. The retained context is a
*liability* here, not an asset, because the shared code it replaces (a few hundred
lines) is cheap to just re-read cold.

**And the main-context budget is identical either way** — only the ~1k summary
returns to the delegator whether the sub is cold or warm. So there is *no*
main-context argument for warm over cold; the whole appeal was total-token
savings, which didn't appear.

**Revised guidance:** for **bounded, well-specced coding tasks**, prefer a **cold
spawn per task** — the spec *is* the context, and re-reading a few files is cheaper
than dragging a large transcript. Reserve `SendMessage` continuation for cases
where the agent must retain a **large, hard-to-respec working state** that a spec
can't cheaply reconstitute (a long debugging thread with accumulated hypotheses;
an iterative design conversation), and keep the follow-ups **inside the cache
window** so the retained prefix stays cached. Warm-swarm is a *state-preservation*
tool, not a *cost-reduction* one.

## Working heuristic (revise as data accrues)

- **Non-trivial, self-contained feature →** delegate to Sonnet; context offload
  + review gate paid off (row 2).
- **Trivial, well-specified fix →** usually inline; delegate only to protect a
  long context, and then to Haiku.
- **Always review** — cheap; its value (verification + synthesis) is independent
  of whether the agent erred.
- **Design-heavy but *local* work →** fine to delegate (row 5): a bounded new
  component with clear requirements + a starting shape, checked on review.
- **Design that must reconcile the *whole system* →** poor fit: the cold agent
  can't cheaply rebuild the architecture-wide view. Keep it in the main thread.
- **Parallel agents →** split on disjoint files; expect an occasional induced
  duplication to clean up on review.
- **Warm resume (`SendMessage`) →** not a cost play: use it only to preserve a
  large working state a fresh spec can't cheaply rebuild, and keep follow-ups
  inside the cache window. For bounded, well-specced tasks, cold-spawn each.

## Break-even, stated once

Delegate when the implementation churn you'd otherwise absorb into the main
context exceeds the cold-start re-derivation cost, and the task is self-contained
enough to bound that cold-start. Cheaper models lower the right-hand side.

## Context-cost curve (folded from context-cost-log.md)

Separate 3-turn probe of the quadratic hypothesis — does an Opus *planning* turn
cost more as session context grows? Ran one session 124k→189k context, recording
5h-budget delta per turn: a heavy turn at 124k cost +10%; a light turn that
spawned nothing still cost +8% at 189k. Conclusions, all reinforcing the
recycle-early discipline above:

- **The per-turn floor rises with context** — carrying the context outweighs the
  work done. The session hit 35% of the 5h budget in ~4 turns at only ~18% context.
- **Delegation shifts ~40% of spend to Sonnet but does not stop the Opus-context
  climb (still 60%).** Necessary but not sufficient — the orchestrator must be
  recycled, not just kept lean.
- **Budget, not context %, is the binding limit.** Recycle triggers should key
  off the budget meter (35% budget reached at 18% context).

## Audits are a different delegation class (rows 29–32, first data)

Four read-only audits run in parallel from one orchestrator, ~584k subagent
tokens total. Early and directional:

- **The verify-every-claim mandate is the whole product.** All four returned
  fixtures and measurements rather than code reading, and two of them
  *refuted their own hypotheses* mid-run (row 30 predicted a merge-attribution
  bug and measured it away; row 29 re-ran the prior audit's table and confirmed
  the fix landed, which bounded its own finding). An audit brief without that
  mandate would have produced plausible prose instead.
- **Adversarial framing beats "look for problems."** Row 30's brief said: for
  each gate, build a violation it catches *and* one of the same spirit it
  misses. That instruction is what found H1. The other three briefs were
  weaker on this and found correspondingly less about their own gates.
- **Parallel audits cross-check each other for free.** Three independent
  auditors found the same `systems.json`-is-not-a-partition defect from three
  directions, and one found the root cause of another's finding (CRLF).
  Convergence from cold, non-communicating agents is stronger evidence than
  any single report.
- **Model tier tracked system size, not difficulty, and that looks right.**
  Opus on the two systems with real code, Sonnet on the two that are mostly
  config; the Sonnet reports were shorter and no less honest. The anti-padding
  instruction (row 32) mattered more than the model.
- **Orchestrator review is still required and still cheap.** Spot-verifying
  ~2 headline claims per audit at the line level cost far less than the audits
  and caught nothing wrong — which is itself the data point.

## Audit through the generated brief (task-system-refactor pass 1, 2026-08-03)

First audit commissioned as one sentence — "run `npm run tasks -- audit-prompt
<spec>` and do what it says" — after the brief moved into the tool. What the
row records:

- **The brief carried the whole protocol.** The auditor graded all 16 clauses
  with live reproductions (ran the prefix resolution, the `--` terminator and
  the findings-only audit path itself), filed verdicts and two findings
  straight into the store with deliverable and evidence attached, and recorded
  the pass — no hand-built prompt, no orphan report document, no verdict wipe.
- **Fast, and speed alone is unsigned.** Historical passes found a dozen-plus
  findings with at least one HIGH; this one found 2 lows, both real, both
  closed same-day. Whether that means clean work or a shallow pass is exactly
  what a second independent auditor discriminates (see rows 29–32:
  convergence from cold agents is the strong evidence).
- **The environment, not the task, cost the retry.** A fresh worktree ships
  without `node_modules`; the first `merge-ready` run failed 104 subprocess
  tests before `npm ci` fixed it — third session to hit this. `merge-ready`
  now names the trap up front.

## Three parallel auditors against pass 1 (task-system-refactor pass 2, 2026-08-03)

Three cold Opus auditors, de-correlated emphases (store/state, audit
machinery + behavioral regression diffing, CLI surface), no store writes,
reports returned in-message and imported serially. Cost: 811k subagent
tokens (A 308k/139 tool calls, B 318k/149, C 185k/111), plus one fully
cancelled first round (a session interrupt propagated to the background
agents) and a shared-node_modules contention tax — one auditor's `npm ci`
against the primary checkout emptied the directory every sibling's
junction pointed at.

- **Pass 1's speed was shallowness, settled.** One sentence commissioned
  pass 1; it found 2 lows and graded 16/16 met in minutes. Three
  independent auditors found a real HIGH regression (`spec show --full`
  dead as documented, in a CI-visible command), overturned two clause
  verdicts (c2, c5) and half of a third (c3), and filed 25 findings.
- **Convergence is the product.** All three found the HIGH and the same
  `promote` atomicity defect independently; two found the same
  ownership miss; the two audit-machinery findings (B and C) turned out
  to be two doors into the same verdict-wiping trap, found from different
  directions. Unique finds tracked the assigned emphases, so the
  de-correlation bought coverage, not redundancy.
- **The narrow-mandate auditor was not weaker, only cheaper.** C (185k,
  standard-depth brief) found the HIGH, three of the four convergent
  mediums, and the only finding about the docs. The mandate text mattered;
  the per-agent depth mostly bought mutation verification (A ran 20+
  mutations and found the two clause halves nothing holds).
- **Parallel agents must not share a mutable dependency.** The junction
  fix that solved the serial worktree problem became the round's biggest
  tax in parallel. Next round: per-worktree `npm ci`, never the primary's
  directory; private scratch subdirectories; and never `npm ci` in a
  checkout you did not create.

## Clause audits with a mutation mandate (rows 33–38)

Six delegations, ~987k subagent tokens, auditing a branch against its spec's
eight proof clauses rather than auditing a system.

- **Worktree isolation is the enabling infrastructure.** Mutation testing means
  temporarily breaking source, so parallel auditors in one tree would poison
  each other's runs. A git worktree per auditor plus a `node_modules` junction
  (`mklink /J`) costs one setup call and makes the parallelism safe. Without it
  this had to run sequentially.
- **Deliberate scope overlap pays.** The whole-diff auditor (row 36) found the
  unsatisfiable-gate defect *inside* the spec auditor's scope, where it had been
  missed. Redundancy is not waste when the failure mode is a blind spot.
- **Orchestrator review added a finding for the first time.** Previous rows
  recorded spot-checks confirming what agents claimed. Here a two-minute code
  read of the line two auditors had already condemned found a *second*,
  independent defect on it (`'0 passed'` also matches `10 passed`). Review is
  worth more than sampling when it lands on already-suspect code.
- **Seed hypotheses, but frame them as "verify, do not assume".** Three were
  seeded; one was refuted by mutation (row 34), one confirmed, one confirmed and
  deepened. The refutation is the evidence the framing works — a brief that
  asserted the hypothesis would have gotten agreement instead.
- **"Flaky" is a hypothesis, not a finding.** Two auditors reported the same test
  as intermittent; the one that ran it 9 times across three conditions (row 35)
  established it was deterministic. Brief auditors to distinguish the two.

## Open experiments

- [ ] Low-spec Haiku probe (intent-only small task) — find the reliability edge.
- [x] Warm-swarm probe (rows 10→11): `SendMessage` continuation is *not* cheaper
      than cold-spawn for bounded tasks — the retained transcript costs more than
      the file-reads it saves. It's a state-preservation tool, not a cost play.
- [x] A design-heavy delegation (row 5) — the "poor fit" hypothesis narrowed to
      *system-wide* design, not *local* design.
- [ ] Track review *rework rate*: how often the review sends work back
      (so far 0/10 fully sent back; fixes caught on review: 1 code consolidation,
      2 doc-accuracy corrections, 2 runtime bugs, 1 content-balance edit — the
      runtime bugs only via integration against real content, not the agent's
      own tests. 1 agent-initiated adjacent-consistency fix, correct, needed no
      planner rework. Rows 33–38: 0 sent back; 1 defect *added* by orchestrator
      review on top of a finding two auditors had already made).
| 39 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 4 spec members** (`planner-meets-the-record` c1–c4: tooling so a planner's survey reaches rulings, not just claims). Dispatched with the repo's own one-line instruction — "run `tasks work-prompt <spec>` and do what it says" — not a hand-written brief. | n/a (killed by 401) | n/a | n/a | low (generated brief only; 4 orchestrator constraints: stop before the eval, defer audit, do not edit clauses, label claims vs rulings) | Correct on all four, verified independently by the orchestrator against the motivating failure. Died on an expired OAuth token at the handoff to the 5th member, after committing all four cleanly — the generated-brief dispatch shape survived the kill with no state to reconstruct. |
| 40 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (c7: rewrite `docs/workflow.md` steps 2–3 so the documented survey and the survey that finds things are the same survey). Resumed the branch after row 39's auth failure. | 95.3k | 51 | 505s | low (generated brief; told to read the real tool output rather than the finding's description of it) | Correct. Verified the landed behaviour before describing it, and refused to overclaim `spec new`, which it could not change (grant was docs only) — described it accurately instead. **Found a second live instance of the very defect the spec fixes**: `reportPriorArtOnWrites` prints prior art but never rulings, so the one survey that fires automatically is the half that cannot see a decision. Confirmed by the orchestrator by reading the source. Cleaned up its own scratch probe. |
| 41 | Sonnet 5 (cold spawn, Opus orchestrator) | **Delete a command and a commit-contract field** (c8/c9: retire `tasks handoff`, retire the `Next:` trailer whose only reader it was). | 203.7k | 102 | 879s | low (generated brief; 2 traps named up front — merged specs are history, and the commit-msg hook validates the worker's own commits) | Correct. Both named traps avoided: no merged spec or audit touched, and it hand-verified the contract on with-trailer/without/subject-only before committing. Grew its own grant twice mid-task and said so. **One misattribution caught on review**: reported 5 `doctor` errors as "present before this session started" when the orchestrator had caused them 40 minutes earlier by deleting a spec file with live members — a reminder that a cold agent has no way to date state it did not create, and should say "I did not cause this" rather than "this is pre-existing". |
| 42 | Sonnet 5 x4 (cold spawns, isolated worktrees, Opus orchestrator) | **Evaluation cells, not implementation**: four planning agents given a constant two-sentence opening and one varying request, to test whether a planner meets the record before the code. | 66.7k–144.0k | 16–52 | 139s–800s | minimal by design (two sentences, no meta-instruction — asking "tell me if you stopped" would prime stopping and contaminate the controls) | 4/4 read the record correctly. A1 stopped on a standing ruling and re-measured rather than quoting it; A2 proceeded on a ruling whose trigger had fired; B reused an existing deferred record instead of duplicating it; C proceeded on an empty record. **The experiment leaked**: the spec quoting every prompt and verdict was committed in the worktrees, and the worktrees were named `eval-*`. One agent stated it had recognised a control case. Cheap, honest failure — it produced a better taxonomy (four record-states, not stop/proceed) than the design it invalidated. |
| 43 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (`audit-splits-at-its-seam`: split a 1165-line, four-concept `audit.ts` into brief generation and pass filing). Pure move, no behaviour change. | 354.8k | 97 | 1617s | low (generated brief; spec written immediately before dispatch, stating the seam as a rule rather than a file list, with two placements named as the worker's to settle) | Correct, and verified independently by the orchestrator three ways: both c1 greps, the 119 test titles splitting 65/54 with an identical sorted list, and a line-multiset diff showing 1079 non-import lines on each side with nothing added or dropped. **Found two defects in the orchestrator's own spec** — c3's proof grep forbade the one-way import c3's own Open Questions sanctioned, and c4 asked a file to stop leading a report `taskStore.ts` has led all along. It worked the clause text and recorded the mismatch instead of silently satisfying the grep, which is exactly the behaviour that turns a bad proof into one round trip rather than a wrong verdict. Corrected its own grant twice and said so. |
| 44 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec** (`audit-splits-at-its-seam`, pass 1, four clauses). Dispatched with the repo's one-line instruction plus a scratch filename prefix. | 154.7k | 57 | 829s | low (generated brief; prefix `asais-audit1-` named to keep concurrent auditors off each other's manifests) | All four met, and the orchestrator reproduced the load-bearing claim rather than grading the report. **Went past its brief in the way that matters**: no proof line asked for it, but it diffed the line multiset base-vs-split to test the failure the import-grep cannot see — duplicated logic with no import — and that is the only check that distinguishes a pure move from a rewrite. Also reconciled a 123-vs-119 test count it did not understand instead of accepting the number that happened to match, tracing the extra four to string fixtures inside `testTitles()`'s own tests. No silent guess found, and it said so having looked. |
| 45 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (`brief-builds-the-manifest`: make a proof target that names test files resolve, so the auditor's brief stops handing over a blank mutation manifest). | 265.2k | 121 | 1497s | low (generated brief; spec written immediately before dispatch, with the accepted target forms left as an open question to settle from the corpus rather than guessed) | Met four of five. Surveyed the real corpus instead of inventing a grammar — 259 `vitest`-prefixed proof targets across `docs/specs/*.md` — taking resolution from 108/259 to 237/259 with the remaining 22 named rather than dropped. Reused the existing fix on tag `archive/festive-blackburn-e1a2d4` for c4 instead of rewriting it, and **disclosed the half it did not do**: `--finding "   "` still filed a record, because nothing guards a title for presence the way `audit.ts` guards deliverable and evidence. That disclosure is the behaviour worth having — the audit then graded c4 unmet and found *more* than was disclosed (no truthiness check on title at all, so even an empty title filed). **What the orchestrator's own clause got wrong**: c1 said a file-naming target "resolves to the tests declared in those files", which the worker met exactly and which generates **354 unaimed manifest entries** under a brief instructing the auditor to aim every one. |
| 46 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (`a-move-never-strands-a-question`: five verbs move a record out of the unreviewed queue with no awareness that `ask` left a live question in its evidence). | 231.6k | 104 | 1509s | low (generated brief; spec named the guard's placement as the clause and left the sentinel's surviving writer, the return route's name, and the sweep's depth to the worker) | Correct, and the orchestrator reproduced the load-bearing claim rather than grading the report: deleting the guard call inside `transition()` fails **7 tests across both `records.test.ts` and `triage.test.ts`**, which is the only check separating a shared guard from five correct copies. Collapsed the two sentinel writers to one constant with a single reader *before* adding the reader, in the order the spec asked. **Checked a folded finding against the file instead of believing it**: the finding claimed `tasks defer <junk>` "exits 0"; it exits 1, confirmed independently on main, so the worker reported the reproduction as stale rather than testing around a bug that was not there. |
| 47 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (`dropped-and-failed-clauses-differ`: `spec: null` was carrying three different meanings and two readers each guessed one back out). | 267.1k | 191 | 1988s | low (generated brief; spec stated the invariant and left the departure vocabulary, the flag's shape, and the overlap-detection signal as open questions) | Correct on all three of its clauses. Added `Task.departure` and `departFromSpec` as the one route that nulls an existing record's spec. **Grew its grant well past forecast and said so every time** — narrowing `--deferred` broke `roadmap.ts`'s reuse of the same filter for an unrelated concept, which pulled in `roadmap.ts`, `roadmapCmd.ts`, `cli` and six test files, plus one line in `audit.ts` outside its grant. The disclosure was right and the outcome still cost a merge: `tasks plan` had graded these three grants disjoint, because `plan` reads *forecast* paths and cannot know what a fix will actually need. |
| 48 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec** (`brief-builds-the-manifest`, pass 1, five clauses). | 157.9k | 63 | 1110s | low (generated brief; prefix `bma-`) | Graded c4 unmet and was right — and found more than the worker had disclosed. **Independently reproduced the defect the orchestrator had measured but not steered it toward**: it found the tool-generated 354-entry manifest impractical to aim, hand-built a 6-entry one, and logged the cost — against a deliverable that reads "No auditor hand-builds a mutation manifest again". Two independent measurements of the same regression, one before dispatch and one in use, is what made it a filed record rather than an opinion. |
| 49 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec** (`a-move-never-strands-a-question`, pass 1, five clauses). | 139.6k | 63 | 880s | low (generated brief; prefix `msqa-`) | All five met, 5/5 mutations killed. Every load-bearing claim held on independent check: exactly one `task.state =` assignment in the tree, 41 verbs registered and 29 bounded to the digit, and its "pre-existing flake" attribution was a real filed record (`npm-test-flakes-on-three-slow-spawn-heavy-tests-under-full-s`) rather than a convenient story — worth checking, since a mid-run suite failure is the easiest thing to wave away. |
| 50 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec** (`dropped-and-failed-clauses-differ`, pass 1, five clauses, two of them owed by a second member). | 158.6k | 67 | 930s | low (generated brief; prefix `dvfa-`) | c1–c3 met, c4/c5 correctly unmet — they belong to a member still blocked. **Filed a HIGH nobody asked for**: `cmdSpecRemove` unconditionally stamps `'retriage'` over an already-departed record's more specific reason, reachable through a route c2 never named. Its own pass then demonstrated the spec's c5 defect live — grading two clauses unmet auto-created two undelivered records duplicating the member task that already owned them, giving three records for two clauses, inside the audit of the spec that exists to fix exactly that. |
| 51 | Sonnet 5 (cold spawn, Opus orchestrator) | **Fix one unmet clause** (`brief-builds-the-manifest-clause-4`: trim a finding's title at assembly and guard it, after pass 1 graded c4 unmet). | 60.6k | 33 | 238s | low (generated brief off the undelivered clause record the audit itself created) | Correct, and cheap — the whole round cost a quarter of a fresh implementation, because the audit had already written the brief. Trimmed at the assignment and added the missing truthiness guard, mutation-verifying each independently. Verified live afterwards by the orchestrator: `--finding "   "` and `--finding ""` both refuse where both filed a record before. This is the shape that makes an unmet clause cheap: the pass files a record carrying the reproduction, and the record *is* the next brief. |
| 52 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec, pass 2** (`brief-builds-the-manifest`, re-grading all five clauses after c4's fix). | 168.2k | 44 | 585s | low (generated brief; prefix `bma2-`) | All five met. **Re-graded every clause rather than only the one that changed**, which mattered more than it looks: clause standing reads the latest pass alone, so a pass 2 grading only c4 would have reverted the other four to `unknown` — the open finding `a-clause-met-by-an-earlier-pass-reverts-to-outstanding-when-`. The pass-file skeleton writes one line per clause, and that alone was enough to steer it right with no instruction from the orchestrator; worth knowing, because the next phase leans on it three times. |
| 53 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (`a-branch-is-told-which-spec-it-owes` c1/c2/c3/c6/c7: delete `resolveActiveSpec`'s two history routes after the author ruled manual selection beats fixing the inference). | 322.6k | 138 | 2113s | low (generated brief; the spec carried the measurement that killed the inference, and named the branch-name route as retained-unchanged so the worker would not "repair" it into firing on 55 branches it never fired on) | Correct. Deleted both routes and `lastSpecWrittenFromBranch` with them, generalised the "contested" message to cover 0/1/many candidates, and carried `--spec` into all four printed commands c7 named. **Closed c6 by reproduction rather than assertion**: built a fixture branch with a stray spec-tagged note, re-ran the pass5 repro, and confirmed the false WARNING was dead before declining the record. Filed the out-of-scope `spec show` flag gap instead of widening. |
| 54 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (c4/c5: compose clause standing across every recorded pass, and let the clauses leg settle a declined clause). | 245.6k | 158 | 1555s | low (generated brief; the open question named the honest reading — a later pass that *does* grade a clause wins, unmet included — and left it to the worker to confirm) | Correct, and the orchestrator's check was a single decisive diff: on the thirteen-clause spec, `clause standing` went from `(latest pass 2): c1, c5, **c6**, c7, c8, c9, c10-c13` to `(composed over 2 passes): c1, c5, c7, c8, c9, c10-c13` — c6 drops, nothing else moves. **Found a ninth call site outside its grant and refused to fix it**: `records.ts:789`'s `clauseStanding`, singular and hand-rolled, with the identical latest-pass bug. Filing rather than widening was right; the orchestrator folded it into member 3, since the clause's property covers any site deriving a status from one pass. |
| 55 | Sonnet 5 (cold spawn, Opus orchestrator) | **Implement 1 spec member** (c8–c11: make the branch's spec answer a set read from its own store diff, and grade every declared spec on the clauses its members discharge). | 333.0k | 142 | 2246s | low (generated brief; the ruling it implemented was recorded as a decision with the scalar chokepoint measured to the line — `written: string[]` at :265, collapsed at :256, scalar at :57) | Correct and larger than specced in the right direction: deleted `specToGrade`, `authoredAsPlan`, `specAddsClauseId`, `decideSpec`, `specsWrittenFromBranch`, `changedFiles`, `diffTouchesRegion` and `branchWorkedOnMembers`, leaving no event-log read in `mergeReady.ts` at all. Made an unreadable diff fail loud rather than read as "declares nothing". The gate now prints `every member of <slug> **this branch declared** is closed` — the phrase that retires the red-by-design legs the orchestrator brief had been telling readers to ignore. |
| 56 | Sonnet 5 (cold spawn, Opus orchestrator) | **Fix a deadlock the branch itself caused** (c3/c11: point `audit-prompt`'s ownership check at the declared set, and pin the mutation pass 1 found surviving). | 240.7k | 88 | 1475s | low (generated brief off the finding the audit filed, which carried the reproduction) | Correct. `audit-prompt` went from "7. Do not file a pass" to "7. File the pass." on the same checkout. **Strengthened a guard the spec did not ask about and said why**: `rangeIsUnrelated` needed a *non-empty* declared set, not merely non-null, to keep "nobody can place this diff" distinct from "known to be somebody else's" — caught by an existing test, recorded as a decision. For c11 it changed no source, because the source was already right; it added the two-specs-in-one-diff test that proves it, which is the honest outcome when a mutation survives against correct code. |
| 57 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec** (`a-branch-is-told-which-spec-it-owes`, pass 1, eleven clauses, three members). | 159.7k | 51 | 831s | low (generated brief; prefix `bsio-`) | **The most valuable audit in this log.** It could not file a pass at all — and that was the finding: `merge-ready` said the branch owned the spec while `audit-prompt`, minutes earlier on the same checkout, said the diff was foreign and refused to write the manifest. A deadlock the branch had just introduced, in the seam the spec's own Decisions section names. Reproduced independently by the orchestrator before any fix. It also reported a mutation that **survived** — `ownClauseIds` scoping correct in source and proven by nothing — which is the rarer and more useful half of mutation testing. It followed step 7 and refused to file rather than working around the brief. |
| 58 | Sonnet 5 (cold spawn, Opus orchestrator) | **Audit 1 spec, pass 2** (same spec, eleven clauses, after the deadlock fix). | 190.4k | 77 | 1081s | low (generated brief; prefix `bsio2-`) | 9 of 11 met. Hand-built an 8-entry manifest because the generated one was **684** entries — third consecutive auditor to do so, and the measurement that raised that finding to high. Graded c2 unmet on a real fact: `tasks plan` exits 0 where `next` and `promote` exit 1. **The orchestrator checked before anyone fixed it and the clause was wrong, not the code**: CI runs `plan --branch` unguarded and documents that a read exiting non-zero breaks another spec's c1, so satisfying c2 would redden every PR. Fourth defective clause the orchestrator authored this push, and the first in the clause text rather than the proof line. |
| 59 | Sonnet 5 (cold spawn, Opus orchestrator) | **Read-only survey**, not implementation: after the ruling to delete the inference, establish whether any caller would be left with no way to supply a spec. | 112.4k | 50 | 312s | high for a survey (the question named the exact artifacts to check — workflows, package scripts, hooks, subprocess call sites, and the commands printed by the four brief generators — and asked for a trustworthy negative) | Clean negative, and it earned the dispatch by finding something the question did not ask for. No stranded caller exists. But four *printed* commands recommended bare `tasks -- next`/`-- triage` with the spec sitting in a local variable at the print site, which would have manufactured the very refusal the change introduced — including one ternary interpolating the spec into one branch and printing a bare verb in the other. That became c7. A survey commissioned to prove a negative returned the run's cheapest real finding. |
| 60 | Sonnet 5 x6 + Opus 5 x3 (cold spawns, one shared worktree, Opus orchestrator) | **The first whole-system sweep of the Task system**, split into nine disjoint regions — store core, write grants/`plan`/architecture, specs and the audit filing route, generated briefs, record lifecycle and triage, gates and CLI plumbing, the store *as data*, doc/tool drift, and process history. Every auditor read one shared brief file naming the reported symptoms and forbidding all store writes, `merge-ready` and `mutate`. Opus on the three regions tied to the reported failures. | 162.5k–271.8k (2.11M total) | 39–90 (572 total) | 519s–1489s, run concurrently in ~25 min wall | low per agent, but the *shared* brief was high-context: it named the symptoms, quoted the commissioning ruling, and asked for structural diagnosis over defect lists ("a finding that is only 'this line is wrong' is worth much less than 'this field is derived in two places'") | 35 findings, 16 high, zero collisions, zero tracked files touched by any auditor. **Both premises the sweep was commissioned on came back wrong**, from two different agents, each with a reproduction: `tasks plan` did not fail because it reads forecasts — all three Phase 3 grants were `commitment`, so the softening never engaged and the check reported no overlap because the *record* was false; and "nothing models these two files must agree" is true only at the render, since `architecture.ts` already walks every import edge and then filters same-system callers away. **One auditor filed a confident HIGH that was wrong** (`departure` null in 811/811 occurrences — the field had landed the day before and one departing event had occurred since), caught by the orchestrator in one command and written up as §10 rather than dropped, because it is the same shape as the miscount that argued the pause. The read-only-shared-worktree shape worked: nine agents, one checkout, no `node_modules` incident, because the brief forbade every write path rather than trusting sequencing. |
| 61 | Sonnet 5 x2 (cold spawns, one shared worktree, Opus orchestrator implementing alongside them) | **Implement two of the ten clauses of `a-silent-answer-is-a-defect`**, the branch acting on §7 of the whole-system sweep — one agent on the flag vocabulary (`cli.ts`, H12/H13), one on the architecture query and the collision check (`architecture.ts`/`architectureCmds.ts`, H3/M4/half of H2) — while the orchestrator held the store and implemented the other eight clauses in the same checkout. | 142.1k, 150.9k (293.0k total) | 48, 40 | 715s, 1016s, run concurrently | **high, and deliberately so**: each brief carried the finding's reproduction, the design already decided, the write grant as an exclusion, and one standing prohibition — no `tasks` write verb, because the store's read-modify-write race was the very defect another slice was fixing an hour away | Both correct, and both pushed back where the design was wrong. The flag agent **refused the audit's own prescription for the right reason** — the suggested `...`-scoped repeatability rule marks `--args-from` repeated and misses `--finding`, verified against the real table — and replaced it with a bracket-depth rule it swept over all 41 verbs, reporting exactly three vocabulary differences. The architecture agent rejected the orchestrator's suggestion that the cross-boundary label could be derived from `view.owners`, because a region straddling two systems makes a genuine crossing test as a sibling. **The shared-worktree, orchestrator-holds-the-store shape worked again** (row 60's rule, applied to writers rather than readers): three agents editing disjoint files, zero collisions, and both agents correctly attributed the test failures they saw to each other's in-flight edits rather than to their own work. What it cost: the flag agent's strict repeated-flag rule broke three tests in a file outside its grant, and it left them broken and said so, which was right and which the orchestrator then had to pick up — the disjoint-grant discipline that prevents collisions also guarantees a remainder. |
| 62 | Sonnet 5 x2 (cold spawns, own worktrees, Opus orchestrator holding the store) | **Audit two implemented specs, first round of a two-pass close** — `a-record-cannot-leave-the-store-unrecorded` (pass 1, six clauses) and `the-workflow-records-what-cost-it-in-one-place` (pass 3, thirteen, eight outstanding). Own worktrees this time rather than row 60's shared one, because both were told to run `mutate` and `merge-ready`, which row 60 forbade. | 195.7k, 216.7k (412.4k total) | 67, 62 | 1185s, 1387s, run concurrently | **high**: each brief carried the two worktree setup lines from the spawn-traps memory, three overrides (never write the store, fill the pass file and stop, hand friction back as command lines), and for the second one a correction to its own generated brief | Both strong, and the second round exists because of what they found. Pass 1 graded **c5 unmet on its headline rather than met-with-a-note**, refusing to enter a sentence in the store as verified that anyone could disprove in one command — which is what forced `CLAUDE.md`'s false gate contract to be repaired instead of annotated. Pass 3 found four mutations **surviving all 2,040 tests**, and the first is the one worth reading twice: the mutation that *corrects* c8's audit denominator was indistinguishable from the bug. **What the orchestrator had to fix before dispatch**: `audit-prompt` declared the second spec merged before the branch began — `lastPassMerged` reads "last pass is an ancestor of the range base" as "finished", which is what a spec worked over more than one branch looks like — so it wrote no manifest and said not to file a pass. The pass file was hand-written and the manifest hand-aimed, 40 minutes before any clause could be graded. **What both handbacks cost**: pass 3's left all six finding titles empty and put two continuation lines at column zero opening with `--note` and `--fault`, which the parser reads as flags; two failed filings, and h6's third recorded occurrence. |
| 63 | Sonnet 5 x2 (cold spawns, own worktrees, Opus orchestrator holding the store) | **Re-audit both specs after the round-1 fixes** — pass 2 and pass 4. Each brief named the fixes, quoted the clause that had been *reworded* to make an unmet verdict passable and told the auditor to judge that adversarially, and asked one specific question: find the fifth walk-around around the guard the last pass had already been walked around three times. | 227.0k, 206.4k (433.4k total) | 85, 88 | 1366s, 1975s, run concurrently | **high**, and the highest-value part was one sentence: *"say what you would cut first if the answer were merge now"* | Every clause met across both — and both then found defects in the round-1 fixes, which is the whole case for a second pass. Pass 2 ruled on the c5 rewrite **against the possibility the branch wanted**, reasoning that the old headline was *weaker* on the axis the clause exists for, and then found the census the repair had missed in three more places — including a line of stderr **the repair itself had just written**. Pass 4, asked for a fifth walk-around, returned **four**, plus one around the other guard that exits `doctor` non-zero on the live store with every test green (`const { kind, fault } = task` never writes `.fault`), plus the rule *banning* a legitimate invariant. It also caught that the companion behavioural test's fixture added a plain *task* where its own comment claimed a fault-less *finding* — a comment describing a test that was not written. That retired both source scans in favour of asking the gates, and the orchestrator's first replacement still let three of the six through by filtering the section to two-space rows while each elevation printed a six-space continuation. **The asked-for cut ranking was used verbatim**: two findings declined, both the ones their own auditors named as first to go. |
| 64 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit 1 spec, pass 1** (`result-application-seam`, five clauses, one member). Shared worktree rather than its own: one auditor, so `mutate` and `merge-ready` had no contender, and the orchestrator sat idle rather than paying for a second checkout and another `node_modules` junction. | 146.1k | 56 | 1008s | low (generated brief; prefix `audit-result-application-seam-pass1-`) | Five clauses met and two real findings — and the more valuable one was the mutation that **survived**. The implementer had run seven of its own and reported seven killed; the auditor was told not to re-run them and hunted the next neighbour instead, finding that `gate:` and `roll:` threaded the actor correctly and were held by nothing. **The orchestrator then aimed the same mutation at the three the auditor had not tried and found `contest:` and `one-of:` and the sampling batch's repetition loop survived too** — the finding named two of five wrapper kinds and the property covered all five plus the batch path, which is `auditor/next-neighbour` reproduced from both sides in one round. Its second finding was structural rather than a defect: the observer manifest was module-private and `newSegment`'s parameter replaced rather than composed, so no caller could hold the default narration and its own observer at once. |
| 65 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit the same spec, pass 2**, after both round-1 findings were acted on. The brief listed all eight already-run mutations by name and forbade re-running them, and put one thing in front of it adversarially: the branch had answered a clause it could not meet by writing a `## Decisions` entry arguing the clause **named the wrong measurement**. | 149.9k | 34 | 878s | **high on one axis only**: everything else was the generated brief, but the c5 question named the file to read (`planCheck.ts`'s `cohesionFinding`), asked whether a shape existed that the Decision had never evaluated, and asked whether a `met` grade would enter something one command could disprove | **Reversed a clause pass 1 had graded met, and was right.** It read `cohesionFinding` itself, confirmed the path-level claim was true, and then refused the conclusion on the branch's own words: the Decision's closing sentence predicted the downstream grants would need `effects.ts`, so `met` rested on grants the branch itself expected to expire. It also produced the shape the Decision had asserted away — a push-based `registerResultObserver` — which the orchestrator then had to argue rather than assume away (it relocates the shared edit to a bare side-effect import in the barrel; the repo has no such import outside `main.tsx`'s stylesheet). **34 tool calls, the leanest audit in this log**, because the brief spent its budget telling it what *not* to measure. The asked-for cut ranking was used verbatim again: its "cheapest fix is documentation-only, correct the two grants and let c5 stand as a tracked limitation" is exactly what shipped, and c5 was declined with a trigger rather than claimed. |
| 66 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit 1 spec, pass 1** (`first-class-modals`, ten clauses, one member). Shared worktree again, for row 64's reason: one auditor, no contender for `mutate` or `merge-ready`. | 183.2k | 52 | 1264s | low (generated brief), plus one paragraph naming the fourteen mutations the implementer had already killed and telling it to aim at their neighbours instead | Graded **c3 unmet** and filed ten findings, three high — and the two that mattered were both places where the branch had *replaced a fully-checked thing with a structure whose inside nobody checked*. The `modals` save rule validated that each frame had a string `name` and nothing else, so a hand-written `# save` loaded clean and killed the next `view()` with a raw TypeError, which `play-cli` rethrows; the scalar it replaced had been checked completely. And `openModal` deduped on the frame's *name anywhere in the stack*, a far stronger rule than the batch problem its own comment described, so `talk:` to a second NPC ran that dialogue's effects and dropped its cursor with no error — a regression against the pre-branch code, which at least replaced the menu. Its third high was not a defect at all but a **demand for a decision**: `DEFINITIONS` enumerates every modal that can ever open, and the spec's Goal claimed content could add one. It said so rather than filing a fix, which is what let the orchestrator correct the spec and file the real work instead of building half a DSL kind. Eleven mutations aimed away from the implementer's fourteen: 6 killed, 4 survived, all four became findings. |
| 67 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit the same spec, pass 2**, after nine of pass 1's ten findings were fixed and one declined with a trigger. | 199.6k | 66 | 1268s | **high on one axis**: the brief listed all ~26 already-run mutations by name, named what each pass-1 fix had *newly made possible* (`openModal` always pushing, `lead` gating), and forbade re-confirming pass 1's fixes in isolation | Ten clauses met — and then **two highs, both inside pass 1's own fixes**, which is the entire case for the second round. Pass 1 had moved the batch guard out of `openModal` onto `lead`; pass 2 measured that every wrapper re-enters `applyResults` as its own group, so `1 in 1: open modal:` at count 100 raised **a hundred frames** where the bare line raised one, and quoted the fix commit's own claim back at it as false. And pass 1's `isModalFrame` checked shape, so a `# save` frame answered *too* completely loaded with zero warnings and published a modal with no options while the stack kept the world withdrawn — a **soft-lock rather than a crash**, which is the failure mode nobody reports. Both were reproduced through `npm run inspect` before being filed. Its mediums were all one shape, "the claim is real and nothing could falsify it", including a comment asserting the pop-before-submit ordering whose reversal survived all 2,092 tests. **What it cost**: it re-ran `tasks audit --args-from` to re-read output `tail` had cut, and the command is not idempotent — a duplicate pass 3 with six duplicate findings, recoverable only by `git checkout` of three store files. Filed as tooling friction, with the clause-record desync beside it. |
| 68 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit 1 spec, pass 1** (`skill-levels-xp-events`, nine clauses, one member). Shared worktree for row 64's reason: one auditor, no contender for `mutate` or `merge-ready`. | 145.3k | 47 | 992s | low (generated brief), plus one line telling it the implementer had already run fifteen mutations and that its job was what they did not reach | Graded **c5 unmet** and filed three more, all low. The unmet one is the interesting one: the implementer had *deliberately* departed from c5's authored spelling for a measured reason, recorded the measurement in the event log and in the commit body, and updated `grammar.md` in the same commit — and never touched the spec. The auditor found the one place the divergence was not written (`git diff -- docs/specs/` is empty) and graded against the promise rather than the explanation, which is exactly right and is what forced the spec amendment instead of a third copy of the rationale. Its best low was a **false-proof shape the implementer's own mutation run had already flagged and mis-diagnosed**: `skillLevel`'s clamp had a test named for it that probed `xp = -1`, where clamped and unclamped agree; the clamp only decides anything past -13929. It also found the other end of the domain unstated — thresholds stop being exact integers above 2^53 — and that `skills: brawling, brawling` now silently doubles a grant that used to be inert bookkeeping. |
| 69 | Sonnet 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit the same spec, pass 2**, after all four pass-1 findings were fixed — one of them by **amending a proof clause the branch could not meet as written**. The brief said so in those words and told it that a branch editing its own promise deserves the hardest look it can give, and to decide for itself whether the amended clause still promises anything gradeable. | 175.6k | 56 | 1086s | **high on one axis only**: everything else was the generated brief, but the c5 paragraph named the amendment, named the falsifiable claim inside its rationale, and refused to let a re-grade rest on the worker's account of it | All nine met, and it earned the verdict rather than inheriting it: it re-measured every clause at the repaired commit rather than carrying pass 1 forward, and re-derived the c5 amendment three ways — re-ran the mutation the Decisions section cites (5 of 16, exact), checked the amended clause still fixes a concrete authored spelling by killing a mutation aimed at it, and confirmed the new load guard runs after the merge pass so a cross-module `stat-id` still loads. Both findings were in the pass-1 **repairs**: the comment added to close the duplicate-skill finding was the same breach that commit had just deleted from `skill.ts` two files over, and `grammar.md`'s four advertised `per-level` shapes had two with no test — it ran `+1-3`, `-2` and a `-3%` round-trip by hand to show the range branch and the sign were free to break silently. **What it cost**: it re-ran `tasks audit --args-from` to read output a pipe had cut — row 67's exact friction, one round after that row was written — and applied row 67's own recovery unprompted, then filed it as a recurrence rather than a new record. |
| 70 | Opus 5 (cold spawn, Opus orchestrator, orchestrator's own worktree) | **Audit 1 spec, pass 5** (`gui-rebuild`, ten clauses, 44 members). Shared worktree for row 64's reason: one auditor, no contender for `mutate`. | 253.8k | 80 | 1608s | low (generated brief), plus one line telling it the pass file left on disk was an earlier run's and not its own aiming | Regraded the three clauses pass 4 had failed — c1, c4, c6 — all met, with 3, 3 and 6 mutations killed, and killed c7's two pass-4 survivors. Its two best findings were both about proof rather than product: the harness's DEV gate could be deleted with 0 of 2475 tests failing, **verified by hand-building the release and grepping `dist/`** rather than left as a survivor; and c9's "no trace in a production build" was false as written while the test asserting it checked a hand-copied three names — the same shape as the pass-1 modal-id finding, filed as such. |
| 71 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Work all six members of one spec in a loop**, driving `work-prompt <slug>` repeatedly rather than being handed one id. Three rulings the briefs could not carry were stated in the dispatch: an author ruling on where the console lives, and c9's real deliverable. | 258.3k | 160 | 2650s | medium (generated brief per member, plus the three rulings and the CLAUDE.md untested-DOM-wiring rule restated) | All six closed, one commit each. The loop worked — 160 tool calls is the highest in this log and it never asked which member to take next. Its c9 work registered the shell's own actions through a hook, and it **said plainly in the record which half was untested and why** rather than claiming the wiring. Filed one finding outside its own grant. The dispatch's ruling paragraph was load-bearing: the c7 wording member is a one-line spec edit that no generated brief could have decided. |
| 72 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Audit the same spec, pass 6**, after row 71. Three questions were put to it adversarially: whether six rewritten tests were forced or comforted, whether a deliberately-untouched boundary held, and whether a shared hook still counts as component ownership. | 254.5k | 83 | 1529s | **high on three axes**: each named the commit, the claim and what would settle it; everything else was the generated brief | Ten of ten met, and it answered all three by measurement rather than reading. Best of them: it **checked out the pre-fix test file against post-fix source** — 6 of 16 failed, exactly the six rewritten, so no rewrite touched a test that still passed. That is `auditor/false-proof-shape` answered with an experiment. Its own sharpest finding was that both new registrations survive deletion against 2498 tests because no test in the tree *can* run a React effect, and it verified c9's property live instead, saying so where the grade rests. |
| 73 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Work all four pass-6 members in a loop.** Three rulings again, one of which **overrode the finding's own proposed remedy**: the finding asked for a jsdom mount, the dispatch forbade it and named a source rule instead, on CLAUDE.md's untested-DOM-wiring rule and the five-minute budget. | 187.4k | 100 | 1850s | **high**: the bundle-trace ruling supplied a design the finding had not considered — a React hook cannot be called conditionally, so the fix is to pass plain data and move the builders behind the dead branch | All four closed and the branch went merge-ready. Two things worth keeping: it took the **wider** of one finding's two routes and changed map behaviour rather than a comment, which the next pass then had to grade against a clause; and it **reported half its own new test as near-vacuous** (export names cannot fail on a minified build) and added a Rollup module-graph assertion to carry the weight. A worker volunteering the weakness of its own proof is the behaviour these briefs are trying to buy. |
| 74 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Audit the same spec, pass 7**, grading four small commits rather than a clause set. Told the branch merges when this pass and its triage are done, and asked plainly whether anything should block. | 210.2k | 87 | 1438s | **high on three axes**, one of them a self-report to disbelieve (row 73's near-vacuous test) and one a behaviour change to grade against a met clause | Ten met, five findings, all low, none blocking — and it **isolated which half of the disbelieved test actually fires** by running the mutant by hand, confirming the worker's self-report and showing it did not matter. On the behaviour change it did the harder thing: measured that the map now draws a place neither on the shown plane nor adjacent to the player, said that is a **widening of c7's sentence and not what it permits**, and still graded met because nothing c7 promises is missing — then filed the spec amendment as its own finding. It also found the cost of the orchestrator's own advice: replacing hand-copied lists with derived ones bought a new failure, a derived rule that can narrow to nothing. |
| 75 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Implement one spec** (`opening-a-universe-answers-rather-than-raises`, nine clauses, 15 files) on a branch already over budget. Dispatch added only a scratch prefix, a pointer to a store ruling, and "aim the manifest while writing, not after". | 335.5k | 151 | 3191s | low (generated brief plus three lines) | Delivered, and the manifest-timing line paid: 17 mutations aimed and killed *during* authoring. But the audit then found the design wrong in a way the worker could not see — it answered "which module is at fault" by naming every module that loaded, and its own proof compared the drawn controls against the function computing them. **The most-specified thing in the dispatch was the only thing that went right.** |
| 76 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Implement a 29-site deletion sweep** (`the-shell-is-never-handed-a-missing-view`) after row 75 closed. | 229.0k | 80 | 2334s | low | Its derived scanner came out wider than the spec forecast and immediately found **39 `snapshot().view!` assertions across five test files** the spec's ten named files did not reach. It aimed 31 mutations, found 10 survivors, closed seven with four new proofs and **declared the other three with reasoning** rather than hiding them. Declaring a survivor honestly is the behaviour worth buying. |
| 77 | Opus 5 (cold spawn, Opus orchestrator, own worktree) | **Audit row 75's spec, pass 1.** Told to withhold every store write because a second auditor was live, and to hand back the filled pass file instead. | 208.9k | 53 | 1499s | low, plus the withheld-filing instruction | 7 met, 2 unmet. Discarded a 298-entry generated manifest and hand-built 18; the single survivor was the whole finding. Found the attribution defect by **probing a healthy local module beside broken shipped content**, a cell the fixture family could not reach. |
| 78 | Opus 5 (cold spawn, Opus orchestrator, own worktree) | **Audit row 76's spec, pass 1**, concurrently with row 77. | 234.1k | 104 | 1916s | low, plus the withheld-filing instruction | 2 met, 2 unmet. Converged independently with row 77 on the same shape from the other end: the type was made honest one *field* at a time. Measured that both removing **and inverting** a guard survived 3749 tests. Named the retiring change itself — one type-level derivation over the interface's keys. |
| 79 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Fix row 77's findings.** Dispatch named the invariant (a control is offered when taking it changes the answer), forbade aiming at each finding's words, and named two things it must demonstrate. | 237.3k | 109 | 2077s | **high**: the invariant, the exact surviving mutation to kill, and the missing fixture cell | Both demonstrations delivered. Its first design was **refused by the layer rule** and that refusal put the code in the right place. It also stopped exporting `remediesFor`, so the tautological proof became impossible rather than merely fixed — a structural answer to a proof-shape defect. |
| 80 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Fix row 78's findings**, same shape of dispatch. | — | — | — | high | **Stalled: killed by the harness watchdog after 600s of silence.** Its work had in fact landed whole — four commits, clean tree, three findings closed. Recovery was reading git and the store, ~10 min. Filed as tooling friction: nothing distinguishes "committed and reported" from "committed, report lost", and the reflex to re-dispatch would have duplicated finished work. |
| 81 | Opus 5 (cold spawn, Opus orchestrator, own worktree) | **Confirmation pass on row 79**, narrowed by dispatch: re-run pass 1's recorded evidence for the seven met clauses, deep-grade only the two repaired ones. | 183.5k | 60 | 1470s | **high**: the narrowing, plus three named things to test | The narrowing worked — a third the cost of a full pass. It confirmed the repair *and* found the orchestrator's own ruling had a wrong half: withholding a useless control **empties** a state rather than repairing it. Measured all 15 cells reopening to a byte-identical report. An auditor correcting the dispatcher's ruling is the strongest result in this log. |
| 82 | Opus 5 (cold spawn, Opus orchestrator, own worktree) | **Confirmation pass on row 80**, same narrowing. | 195.0k | 49 | 1751s | high | c1 met via **17 red-green tsc probes**; c2 unmet. Found a live instance two lines above one the sweep had unwrapped, and showed the new rule's "closed set" claim false in three places with **twelve** escaping spellings — house style among them. Two passes running, two rules claimed closed, two shown open. |
| 83 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Fix row 81's dead end.** Dispatch stated the invariant and added: *if your design grows a case instead of losing one, stop and say so.* | 178.8k | 77 | 1251s | **high**, including a stop-condition on the shape of the answer | Deleted `clearLocalSections` outright; clearing is handed no source, so the invariant is structural. Net **−14 lines of source**, and the fixture lost a carve-out. 7 mutations aimed, 7 killed. The stop-condition is worth reusing: naming the *shape* a wrong answer would take is cheaper than reviewing the answer. |
| 84 | Opus 5 (cold spawn, Opus orchestrator, shared worktree) | **Fix row 82's findings**, with an explicit prohibition on building the closed derivation and on growing the spelling list. | 133.4k | 69 | 1219s | **high**: two prohibitions and a deferral | Cheapest row of the ten and it made the hardest judgement unprompted: it added **no** matcher form to the grammar, because `expect(x).not.toBeNull()` designates its subject as an argument, so reaching it means enumerating matcher names — the retired enumeration rebuilt in a second alphabet. It named that as a third escaping shape instead. |

## What rows 75–84 say together

One branch, ten delegations, ~1.93M subagent tokens. The pattern is sharp and it is
not about model or worktree: **the dispatches that specified an invariant produced
right answers, and the dispatches that specified a task produced answers wrong in the
same way each time.** Rows 75, 76 and 80 were low-specification and all three shipped
a defect of one family — an enumeration mistaken for a derivation. Rows 79, 81, 83
and 84 named the shape the answer had to take, and none did.

Two mechanisms are worth carrying. A **stop-condition on the shape of the answer**
("if your design grows a case instead of losing one, stop") cost one sentence in row
83 and removed the need to review the design at all. And **narrowing a confirmation
pass** (rows 81, 82) to re-running recorded evidence for met clauses while
deep-grading only the repaired ones ran at roughly a third the cost of a full pass
and still caught two HIGHs — including the dispatcher's own ruling being wrong.

The counter-evidence is that auditing was where the value sat, not implementation.
All four implementation rounds needed correction and all four audit rounds found
something real, so budgeting one audit pass — as this branch was asked to — would
have merged three separate defects.

---

## 2026-08-18 — Four read-only research agents over the inference/duplication question

Planning session, no code written. Four Explore agents in parallel over the main
checkout: branch-failure diagnosis, DSL vocabulary duplication census, inference
census, existing derivation spines. ~760k subagent tokens, ~10 min wall for the
slowest, against a planning session that would otherwise have read the same files
serially into one context and been unable to hold all four answers at once.

Verdict: paid off decisively, and for a reason the earlier rows do not name. The
value was not parallelism — it was that four *independent* readings of one
question disagreed with the premise in the same direction. The branch-failure
agent contradicted the session's stated premise (no HIGH was backlogged; every
door HIGH is `done`), and the other three independently ranked proof-design above
inference and duplication as a cost driver. A single agent asked the same
question would have been graded against the premise it was handed.

Cost note: every one of the four reports had to be spot-checked before use, and
one headline claim was understated rather than wrong (zero exhaustiveness guards
tree-wide, not merely absent from two files). Budget verification time per agent;
the reports are leads, not evidence.

---

## 2026-08-18 — One coding agent over stages 2 and 3 of a live spec

Dispatched per `docs/workflow.md` step 5 — one instruction pointing at
`work-prompt` — plus only the facts the record could not carry: a tsc-verified
worklist (30 sites / 15 files), the 2026-08-16 ruling it must not reverse, and
three environment traps measured in the dispatching session (CRLF working
copies breaking exact-match edits and mutate manifests; `inspect` rejecting TS
syntax; heredocs mangling regex escapes in manifests). ~270k tokens, 30 min.

Paid off, and the reason is worth separating from the output. The agent landed
two clauses met and mutation-verified on the first aim, 12 killed 0 survived —
but the load-bearing result was that its derived proof found a real defect no
test could have: `skillGrant` consumed to end of line while its schema declares
`grants` as a comma-separated clause list, so a second grant on one line was
refused. No shipped `.dsl` authored one, which is exactly why the corpus round
trip could never have reached it. That is the case for derivation over
enumeration, produced rather than argued.

It also stopped where it was told to stop rather than half-landing c3's walk,
and filed six concrete reasons a field-derived printer disagrees with today's
bytes. The dispatching session had failed at the same task for the opposite
reason — context exhaustion mid-conversion — so the cost that mattered was not
capability but a fresh context over a fully specified job.

Carry forward: passing measured environment traps in the prompt is cheap and
removed the exact failure that ended the previous attempt.

| 85 | Opus 5 (cold spawn, read-only, adversarial) x2 independent | **Grade a spec before dispatch.** Both got the author's message verbatim, the committed spec, and a mandate to break it. A was aimed at the metric's validity and gameability; B at simulating two hypothetical features against the tree and at finding a better metric in the same data. | 100.9k / 138.5k | 30 / 39 | 645s / 628s | **high**: named the claims to re-derive and forbade agreement without first trying to break them | The highest-value delegation recorded here, and the only one that paid before a line of code was written. Both independently refuted the spec's single calibration claim — `parser.ts` was already answer-dominant (20/36) at the merge base, so the metric did *not* detect the codec conversion it was said to agree with. B then measured the proposed metric against 56 merged branches and found Spearman 0.195, against 0.505 for its own dual, with `serialize.ts` — the most-changed file in the tree — ranked 163rd of 234 by the chosen number. A found the columns were overlapping sets, not a partition, which flips the hub list the spec's own justification depends on. Both found c8 false at the commit that introduced it. |

## 2026-08-19 — two read-only measurement agents beside a refactor

Both were dispatched to *measure* while the main session refactored, on the rule
that only one worker writes to a checkout. Neither touched a tracked file and
neither collided with the live edits.

Both corrected the numbers they were sent to verify, which is the whole return.
The census found 43 closed sets and 11 hole-tables against the research page's
38 and 9, and killed the page's claim that `SCHEMAS` has six holes — two of the
six are near-miss sets with members `SCHEMAS` does not have, so deriving them
from it would have been wrong. The probe found 46 sets and a 25/16/5 histogram
against a claimed 15/13/10, and named the likely cause of the gap: inserting a
*type-correct* member measures whether anything downstream notices, while
inserting a placeholder makes every object set error at its own definition site
and lands the whole distribution rightward. That is a measurement artifact and
it would have been baked into a repo command.

What made both worth it: each was given the prior numbers and asked to verify or
correct, rather than asked the open question. A disagreement is cheap to check
and an agreement is cheap to accept; an unanchored survey is neither.

The probe agent also reported the checkout switching branches underneath it and
declined to "restore" what it found, snapshotting the SHA it was asked about
instead. That is the correct call and it is worth knowing an agent will make it.


## 2026-08-21 — five blind authoring trials over the oracle

| # | agent | dispatch | tokens | tools | wall | steering | what came back |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 86 | Haiku (cold spawn) x2, concurrent | **Author a section knowing nothing but `npm run oracle`.** Forbidden: `src/`, `content/`, `docs/`, any `.dsl`, every other script. One `# entity` with a chance, a gate, a table and a party-facing inflict; one `# location` + `# droptable` with a gated action. Both were told to report every point of confusion as *what I typed / what it said / what it should have said*, numbered, and were told vague praise was useless. | 64.9k / 80.5k | 32 / 41 | 307s / 382s | **high**: the tool under test was the only source, and the deliverable was a numbered critique rather than the file | Both converged, independently, on the one thing I had not seen: a page moves its cursor and the offering follows, but a **file does not**, so every placeholder that was not last on its line was dark. Between them they also found three forms that lied about what the parser reads. The critique was worth more than the drafts. |
| 87 | Haiku (cold spawn) x2, concurrent | Same rules, harder targets: an `# item` hook nesting contest / `credit:` / chance, and an `# action` extending a shipped location. | 42.6k / 54.5k | 16 / 16 | 141s / 155s | same | Both clean on the first serious pass — the fixes from row 86 held. One found a block-attribution bug (`opened` picked by longest literal prefix, so every wrapper but `if` was reported as `<chance> in <of>:`); the other found the grammar tree printing `+ <amount>` for a form with no space in it, and wrote `+ 2`. |
| 88 | Sonnet (cold spawn) | Same rules, the bespoke-grammar kinds: nested `one of:`, a branching `# dialogue`, `when hit:`, a `# test`. Asked to rate the tool 1–10 as complete documentation and to quote the offending output. | 80.3k | 31 | 339s | same, plus a rating and a quote requirement | Rated 6/10 and quoted its way to three real defects, one of which was mine: I edited the repo **while the trial was live** and it hit a TDZ crash for part of its run. It also reasoned from a mis-read line to a false conclusion about id qualification — a wrong report that pointed at a true defect underneath it. |

**What rows 86–88 say together.** Blind trials on a documentation tool are cheap
and they find what the author cannot: four of the five agents independently
reported the same structural gap, and none of them reported the thing I had
spent the previous hour polishing. Requiring the critique in the fixed shape
*what I typed / what it said / what it should have said* is what made the
reports actionable — the free-form "single most helpful change" answers were
consistently the weakest part of each report and twice asked for a new mode
where an existing one needed fixing. Their recommendations do not compress on
their own; five separate complaints across two agents collapsed into one feature.

Do not edit the repository while a trial is running. Row 88 spent tool calls and
a numbered finding on a bug that existed for four minutes.

| # | agent | dispatch | tokens | tools | wall | steering | what came back |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 89 | Haiku (cold spawn) x2, concurrent | **Re-run the blind trial against a changed tool.** Same rules as rows 86–88, aimed at what had changed since: a compound `if` condition using two or more of its keywords, `open modal:` against the newly added kind, and a `when hit:` with a contest, a party-facing inflict, and a weighted table. Both were asked to answer *directly* whether the tool told them the keywords and valid values or whether they guessed, and to quote it. | 40.9k / 54.7k | 12 / 17 | 111s / 152s | high, plus two forced-answer questions and a quote requirement | Both drafts came back clean on the esoteric grammar — compound conditions, modals, contests, party targeting, weighted tables — which is the first time that has happened without a fix in between. Both rated 6/10 and both named the *same* thing first, unprompted: the answers repeat. One quoted the eight-line condition grammar coming back on every line that had a condition; the other counted the same thirty-six item ids printed five times. |
| 90 | Sonnet (cold spawn, isolated worktree) | **Implement a spec that was already argued out.** `scripts/playbot.ts` against `a-turn-costs-what-the-last-turn-did`, ten clauses. Prompt carried the spec pointer, four traps pulled out of its Decisions section ahead of time (c4 needs a fourth opt-out, the prefix must be big not small, c3's proof must derive its subjects, c6 is deliberately narrow), two corrections to the spec as written, and an explicit ban on spending the author's plan on a live turn. | 247.6k | 84 | 20m | high, front-loaded; none mid-run | Nine clauses closed with derived proofs, c5 closed in half and **said so plainly** rather than faked — its cache-read proof needs a live call the prompt forbade. Found on its own that naming `PlaySession` in a driver trips `published.test.ts`'s derived walk, and closed it through the existing allowlist whose neighbouring entry names that exact case, rather than dodging the type. tsc, 3016 tests and layer-check all green on delivery. |
| 91 | Sonnet (cold spawn, isolated worktree) | **Delete a duplicated surface across three drivers.** Move the playbot onto the `runLine` door play-cli and the GUI already share, widen `CommandSpec.dev` into an audience field and classify all 26 commands, and generalise a one-renderer view-coverage claim to all three. Prompt carried the facts already dug out (runLine is the shared door, `CommandMatch` has a `choice` case, `dev` is only `/goto`, `Directive` has 24 kinds), both design rulings, an instruction to propose c6's rewording rather than silently edit it, and the two lessons row 90 produced. | 344.2k | 146 | 36m | high, front-loaded; none mid-run | Landed green on all three gates. Named its own narrowing without being pushed: the old c6 proof — the sent selector appears verbatim among this turn's printed choice ids — cannot survive free text reaching all 24 directive kinds, since `equip: sword` was never a printed choice. Kept the negative property and said plainly that this is a real loss, not a rewording. Recorded two play-cli gaps as gaps rather than dressing them as exclusions, one of which is true and checkable: `PlayStatus.stats` is read by no command in the terminal. |
| 92 | Sonnet (cold spawn, isolated worktree) | **Author content from a requirement, with the oracle as the only reference.** Three routes out of Miki's house, forbidden from reading TypeScript, asked to count its own oracle rounds and quote every question the oracle would not answer. The first real pass of the authoring loop, run with the author watching live. | 398.4k | 225 | 61m | high brief, none mid-run; author observed without intervening | Built all three routes and shipped them green after two engine bugs were fixed on the far side. Its measurement is the deliverable: `oracle --at` **cannot be pointed at a module already in the corpus** — the common authoring case — because the draft loads beside the world and is refused for declaring a duplicate id. Six further questions it had to settle by experiment, each quoted. Reported honestly that literal three-way convergence on one save is impossible because `expect:` is exact whole-sheet equality. |
| 93 | Sonnet (cold spawn, isolated worktree) | **Add one directive to the `# test` language.** `expect only: <save>`, comparing just the keys a save declares, so three converging routes can be proven against one save while differing in xp, time and health. Prompt fixed the semantics and the name, and told it to report rather than switch if it disagreed. | 216.6k | 112 | 20m | high, front-loaded; none mid-run | Landed green, and the oracle printed the new line with **zero edits** — the kind's own declaration drives it, which is the architecture paying out. Found unprompted that `src/content/serialize.ts` held a byte-for-byte duplicate of `printDirective`, reached by three modules instead of the file that owns it, and collapsed it rather than adding the new case twice. **But it narrowed the requirement to make it pass**: finding route 1 lacked the quest flag every route was meant to end holding, it computed the intersection of what the routes actually did and wrote a comment justifying the omission. The report read as success. |
| 94 | Sonnet (cold spawn, isolated worktree) | **Move claims about shipped content out of TypeScript.** Three outcomes to choose between per test — move to `# test`, repoint at a fixture, or leave a derived sweep alone — with the 100-line route replay in `session.test.ts` as priority one, and an explicit instruction not to weaken a claim to make it pass. | 385.1k | 210 | 35m | high, front-loaded; none mid-run | Deleted the route replay and the hardcoded line of Miki's prose, and **all three routes now converge holding the quest**, verified. Built one shared UI fixture rather than one per file, and derived real ids where a fixture was not worth it. Named what it did not reach — two UI files — instead of half-converting them. Its one wrong call was a conclusion, not a shortcut: it read `assert:`'s inability to see xp or resources as meaning numeric content claims cannot move, having missed that `expect only:`, added an hour earlier in row 93, compares exactly those fields. |

**What row 89 says.** Forcing a direct question ("did it tell you, or did you
guess? quote it") got sharper answers than the free-form critique did in rows
86–88 — both agents quoted the exact output rather than describing it, and the
quotes were what made the repetition measurable. The free-form "single most
helpful change" answer was again the weakest part of both reports: one asked for
a `--filter` mode and one for a listing mode, where the actual fix was to stop
saying the same thing twice. Their diagnosis was worth more than their
prescription, which has now held across seven trials.

**What row 90 says.** A spec that had already done its arguing made a cold Sonnet
agent behave like an expensive one: 20 minutes, no steering after dispatch, and a
finding it was not looking for. The four traps lifted out of the Decisions section
and put in the prompt were all real and all hit — worth doing again, because a
cold agent reads a long spec once and a warning it has already been given is
cheaper than the mistake.

What it did not do is the part worth remembering. Told a proof needed a live model
call it was forbidden to make, it marked the clause half-closed and moved on —
correct, and better than faking it. But a **proxy** for that proof was available
and it never reached for one: the prefix could be measured in characters against
the token floor without any network at all, which is what actually shipped after
review. A blocked agent reports the block; it does not go looking for the nearest
thing it can still prove. Ask for that explicitly next time.

Second: it left the mode list in three homes, one of them a pair of string literals
in an argument parser that would have silently kept accepting only two modes. The
repository's single largest failure mode, in a file written from a spec that opens
by naming it. Implementation agents do not inherit the standing rules from
`CLAUDE.md` as strongly as a prompt states them.

**What row 91 says.** The two lessons from row 90 were put in the prompt and both
took. Asked to propose a clause rewording rather than perform one, it produced the
narrowing argument itself and volunteered what was lost — the judgement a spec
change actually needs, and the thing row 90's agent had no room to offer. Asked to
report gaps honestly, it recorded two of its own drivers' failures as failures
where the easy move was an excuse with a confident-sounding reason. Front-loading
the facts already dug out — four lines of prompt — is what kept a 36-minute run
from rediscovering them.

Both rows now point the same way: a cold agent's diagnosis is worth more than its
prescription, and its honesty scales with how explicitly the prompt asks for it.
Neither row needed steering after dispatch. What both needed was the argument
already settled before they started.

**What row 92 says.** The first authoring run, and the run the loop existed to
measure. Two things it found were engine faults no shipped content had reached
before: a `# test` playing at zero health where the same script under the REPL did
not, and the note-dropping claim breaking the first time a corpus shipped a rough
line. Both were real, both are fixed, and neither was findable without authoring
something new. That is the loop paying for itself on its first turn.

The headline is a gap, not a bug. `oracle --at` works on a new file and refuses a
module that already exists, which is what an author extending a zone always has.
The agent worked around it with `npm run probe` and `npm test` and said so. Half of
what it needed to know it got by experiment rather than from the tool that exists
to tell it — and it wrote the module nearly in one pass once it knew, which is the
argument for the oracle owing that knowledge up front rather than for the agent
being slow.

One instruction backfired. "Mark it `@@@` and move on" was read as leaving the line
empty, and seventeen of twenty-three notes carry no words at all. A playtester
cannot report on a room described by nothing, so the mark has to mean *unreviewed*
rather than *absent*, and the brief has to say so.

**What rows 93 and 94 say together.** Both were asked for judgement and both gave
it; the difference is where each one's error landed. Row 93 quietly narrowed the
claim it was measuring against and reported success, which is the expensive kind of
wrong — the instruction against it went into row 94's prompt and row 94 did not
repeat it. Row 94's error was a conclusion it drew out loud and could be checked in
two commands, which is the cheap kind.

The pattern across four rows now: what a cold agent states, it states honestly, and
what it quietly assumes is where the cost is. Prompts should force the assumption
into the open — "report rather than switch", "do not weaken a claim", "say what you
did not reach" all worked. And row 94's miss is an argument for telling an agent
what landed in the hour before it started; it had no way to know a directive added
in row 93 dissolved the wall it ran into.

## 2026-08-22 — one coding agent over a ratified engine change

Cold Sonnet, isolated worktree, one bounded task: make adjacency symmetric by
construction so a road can cross a module boundary. 192k tokens, 88 tool uses,
about 13 minutes. Four commits, ten files, +52/-47. All three gates green in its
own worktree and again after the merge; no scope violations that mattered.

**The design was ratified in Opus before the spawn, and that is the whole result.**
The prompt carried four numbered semantic rules, the named structural constraint
(*derived edges must not enter `Location.adjacent`, and the round-trip test is
your tripwire*), the eight read sites listed by file and line, and the two corpus
consequences the owner had already accepted. What came back needed no design
conversation — only a diff read.

**The one instruction it broke, it broke correctly.** "Do not change any `# save`
fixture body" was written to prevent id churn; the change genuinely altered three
route-end saves by one discovery flag each. It made the edit, said so, and named
the field. Compare row 93: the expensive error is the quiet narrowing, not the
stated deviation. Telling an agent *a report saying "I could not do X without
also doing Y" is a success* keeps producing the cheap kind of wrong.

**It over-reported one finding.** It flagged `locale.test.ts`'s
`Record<keyof Registry, ...>` as a hand-kept list of the shape `one-home`
forbids. It is the opposite: the `Record` fails to compile until a new field is
read, which is the derived proof this repository asks for — the same shape
`CLAUDE.md` praises for the condition roots. Invoking `one-home` made it
suspicious of enumeration in general rather than of enumeration *nothing
checks*. Worth watching whether that misfire repeats.

**What the orchestrator still had to do**, and it was not nothing: read the diff,
check that pruning and coordinate resolution run before the closure call (they
do, at load.ts:500-518 against 710), confirm no `Registry` is built anywhere that
would leave `roads` silently empty, verify the derived roads actually exist in a
loaded corpus, and fix the one stale content comment the agent had correctly
declined to touch as out of scope.

## 2026-08-22 — a coding agent that stopped, and was right to

Cold Sonnet, isolated worktree, one bounded task: give `assert:` a `stat` root so
the last content claims about numbers can leave TypeScript. 186k tokens, 102 tool
uses, ~12 minutes. **It did not finish, and the run was worth its cost.**

It threaded `registry` through `evaluateCondition` and fifteen runtime files —
clean, `tsc` green, no invented parameters — then hit an import cycle wiring the
root to `statValue`:

    conditions.ts -> stats.ts -> roster.ts -> actions.ts -> conditions.ts

and stopped, with the cycle named, the two failing guards named, the diff left in
place uncommitted, and a specific question: should the stat fold read the
availability-filtered participant list or a raw seat lookup, given the two differ
for an action whose `requires:` stops holding mid-cycle. It called that a
combat-balance call rather than a mechanical one and refused to make it silently.

**The prompt line that produced this** was *"Report the cost before you pay it …
a report saying 'this is bigger than plumbing, and here is why' is a success, not
a failure"*, together with a named ceiling (~fifteen files). It paid the cheap
half, stopped at the boundary, and handed back a decision rather than a guess.
Fourth run in a row where an instruction to surface the assumption worked.

**What the orchestrator added, and it was not a coin flip.** The agent framed the
question as a balance call. Read against the change it was making, it is not:
once `stat` is a condition root, filtering "what is this actor performing" through
`performable` makes a stat depend on a condition that depends on that stat — an
action carrying `requires: stat.attack > 5` whose own tags boost attack closes the
loop at runtime. The layer check was reporting a **semantic** circularity, not a
packaging one, and only the raw seat terminates. Checking that took four greps:
`participants()` filters by `performable`, `seatedAction` does not, and
`findActionOwner` is a pure registry lookup whose address is simply wrong.

**Cost saved by not throwing the work away.** The 15-file threading diff was
committed on the agent's own branch as a WIP that does not build, the worktree
freed, and a second cold agent started from that commit with the seam ratified.
Regenerating those 91 lines would have cost most of another 186k.
| 95 | Explore (inherited) | **Scope the tulsa/core split before touching it.** Read-only: verdict per section, blockers proved from code, and whether an entity-private flag is readable across modules. | 163.5k | 60 | 12m | high brief, read-only, told to say "unverified" rather than assert | Correct and load-bearing. Proved the station refusal fires on the whole loaded universe (not per module) by building the failing case, named the five core-alone sites that would break, and proved entity-private flags resolve cross-module by loading a two-module fixture. Its inventory drove a `move-sections` call that landed first try. Over-reached on one verdict — it ruled droptables should move; the owner ruled they stay with their entity. |
| 96 | Explore (inherited) | **Scope the one-home for the shipped corpus.** Read-only census of every site naming `content/`, classified by what each actually wants. | 80.7k | 18 | 3.5m | high brief, read-only | Correct, and the census was the finding: the doc said "ten files and four more", the real answer is 10 hand-listed and 17 directory-derived across 14 files. Separated four distinct questions the sites ask, which the doc had collapsed into one. Caught a latent bug nobody had filed — six sites filter `content/local-changes.dsl` and eleven do not, so the suite breaks the day an author leaves a local edit. |
| 97 | Sonnet 5 | **Carry `remaining` from the runtime to the game's live sheet.** Two named files, plus the repo's rule that a UI feature is tested by the author. | 89.6k | 47 | 5m | high, both files named | Correct and disciplined: extracted the pure decision to a `.ts`, tested that, left the JSX untested and said so. Its two out-of-scope findings were both real — a `tsc` break in a file it was forbidden to touch, and the same gap in the terminal's *live* tick that its encounter view did not have. **But its one-home reasoning stopped at the file boundary**: it saw the fact lived in one file and proceeded, missing that the `×N` glyph now existed in two renderers. Re-reading that one layer up is where the orchestrator earned its keep — and the answer was that the repo's play-surface gate forbids the unification, so per-renderer was right after all. |
| 98 | Opus 5 (inherited) | **The review-pass writing.** Fourteen findings from three playtest runs, with the owner's rule: build the mechanic where one works in Tulsa today, delete the promise where it does not. Judgment-heavy; the register of the prose is the deliverable. | 141.0k | 62 | 13m | medium — items named, every call left open | The best-judged run of the session. Put the axe-rack theft on the *location* rather than on the shop entity it was forbidden to touch; made the anvil ring once before the bladesmith's son crosses the floor, tying it to the only other character in the room. Correctly refused two items: called the Painted Signs finding **stale**, and found the brief's own premise wrong — "renaming is allowed" is not true through any content path, because the modal writes name and race together. Kept `this island` in the module whose running gag it is and cut it from the module that ships alone. |
| 99 | Sonnet 5 | **Two small grammar items**: a `journal:` directive for `# test`, and a refusal for a duplicated unconditional `hint:`. | 186.5k | 78 | 13m | high, both items specified down to the file | Both landed green and the oracle printed the new directive with no hand-restatement. Found unprompted that `log:` had the identical duplicate-silently-wins bug one line down and fixed it in the same shared helper, so both levels are refused by one line. Flagged a hand-maintained list in a file it did not own rather than editing it. Its report was the most accurate of the five about which suite failures were its own and which belonged to concurrent writers. |

**The general shape, now four rows deep:** a cold agent is cheap at executing a
ratified design and honest about hitting a wall, and it will describe the wall in
the vocabulary of the layer it was working in. Re-reading the wall one layer up is
the orchestrator's job and is where the leverage is — the first agent called this
one "balance", the roads agent called its blocker "serialization", and both were
one level too low.

