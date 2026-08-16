# a-turn-costs-what-the-last-turn-did

## Deliverable

A standalone loop at `scripts/playbot.ts` holds one live session and calls the model once per turn, so
that the thousandth turn costs what the first one did. It runs through the Claude Agent SDK, which is
what puts it on the author's Claude plan rather than on a separately-billed API key. This is the shape
`exploratory-playbot` has recorded since 2026-07-29 and never had: a standalone loop holding a live
session, calling the model each turn to play and report. What it adds is the reason the shape matters.
A Claude Code subagent playing the same game carries its whole transcript as memory, so its per-turn
cost grows without bound — measured 2026-08-15 at ~44k tokens per turn over two turns of tutorial
island, which is both unaffordable and unable to reach a long session at any price. A loop owns its own
prompt: a frozen system prefix, a bounded journal window, and the current view. Measured on the loop's
own prompt assembly the same day, a 200-turn run's largest request exceeded a 50-turn run's by 12
bytes, all of it the turn number gaining digits.

The loop is the authoring rig and the bug-hunter, and those are one loop with two prompts — ruled by
the author 2026-08-15 and recorded as a decision against this spec.

Proof:

- [c1] **One loop, two prompts.** Exploring a half-built world and hunting bugs in a finished one are
  the same turn — show a view, answer it, report what could not be done — and differ only in
  the text of the system prompt. Below the point where a prompt is selected there is no branch on
  which prompt was chosen: no mode field threaded into the turn, no conditional in the request
  builder, the log writer or the session driver. The proof runs one turn under each prompt and asserts
  the two request bodies differ in the system block and nowhere else.
  proof: vitest scripts/playbot.test.ts
- [c2] **The model is a seam, and the suite never reaches the network.** The loop takes its model
  client as a parameter; every test drives it with a fake that returns canned replies, and no test in
  the repository makes an HTTP request to any model endpoint. This is the rule that keeps `npm test`
  inside its five minutes, and it is what makes c1 and c3–c9 checkable at all — each is a property of
  the loop's decisions, which are pure once the effect is passed in as data.
  proof: vitest scripts/playbot.test.ts
  proof: command grep -rn "api.anthropic.com\|ANTHROPIC_API_KEY" scripts src --include=*.ts
- [c3] **Billed input does not grow with turn count.** The journal handed to the model is a bounded
  window over the run log, never the run log itself, so a turn's prompt is the frozen system text plus
  that window plus one view. The proof derives its own subjects: it assembles the request at turn N and
  at turn 4N for several N and asserts the size difference stays within the window's own bound rather
  than scaling with N. An enumerated proof at two hand-picked turn counts is the failure this clause
  is written to avoid — the property is about every N.
  proof: vitest scripts/playbot.test.ts
- [c4] **A turn carries the loop's own prompt and nothing the harness would add to it.** The agent runs
  with this branch's system prompt in place of the harness's rather than appended to it, with no
  built-in tools, with no automatic load of any `.claude/` directory — not this repository's
  `CLAUDE.md`, not its skills, commands or agents, and not the user-level ones — and from a working
  directory outside this repository. That last one is not implied by the others and is the opt-out this
  clause originally missed: measured 2026-08-15, a turn with settings and tools both off still named
  this project, its path, `CLAUDE.md`, and a convention held nowhere but the author's user-level
  memory, because the working directory, git status and auto-memory ride a section that a custom
  string system prompt does not remove and the SDK's own switch for stripping it is documented not to
  apply to one. An empty directory removes all of it and takes the floor from 932 tokens to 296, so the
  proof derives its subject rather than listing it: the resolved working directory of a turn does not
  lie under the repository root. This is the floor that
  makes c3's flatness worth having: a turn that inherits the coding harness's system prompt, its tool
  schemas and this repository's own instructions is tens of thousands of tokens before the game is
  described, which is exactly the measured cost of the subagent this loop replaces. It is also a
  correctness rule and not only a cost one — a player briefed on how to file audit findings and stage
  DSL sections is not a player, and everything it knows about this project is a thing it cannot
  discover in the world.
  proof: vitest scripts/playbot.test.ts
- [c5] **The system prefix is frozen, and nothing volatile precedes the breakpoint.** The system block
  is byte-identical across every turn of a run and carries the cache breakpoint; the journal window
  and the view are assembled after it. No clock reading, turn counter, session id, or remaining-budget
  figure appears in it — each would move the prefix and silently drop every turn to full price, and
  the budget figure additionally reads to a player as a reason to wind down. The proof asserts byte
  identity of the system block across a multi-turn run.
  proof: vitest scripts/playbot.test.ts
