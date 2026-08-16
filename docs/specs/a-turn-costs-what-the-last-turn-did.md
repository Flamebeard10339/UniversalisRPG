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
  the same turn — show a view, pick a `choiceId`, report what could not be done — and differ only in
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
  built-in tools, and with no automatic load of any `.claude/` directory — not this repository's
  `CLAUDE.md`, not its skills, commands or agents, and not the user-level ones. This is the floor that
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
- [c6] **A turn is chosen by id, never by position.** The loop reads the choice id out of the model's
  reply and hands it to `apply(session, choiceId)`; it constructs no index, and no numbering it prints
  for the model is ever read back as a selector. This is what makes the loop correct while the
  game-master is editing: an option list that reorders between turns cannot change which action a
  reply selects. A reply naming an id the view does not offer is refused as c8 requires, not
  approximated to a nearby one.
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

## Open questions

- **What one turn actually costs on this substrate, measured before anything else is built.** c4 says
  the harness adds nothing to the turn; whether the Agent SDK can be configured that far is unverified,
  and it could not be checked while writing this — the `claude` CLI is not on `PATH` in a worktree
  shell. The first thing a worker does is run a single turn with the system prompt replaced and tools
  off and read the token usage back. A small floor means the design holds and the rest of the clauses
  are worth implementing. A floor in the tens of thousands means c4 is unmet on this substrate, and the
  right move is to stop and say so rather than build eight clauses on top of it — the whole spec exists
  because a per-turn cost of that size is what made the subagent unusable. If the floor turns out to be
  a configuration the SDK will not give up, the fallback before abandoning c4 is the loop's working
  directory: a tree holding nothing but a minimal `CLAUDE.md` loads no repository instructions, no
  skills and no commands, because there are none there to load. That is a property of where the process
  runs rather than of what it was asked for, so it holds whatever the defaults do — and it is moot the
  moment a turn carries no tools, because then the directory is unreachable anyway.
- What ends a run. A turn count is the obvious bound and a usage budget is the honest one, but the
  budget figure must not reach the model's prompt (c5), so the loop holds it and the player does not.
  Which bound ships is a worker's call against a measured run; both are one line and neither changes a
  clause.