- [c6] **A selector is a token the engine published, and the loop invents none.** A turn is answered by
  one of two calls, because the engine has two input surfaces: a choice goes to
  `apply(session, choiceId)`, and an open screen goes to
  `applyDirective(session, { kind: 'submit-modal', key, value })` under the key and the value that
  screen published. In both the loop echoes a token it was handed and constructs nothing — no index of
  its own, and no numbering it prints for the model is ever read back as a selector. A reply naming a
  token the view does not offer is refused as c8 requires, not approximated to a nearby one. The proof
  derives its subjects rather than listing them: it walks the view each turn was taken from and asserts
  the selector sent appears verbatim among that view's offered ids, or among the values its asked
  option published. What this promises is that the loop adds no positional coupling. It deliberately
  does not promise there is none — that is the narrowing, and the reason for it is in `## Decisions`.
  proof: vitest scripts/playbot.test.ts
- [c7] **Content edits land between turns without a restart.** Each turn re-reads the content sources
  and adopts the result into the live session before the view is taken, so a location authored while
  the run is in flight is reachable on the next turn. A load that fails leaves the session exactly as
  it was and the run continues on the last good content, with the diagnostic on the run log — a
  half-written file mid-save must not end a session.
  proof: vitest scripts/playbot.test.ts
- [c8] **A reply is structurally valid or the turn fails loudly.** The request constrains the reply to
  this branch's schema — the choice id, a one-line note, the actions the player looked for and did not
  find, and what confused it — and the loop parses no prose. A reply that does not validate, or that
  names an id the view does not offer, ends the turn with a recorded failure rather than a guess. The
  `expected`/`confusion` pair is the run's actual product: it is what says where the world is thinner
  than its own writing promises, and a run that records only moves has produced nothing an author can
  act on.
  proof: vitest scripts/playbot.test.ts
- [c9] **The log is the only channel, and no participant addresses another.** The player writes its
  turn record to the run log and reads nothing addressed to it; the loop sends no message to any other
  agent and reads none. An author works by editing content, which c7 delivers, and by reading the log.
  Nothing in this branch may introduce a second channel between the player and the author — that
  coupling is what the two-process design exists to refuse, and it is what stops a player learning
  about a place before it walks in.
  proof: vitest scripts/playbot.test.ts
- [c10] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Give the project a player whose per-turn cost is a constant, so that a session can be long enough to
author a zone through.

## Decisions

**This spec supersedes `exploratory-playbot`'s framing and inverts its ordering edge.** That record has
carried the design since 2026-07-29 — "standalone Node loop holding a live session, calling the LLM API
each turn to play and report bugs/softlocks/immersion" — and is correct about the shape. It `requires
starting-zone`, which was right when the loop was scoped as a bug-hunter for a finished zone and is
backwards now that it is also the authoring rig: the zone is what the loop produces, not what it waits
on. The edge is dropped and `exploratory-playbot` is closed against this spec rather than worked twice.

**`scripts/playbot.ts` is Testing procedure, not Runtime.** It imports downward from `src/runtime` and
drives a session the way `scripts/play-cli.ts` does, and the layer order `grammar < content < runtime <
ui < scripts` already places it. It registers one concept, the playbot, over that path.

**The client is the Claude Agent SDK, because that is what puts the loop on the author's plan.** Ruled
by the author 2026-08-15: the playbot must be startable from Claude Code, because that is where the
subscription is. The two paths bill different pockets and the difference is not a detail. Agent SDK
usage and the CLI's non-interactive `claude -p` draw on the Claude plan's own usage limits — the
separate monthly Agent SDK credit that was announced for 2026-06-15 was paused, leaving usage drawing
from subscription limits as before. The raw Messages API with an `ANTHROPIC_API_KEY` is pay-as-you-go
against a Claude Platform account and would put every turn of a long authoring session in the wrong
pocket. The boundary worth stating, because it is where this stops being true: plan authentication is
for ordinary individual use of Claude Code and Anthropic's own apps, and a product offered to other
people needs an API key. A playbot exercising this repository's game on the author's machine is the
former; if it ever ships as something other people run, this decision is the one that has to be
revisited.

**The correction above cost one decision rather than a rewrite, which is what c2 buys.** The substrate
changed after the clauses were written — from the Messages API to the Agent SDK — and no clause moved,
because the model is a parameter and every property under test is a property of prompt assembly. A spec
that had named its transport in its clauses would have needed nine edits instead of this paragraph.

**The currency changed and the measured property did not.** Priced against the Messages API a turn was
a fraction of a cent; drawn against a plan it is a fraction of a usage limit, still proportional to
tokens. Flatness matters more under a quota than under a bill: a bill for a run that grew is a number
the author can decide to pay, and a quota that a growing run exhausts ends the session in the middle of
the work. c3 and c4 are what keep the run bounded, and c4 is the one this substrate puts at risk — the
harness this SDK is packaged from carries a system prompt, a tool set, and this repository's own
`CLAUDE.md` by default, and all three have to be off.

**The install is not this branch's to do from a worktree.** `@anthropic-ai/claude-agent-sdk` is not in
`node_modules` today. Every worktree junctions one shared `node_modules`, and an install from any of
them empties the toolchain under every concurrent agent — that is an open finding, not a hypothetical.
It happens once, deliberately, from the main checkout, before a worker starts here. The probe this spec
was measured with used raw `fetch` against the Messages API for exactly that reason; it measured
prompt-assembly shape, which is substrate-independent, and it is not what ships.

**The `adoptRegistry` call here does not collide with
`a-session-adopts-an-edit-or-refuses-it-whole`.** That spec adds a `/reload` command to the REPL's
command surface in `src/runtime/command.ts`; this one calls the exported `adoptRegistry` from a script.
Different file, different caller, one exported mechanism serving both — which is the shape that made
the reload spec's own `## Decisions` note that the loop needs no command. Neither blocks the other, and
a worker on either that finds itself editing `src/runtime/session.ts` has found something both specs
missed and files it.

**No `# test` section, no browser harness, and no new fixture format.** The loop is a driver, not a
runtime directive vocabulary, and the 2026-08-12 ruling that keeps the browser harness separate from
the DSL's `# test` system applies here for the same reason: a driver's own concerns do not become
grammar. A run is reproducible from its log plus the content it ran against, and `/create-valid-test`
already turns a session into a replayable regression when one is wanted.

**c6 narrows to what the engine can honour, ruled by the author 2026-08-15.** A twelve-turn spike drove
the real registry and a real model through tutorial island before any of this was built, and a third of
its turns were not choices: talking to the guide, the mirror and character creation each raise a modal,
which `apply(session, choiceId)` cannot answer. A modal takes an `applyDirective` `submit-modal`, so a
turn is two call shapes and the clause said one. The harder half is that the engine is inconsistent
about stability. A choice id is a name — `use:entity.tutorial-island.mirror.look-in` — and survives an
edit. A character-creation value is a name too, `human`, with free text for the name itself. A dialogue
option's value is its index, `0` and `1`. So the original promise, that a list reordering between turns
cannot change what a reply selects, is false on exactly the surface an author edits most often. The
author's ruling is that the clause tells the truth rather than the engine being changed to fit it: c6
now promises only that the loop introduces no positional coupling of its own, and the residue — an
author who reorders a dialogue mid-run changes what `0` means — is a known engine property, out of
scope here, and wants its own record if it is ever to be fixed. Narrowing rather than deleting keeps
the part that has teeth: the loop still never constructs an index, never reads its own numbering back,
and still refuses a token the view did not offer instead of approximating it.

**What the spike measured, for whoever implements c3 and c5.** Per-turn billed input over twelve turns:
1397, 1365, 1544, 1374, 1448, 1595, 1658, 1671, 1733, 1705, 1708, 1724. It rises while the six-entry
journal window fills and then plateaus, which is the shape c3 predicts — against a subagent measured at
~44k and growing without bound, this is ~1.7k and bounded. Whole run 18,922 tokens, $0.15. But
`cacheReadInputTokens` was zero on every turn: the spike's system prompt sat near 1000 tokens, under
the 1024 minimum, so the frozen prefix was re-billed at full price twelve times. That is the c5 trap
arriving in practice rather than in theory, and it is invisible without asking for the number — the run
looks correct and costs about twice what it needs to.

**What one turn costs on this substrate, measured 2026-08-15 before anything was built.** Measured on
`@anthropic-ai/claude-agent-sdk` 0.3.233 against claude-sonnet-5, one turn, main-model input
tokens: full harness default 45,927; the loop's own prompt with built-in tools still loaded 35,245;
with tools off but settings loaded 5,849; with both off 932. So the cost half of c4 holds with room
to spare — `tools: []` is worth ~34k of the ~45k and `settingSources: []` ~5k — and the floor is
three figures rather than the tens of thousands that would have killed the spec. Two things the
clause did not anticipate came out of the same run. **First, `settingSources: []` does not isolate.**
At 932 tokens the turn still named this project, its path, `CLAUDE.md`, and a convention that lives
only in the author's user-level memory index: working directory, git status and auto-memory ride a
dynamic section that a custom string system prompt does not remove, and the SDK's own
`excludeDynamicSections` is documented to have no effect when `systemPrompt` is a string. Pointing
`cwd` at an empty directory outside the repository removes all of it — the same probe answers "NONE,
I don't have access to any repository" and the floor falls to 296. The empty directory recorded above is
therefore not a fallback; it is the only lever for c4's correctness half, and c4 as written named three
opt-outs where four are needed. The author ruled the fourth in and c4 now carries it.
**Second, a frozen prefix under 1024 tokens does not cache at all** on this model: three consecutive
turns on a 932-token prefix each billed 932 fresh with zero cache reads, while a 6,450-token prefix
wrote once and read 6,450 on every turn after. c5 asserts byte identity of the system block, which is
necessary and not sufficient — a run caching nothing passes it. The proof it wants is a nonzero
`cacheReadInputTokens` on the second turn. Note also a constant auxiliary claude-haiku call of
~520-580 tokens on every turn, in every configuration, that no option removed.

## Open questions

- What ends a run. A turn count is the obvious bound and a usage budget is the honest one, but the
  budget figure must not reach the model's prompt (c5), so the loop holds it and the player does not.
  Which bound ships is a worker's call against a measured run; both are one line and neither changes a
  clause.
