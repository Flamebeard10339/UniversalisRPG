# auto-save-export-and-load

## Deliverable

There is no player save. `serializeSave` is called in exactly two places and both write `# save` test
fixtures; there is no store, no autosave, no export and no import, which is why `offline-progression`
defers its own trigger to a branch that did not exist. This is that branch.

What it builds is a named-slot store, not a save file. Three queued records already speak in slots —
`single-dev-mode` wants a parallel one so authoring cannot damage the slot being played,
`offline-progression` wants the instant a slot was written, `save-migration-system` wants a real
player save to protect — and each of them named that need before this branch was planned. So the
store is slot-keyed from its first line, its payload is opaque text it never inspects, and the one
thing it adds around that payload is when the slot was written. Autosave, export and import are then
three small things on top of it, and the whole of it is exercised through `play-cli` before `src/ui`
exists.

The dev slot is the fourth, and it is here rather than beside it (c9–c13). `single-dev-mode` was
written as its own branch because a dev mode sounds like a mode; read against this spec it is one
rule about which slot receives a write, and its five clauses prove against `scripts/play-cli.test.ts`
— the same file c4 through c8 prove against. The guarantee is unchanged and is still the whole point
of it: entering dev mode persists a snapshot of the player's slot *before* anything is editable,
everything done in dev goes to a separate slot, leaving restores the snapshot, and a crash in between
costs nothing. What the fold removes is a second worker opening `play-cli.ts` to add a second rule
about the same cadence.

Proof:

- [c1] Persistence is a named-slot store behind one interface, and nothing in that interface is
  save-shaped: read a slot, write a slot, delete a slot, list them, and the payload is opaque text
  the store never parses. A driver supplies the implementation — a file under the CLI, an in-memory
  one under test — the way `writeLocalChanges` is supplied today, so nothing below the driver
  performs I/O of its own.
  proof: vitest src/runtime/store.test.ts
- [c2] A slot records when it was written, and the stamp belongs to the slot, never to the payload.
  `offline-progression` settled this and is built on it: the payload is exactly the text
  `serializeSave` returns, so an exported save and a `# save` fixture are the same bytes, and a
  payload carrying no store stamp reconciles nothing without anyone special-casing it.
  proof: vitest src/runtime/store.test.ts
- [c3] A slot reads back byte-identical to what was written. `single-dev-mode` c1 asks precisely
  this of the snapshot it takes on entering dev mode, and a store that normalises, reorders or
  re-encodes on the way through cannot give it.
  proof: vitest src/runtime/store.test.ts
- [c4] Autosave fires on a cadence and zero means never. The cadence is real seconds since the slot
  was last written, checked after a command that changed state and on each live tick, and it is held
  in a slot of its own — which is what proves c1's claim that the store is not save-specific rather
  than asserting it.
  proof: vitest scripts/play-cli.test.ts
- [c5] No load path advances time. Loading a slot, importing a payload, a `# save` fixture and a
  `# test` doing `load:` each leave `state.time` at exactly what the payload holds.
  `offline-progression` puts its entry point outside `loadSave` for this reason, and this branch must
  not pre-empt it by putting a clock read anywhere a load can reach.
  proof: vitest src/runtime/save.test.ts scripts/play-cli.test.ts
- [c6] Export and import use the spelling the DSL already has. `/export` prints the current save as a
  `# save` body, so its output pastes into `/dsl save <id>` unchanged and `/import` takes that same
  text back. No second save serialization is written.
  proof: vitest scripts/play-cli.test.ts
- [c7] A save that will not load changes nothing and says why. A payload the existing checks reject
  leaves the session exactly as it was, and a slot that is absent, empty or unparseable is a message
  rather than a crash.
  proof: vitest scripts/play-cli.test.ts
- [c8] All of it is exercised before `src/ui` exists. Every clause above is provable through
  `play-cli` against a file-backed store, and this branch ships no browser adapter and no stub of
  one — `the-gui-authors-through-the-same-door` c11–c15 owns the browser adapter and requires this.
  proof: vitest scripts/play-cli.test.ts
- [c9] **Nothing done in dev mode survives into the player's slot.** Anything done in between —
  content edits, play, cheats, a save-breaking mistake — is gone on exit, and the player's slot is
  byte-identical across the whole of it: the same bytes at `/dev on`, at `/dev off`, and at every
  command afterwards. The clause states the guarantee and names no mechanism, because the mechanism
  is c10 and this is its corollary — the slot receives nothing while the mode is on, so there is
  nothing to put back when the mode goes off. What is snapshotted on the way in is the *session*,
  which is the thing dev actually moves, and restoring it is how `/dev off` puts the player back
  where they were. Knowingly not covered: repairing damage another process did to the player's slot
  while dev was on. The author ruled that out on the measurement that a compensating write is the
  only step on the way out that can fail, and that a failing one strands the author in the mode and
  then destroys their work through the remedy it prints.
  proof: vitest scripts/play-cli.test.ts
- [c10] **Autosave follows the slot.** While dev mode is on, every write goes to the dev slot and the
  player's slot receives nothing, so a session spent authoring cannot appear in the file being played.
  This is c4's cadence pointed at whichever slot is live, not a second cadence.
  proof: vitest scripts/play-cli.test.ts
- [c11] **A crash while in dev loses nothing.** The snapshot is persisted at the moment dev mode is
  entered, not held in memory, so a process that dies mid-session leaves the player's slot intact and
  recoverable without an orderly exit.
  proof: vitest scripts/play-cli.test.ts
- [c12] **Not entering dev mode changes nothing.** With the mode off, saving, loading and autosave
  behave exactly as c1–c8 leave them, and no dev slot is created.
  proof: command npm test
- [c13] **Which slot is live is answerable, not inferred.** A session reports whether it is in dev
  mode and which slot it is writing, so a later surface renders an answer rather than tracking its own
  copy of the state.
  proof: vitest scripts/play-cli.test.ts
- [c14] **A payload the validator accepts is a payload the loader can read, for every field.** No
  input reaches `loadSave` past `checkSave` and then throws — a corrupt slot is a diagnostic naming
  the field, never a raw `TypeError` from inside the gate that exists to prevent one. The clause is
  universal over `SAVE_FIELDS` and its proof derives its subjects from that table: for each field,
  the emptiest value its own `holds` admits is fed through `checkSave` and `loadSave`, and the field
  added next month is covered without an edit to the test. Three fields fail this today —
  `activeAction`, `journey` and `player` are gated on `isObject` alone while the code downstream
  destructures `ownerRef`, `actionLabel` and `cadences` — which is `runtime-2026-07-30-h1`, and the
  intent was already the opposite: `activeActionProblem` (`src/runtime/save.ts:119`) wraps
  `findActionOwner` in a `try`/`catch` that converts a `RuntimeError` into a warning, and the next
  statement defeats it.
  proof: vitest src/runtime/save.test.ts
- [c15] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

The player's progress survives closing the game, through a store three queued branches can build on.

## Decisions

- **Slot-keyed from the first line, because two consumers already asked for it.** `single-dev-mode`
  is written entirely in slots — "everything done while in dev runs against a separate slot", and the
  snapshot "is written to the store when dev mode is entered, not held in memory" — and
  `offline-progression` measures its span "from the last slot the store wrote". Growing a key onto a
  single-file save later would be the same work done twice, with a migration in between.
- **Settings are a slot, not a second system.** The record named the missing settings store as one
  of two gaps to close or declare. Building one would be a second persistence mechanism beside the
  one this branch is already building; a slot-keyed text store is what a settings store is. The
  autosave cadence is its first entry. What a full settings surface holds — `single-dev-mode` has a
  toggle, and `gui-rebuild` ships Settings as an empty frame waiting for a body — is nobody's yet
  and does not have to be, now that it has somewhere to live.
- **The stamp is offline-progression's ruling, not this branch's choice.** That spec reasons it out:
  a stamp inside the payload would mean an imported save carries someone else's clock, and a bare
  "last active" stamp is wrong when autosave is set to never, because the span the resumed state
  never lived through starts at the write. This branch implements that conclusion and does not
  relitigate it.
- **This branch does not wait for `in-process-module-api`.** Landing first means `/export`, `/import`
  and the autosave check are written into `handleCommand` and moved with everything else later;
  landing after means three table entries. Moving three more commands during a move of all of them
  is nearly free, and waiting would put `offline-progression`, `save-migration-system` and
  `single-dev-mode` behind `first-class-modals` and the entire GUI chain for no gain. The
  injected-effect pattern this branch uses is the one that seam generalizes, so nothing is built
  twice.
- **`runtime-2026-07-30-h1` is absorbed as c14 — the author overruled this spec's own earlier ruling
  on 2026-08-16.** What stood here said it was required rather than absorbed, on the reasoning that
  it is its own fix in its own file. The author's instruction is that the push runs in as few
  sessions as it can, and a one-file fix that blocks the whole chain is a session bought for nothing.
  Two things make the fold cheap rather than a smuggled scope increase: the fix lands in
  `src/runtime/save.ts`, which no other member of this push writes, and c14 states the property as a
  derivation over `SAVE_FIELDS` rather than as three named fields — so it is a clause this spec would
  have wanted anyway, given that this branch is what makes a corrupt payload reachable from a
  player's disk instead of only from a hand-written `# save`. The original reasoning is kept below
  because the defect it describes is what c14 must fix: `checkSave` gives `activeAction`, `player`
  and `activeBuffs` no check past `isObject`, so `loadSave` crashes with a raw `TypeError` from
  inside the validator that exists to prevent it. Today that is reachable only through a
  hand-written `# save`; this branch makes it reachable by any corrupt slot a player's disk hands
  back, which is exactly the promotion "fixing one defect can promote another" describes. It is its
  own fix in its own file, so this branch requires it rather than growing a clause around it.
- **`single-dev-mode` is absorbed, and its own spec is retired into c9–c13.** The author ruled on
  2026-08-16 that the push folds where folding costs no parallelism, and this fold costs none: seven
  open records claim `scripts/play-cli.ts`, so nothing that writes it was ever going to run beside
  anything else that does. The absorbed spec's reasoning survives verbatim in the clauses — the
  snapshot is persisted on entry rather than held in memory because the sessions most likely to crash
  are the ones spent editing content, and `play-cli` stays ungated because dev mode is a mode of the
  game and the CLI is not the game. Its presentation half was already split off and is now
  `the-shell-draws-what-the-session-answers`, which reads c13's answer rather than holding a second
  copy of it.
- **The store and the commands are one member, not two.** This spec carried two members — the slot
  store, split out ahead because three records needed slots rather than commands, and everything on
  top of it. The split was about what the store *is*, which is settled and recorded here; it was never
  a claim that two workers should build it. One member now discharges c1–c14 over one grant.
- **The cadence is not a `# variable`.** Tuning variables are authored by content and are the same
  for every player; an autosave cadence is a preference of the person playing. They look alike, and
  putting the cadence in the registry would let a mod set how often someone's game is saved.

- **The stamp rides in an envelope the driver never opens.** A driver deals in text in and text out;
  the store wraps `{writtenAt, payload}` around it and unwraps on the way back. The alternative — a
  driver handing back a `Slot` — would put stamping in every implementation, so the file store and
  the browser one could stamp differently and c2 would be a sentence rather than a property. The
  payload survives the wrap byte for byte, which is c3.
- **The autosave decision lives in `src/runtime/saveSlots.ts`, above the store and below `ui`.** That
  answers the first open question. `store.ts` stays the four verbs over opaque text and imports
  nothing but `RuntimeError`, which is what `store.test.ts` asserts structurally rather than in
  prose; `saveSlots.ts` holds which slot is live, whether the cadence has elapsed, and the dev pair.
  One clock, built into the store and held beside it in the same context, so the stamp a write lays
  down and the span the cadence measures cannot come from two readings that disagree.
- **One file per slot, `<name>.slot`, under one directory.** That answers the second open question.
  A slot name is a file name, so it is held to `[a-z][a-z0-9-]*` and nothing that could climb out of
  the directory reaches the filesystem.
- **The cadence defaults to never, and `play-cli` does not resume from a slot at startup.** CLAUDE.md
  records that `play-cli` starts fresh every run, and a CLI that silently picks up whatever the last
  run left in `.saves/player` is a CLI whose runs are not repeatable — every `# test`, every drift
  proof and every hand-driven session would start somewhere nobody chose. The cadence lives in a
  slot, so `/autosave 30` is said once and outlives the session that said it. The directory is not
  created until something is written to it, so a run that was not asked to save leaves nothing.
- **"A command that changed state" is `result.recorded.length > 0`.** The table already defines
  `recorded` as empty for a read-only command, so the autosave check reads that answer rather than
  growing a second one beside it.
- **`/export` and `/import` need no store; the five slot commands do.** An export is the bytes
  `serializeSession` already returns and an import is those bytes going back through `loadSaved`, so
  neither touches persistence and both work on a driver that keeps nothing. That is what keeps the
  drift proof comparing the two drivers over them rather than carving them out.
- **`loadSaved` is transactional by construction, not by catching each way a load can fail.** It
  builds the state beside the session and copies it in only once the whole of it stands. `checkSave`
  runs before `loadSave` mutates anything, so every refusal this branch can name today is caught
  before the state moves — the mutation testing said so outright, by surviving. What the transaction
  is for is a raise from *below* the checks, which is exactly what c14 keeps the shipped prune rules
  from doing; the proof therefore raises out of one on purpose, at the seam the pruner asks about
  locations through. Copied in rather than swapped for, because a `# test` partway through a replay
  is holding the state object and a swap left it running against the state the load replaced.
- **`/import` records nothing, so a `# test` built after one does not replay it.** A `load:` line
  addresses a `# save` by id and an imported payload has none. `/export` into `/dsl save <id>` is
  the spelling that gives a payload an id, and that route does record.
- **The slot commands speak in the tool's own words.** `/state` and `/local` already do: what they
  print is the record behind the game rather than anything the world said, and no new engine key is
  minted for a slot name or a cadence. c13's answer is `saveReport`, which is structured — the later
  surface renders that, and the terminal's three lines are this driver's own rendering of it.
- **Every field in `SAVE_FIELDS` carries a `sparsest` value.** c14 is universal over that table and
  its proof has to derive its subjects from it, so the sample each field is walked with is a column
  of the table the compiler already forces somebody to fill in when a `GameState` field is added. A
  nullable field names its emptiest object rather than its null, because null is the case the loader
  already has an answer for.
- **Leaving dev mode rewrites the player's slot only when it differs from the snapshot, and refuses
  outright when the snapshot is gone.** Rewriting unconditionally would move the stamp on a slot
  nothing touched, and c1's four verbs have no way to restore one. A snapshot somebody deleted is
  the one case where erasing is worse than staying in dev: the player's slot is left exactly as it
  is and the mode stays on.

- **A session writes back only the slot it came out of.** Pass 1 found two ways the branch destroyed a
  player's save, and they are one rule missing rather than two bugs: the cadence lives in a slot and
  outlives the process, so a game reopened found the cadence due at its first command and wrote a
  brand-new session over an hour of play; and `leaveDev` restored the slot while the session went on
  holding everything dev had done, so the next check wrote it straight back. Autosave now writes a slot
  only when this session was loaded out of it, was written into it, or there is nothing in it to lose.
  `/save` is how a session takes a slot it did not come from, and it is deliberately the explicit
  spelling — the question the fix answers is not whether a run resumes, which is settled above, but
  whether a run that did not resume may write over what it never read. A held autosave says so on the
  command it happened on, because a game quietly not being saved is the worse failure.
- **What a session has adopted sits beside its context, not on it.** `src/runtime/published.test.ts`
  refused a `Set` on `SaveContext`, and it was right to: what a driver holds is a published surface and
  this is a fact about a running process that no surface renders. A `WeakMap` keyed by the context, the
  way a `PlaySession`'s internals sit beside it. It also gives the right answer for free — a context
  built over the same directory by a restarted process has adopted nothing, which is what a restart is.
- **Leaving dev mode puts the session back, not only the slot.** c9 says what was done in dev is gone
  on exit, and a session still holding it while the slot no longer does is the state the leak came out
  of. `leaveDev` hands back what the player's slot holds again and the command loads it, because loading
  a payload is not something a store does. A snapshot of nothing has nowhere to go back to: the session
  is left where it is and `player` stays unadopted, so nothing it does can reach a slot.
- **Two backstops, rather than a longer list of field checks.** Pass 1 found `activeAction.roster`
  unchecked — declared on `ActiveAction`, destructured by the pruner, and missing from a gate written
  as a hand-listed set of fields. Adding `roster` was the too-small fix, because `Seat` can gain a
  fourth field and nothing would force that one to be checked either. So `holds` keeps saying what is
  worth refusing *by name*, and two conversions say what happens to everything else: `pruned` inside
  `loadSave` turns any raise from the pruner into a diagnostic, and `standable` inside `loadSaved`
  proves the built state can be drawn — through `sessionStatus`, which reads across fields the load
  path wrote one at a time — before the session adopts it. `sessionStatus` rather than `view` because
  reading the log is what drains it, and the warnings a load just wrote are owed to whoever asked.
- **A live tick carries nothing to `end`, because it does not have to.** Pass 1 read the tick
  discarding what the autosave check returned as a run going silent about a cadence slot it could not
  read. The carry was written, and the mutation that removed it survived: a run that ticked ends with
  a wait or a cancel to record, so `end` settles like any other command and asks again there, on a
  session the answer is still true of. The test the carry was written for stays — it is what proves
  the report does reach the end of a run — and the machinery came out.

- **A session tracks what it is and what it is not, because an absent slot answers those two
  differently.** Pass 2 found the pass-1 fix aimed at the reproduction rather than the rule: with no
  player slot at dev entry, `/dev off` left the slot absent, an absent slot read as "nothing to lose",
  and the dev session landed in it on the next command — the same leak, one branch over. A single set
  of adopted slots cannot tell the two cases apart, because a game nobody has loaded *may* take an
  empty slot and that is what a new game is. So a session holds both: the slots it is what they hold,
  and the slots it has been told it is not. Leaving dev withholds the player's rather than merely
  forgetting it, and loading it back clears the withholding.
- **One reader for "the slot, or nothing".** Three places wanted the same answer to a slot the store
  cannot make sense of — the cadence's last-written stamp, the report's date column, and now the
  adoption check — and the third was written without the catch the first two had, so a half-written
  file cost the whole save report and every autosave after it. `readable` is that answer in one place;
  the alternative was a third copy of a judgement already made twice.
- **Leaving dev mode is all-or-nothing, and the session goes first.** `devSnapshot` asks what there is
  to go back to, the command loads it, and only then does `leaveDev` put the slot back and take the
  dev pair away. Committed the other way round, a snapshot this build can no longer read — a
  `SAVE_VERSION` bump between writing it and leaving — ended the mode, deleted the dev slot, and left
  an author's work in memory with nowhere to put it.
- **The view is back outside `importPayload`'s guard.** Pass 1's medium moved it in; pass 2's mutation
  testing found that the only mutation of twenty-five to survive was moving it back out. `loadSaved`
  has already copied the state in by the time the view is drawn, and `standable` is what makes the
  draw safe — so the wider `try` was a guard against nothing, with a comment claiming otherwise.

- **c9 is proved by derivation, because two passes graded it unmet on evidence the other did not
  have.** CLAUDE.md names that shape: a clause failing twice on different instances is being checked
  by instance, and what it needs is a derivation rather than a third reproduction. Both instances were
  one sentence — a session that came out of dev reaching the player's slot — so the proof is now one
  property over the two things that vary: what the player's slot held when dev was entered, and what
  dev did. Twelve cases, derived from those two tables, each asserting byte-identity at the moment the
  mode goes off *and* that nothing the dev session did is in the slot five ordinary commands later,
  which is where both graded reproductions actually appeared. Writing it found a thirteenth state the
  tables could not hold: a slot the store cannot read is not one dev can be entered from, because
  there is no snapshot to take of it and no way to put it back. Entering is refused there and the
  bytes are left where they are, which is its own case beside the twelve.

- **The slot write is staged and renamed, which is the cause the three passes were arguing about the
  symptom of.** `writeFileSync` truncates the file and then streams into it, so a process that dies
  inside that window leaves a prefix and the save it was replacing is already gone. Every argument
  about what autosave should do with bytes nobody can read was an argument about the wreckage. A
  rename cannot half-happen, so a slot holds either what was there or what was going in, and a write
  that never finished costs nothing. `docs/tasks.jsonl` reached the same conclusion for the same
  reason (`scripts/lib/taskStore.ts`), and `tasks produces "atomic store write"` is what says so — the
  driver just was not doing it. Deliberately without that store's retry loop around the rename: the
  task store is written by whichever `tasks` processes are in flight and has to win the race, where a
  save slot is written by the one game playing it, so a rename that loses says so and the next
  autosave comes back in a cadence. The author ruled the rotation of autosave generations out of this
  branch on 2026-08-16 and it is filed as its own record: rotation protects against a *bad save*,
  which is a different thing from a *broken file*, and it needs clauses of its own about which
  generation is the save and how `offline-progression` reads a stamp across one.
- **A slot has three states, not two.** Dating a slot and being entitled to replace it are different
  questions, and an unreadable slot answers them differently: there is no date, and there is
  everything to lose. Collapsing them behind one `readable` helper is what pass 3 found — the helper
  was written for the date question and reused for the entitlement one, which turned "report and
  preserve" into "silently overwrite" for exactly the file an interrupted write leaves. `SlotState` is
  the three answers named, `datable` and `adopts` are the two questions asked, and a fifth reader
  picks a question rather than a helper.
- **Leaving dev mode cannot fail, so it never strands anybody.** Putting bytes back where they were is
  the one step that cannot go wrong, so it runs whether or not the session could be put back with
  them; a snapshot this build can no longer read costs the session, which stays where it is and is
  told so, and never the way out of the mode. The dev slot stays too — removing it was tidiness, and
  it is an author's work, so a session that could not be restored still has somewhere to go back to.
  Nothing adopts a stale dev slot, so nothing writes over it either. This replaces the pass-2 ruling
  that leaving dev is all-or-nothing: the reason that ruling existed was that a failed restore lost
  the dev slot, and now no step loses anything.
- **c9's proof derives both of its axes.** Pass 3 was right that the first version was a hand-listed
  table with a coverage assertion that could only fail if somebody widened the table. What dev can do
  is `COMMANDS` — the table this driver dispatches every line through — so the walk takes its acts
  from there, twice per entry, over four states the player's slot can be in at dev entry. A command
  added tomorrow is walked on the day it exists, which is what `SAVE_FIELDS` does for c14.

- **`/dev on` goes to the dev slot the way `/dev off` comes back from the player's.** Pass 3 kept the
  dev slot on exit because it is an author's work; pass 4 found the other half of that had not been
  written, so a second `/dev on` met a slot the session was not, and every command in it warned that
  autosave was held. The symmetry is the fix rather than a special case: entering loads what the dev
  slot holds, so the session is always what the live slot holds and autosave never has to choose
  between refusing an author and writing over their last session. A dev slot that will not load costs
  the pick-up and nothing else — the mode is on, the slot is left alone, `/save` takes it.
- **Leaving dev has three ways to go, and none of them is a raise.** A snapshot that is gone or
  unreadable used to keep the session in the mode with no command that left it. It is now a third
  answer beside "back to what was there" and "back to having no slot": out of the mode without
  touching the player's slot at all. Not being able to restore a slot is a reason to leave it alone,
  never a reason to strand somebody.
- **Every verb of the file driver speaks this engine's language.** `write` wrapped its filesystem
  errors and the other three did not, so a directory standing where a slot should be — a hand, a sync
  tool, an interrupted checkout — reached `refused`, which rethrows anything that is not a
  `RuntimeError`, and ended the session standing behind it. One wrapper over all four.
- **The cadence answers the same two questions a slot does.** `saveReport` read it through the
  throwing reader, so one unreadable settings slot cost the whole report — the same shape as the
  finding closed one pass earlier, one caller further on. `cadenceOrNone` is what a report asks and
  `autosaveSeconds` is what has to act on one, and neither guesses.

- **Entitlement is one slot name, and it is answered where the session or the live slot changes —
  never at a write.** Five passes graded this rule, four of them unmet, each on a different branch of
  itself. It was two sets of slot names in a `WeakMap` mutated by hand at eight call sites, and
  CLAUDE.md names that shape as the repository's largest failure mode. It is now
  `SaveContext.synced`: the one slot whose game this session is, `null` for none. A session may write
  the live slot when `synced === liveSlot(save)` and at no other time.

  Two things fall out, and between them four of the five recorded failures stop being fixable
  because they stop being expressible. There is no negative set, so pass 5's first HIGH — an `isNot`
  entry `/dev off` left behind that nothing on the way back in took away, which made an empty dev
  slot permanently unadoptable — has nowhere to live. And the "an empty slot is free to take"
  allowance moved off the write and onto the two transitions that can grant it: `createSaveContext`,
  because a new game is the empty player slot's game, and `enterDev`, because an empty dev slot is
  this session's scratch slot. That is the whole diagnosis of why the rule kept failing. Asked at
  the write, one question owed two opposite answers to the same input — yes for an empty dev slot at
  entry, no for an empty player slot on the way out of dev — and whichever it gave, a pass filed the
  other. Asked at the transition, they are two different events and each gets its own answer.

- **The proposal to derive entitlement by compare-and-swap on the store's stamp was measured and
  refused.** It would have had `enterDev`, `leaveDev`, `devOn` and `devOff` stop touching
  entitlement, with a session entitled when the slot's `writtenAt` is the one it last synchronised
  with, or when the slot is empty. Applying exactly that move to the branch failed six tests,
  including the c9 `COMMANDS` walk with 162 leaks. The stamp rescues two of the six — the ones where
  the player's slot holds bytes whose stamp the session never synchronised with — and cannot reach
  the other four: three are the empty-slot arm it keeps, which is pass 2 reopened, and one is a
  restore write it does not touch. The premise is what fails: `/dev on` and `/dev off` *load
  payloads*, so they change what game the session is, and a transition that changes the session's
  identity cannot stop answering which slot that session is. Resuming from the live slot at startup
  was weighed against it and refused too — it reverses "`play-cli` starts fresh every run" for what
  the construction-time empty-slot answer already gives, and leaves the unloadable-slot case needing
  the rule anyway. Taking dev mode out of the branch was weighed and is unnecessary: under this shape
  the rule is the same size with dev as without, because dev contributes two transitions that each
  answer one nullable field.

- **What dev snapshots is the session, and leaving dev writes no slot at all.** This replaces the
  pass-3 ruling that leaving rewrites the player's slot when it differs from the snapshot, and the
  pass-4 ruling that leaving has three ways to go. The restore write was insurance against something
  c10 forbids, and the measurement says so: with `leaveDev`'s whole restore-and-remove block deleted,
  the c9 walk — every `COMMANDS` entry, twice, from four player-slot entry states — passes with zero
  leaks, and the only four tests that notice its absence all manufacture the damage from outside the
  command table, one of them saying so in its own comment. It was also the one step on the way out
  that could fail, which is pass 5's second HIGH: a refused write kept the mode on and printed a
  remedy that destroyed the authoring. Snapshotting the session instead is what makes the deletion
  possible rather than merely safe — it is the thing dev really moves, it is what `/dev off` has to
  put back, and it retires `was-empty` entirely, because "there was no player slot" stops being a
  case that has anything to restore. `/dev off` goes from four outcomes to two. The snapshot carries
  the pre-dev `synced` beside the bytes, so leaving restores the standing it went in with rather than
  inventing one: a reopened game that was no slot's before `/dev on` is still no slot's after.

- **Dev mode is entered from a player slot the store cannot read.** This reverses the pass-3 ruling
  that it is not, which reasoned that there is no snapshot to take of bytes nothing can read and no
  way to put them back. Neither is true once the snapshot is of the session: a session is readable by
  definition, and the bytes are never written because no session is their game. Refusing entry cost
  an author the only mode they could work in whenever a slot they were not going to touch was
  spoiled.

- **A load is required to say which slot it came out of.** `importPayload` takes it as an argument
  with no default, and the four callers each answer — `/import` with nothing, `/restore` with the
  live slot, `/dev on` with the dev slot, `/dev off` with what the snapshot carried — so a fifth
  added next month does not compile until it answers too. This closes a defect no pass filed and that
  the audits' own framing would have missed, because it is not about dev: a payload from `/import`,
  or from a `# save` in the content by way of `load:`, inherited the standing of the session it
  replaced, so the next cadence wrote a stranger's game over an hour of somebody's play. `load:`
  reaches the session through `applyDirective` rather than `importPayload`, so it answers at its own
  seam in `runDirective` — the two routes a payload becomes this session are exactly those two, and
  both are named.

- **Taking the snapshot slot away happens last, because it is tidiness.** A stale snapshot costs
  nothing — the next `/dev on` overwrites it — so the mode goes off and the standing is set before
  the removal is attempted. Done the other way round, a store that refuses the removal would keep
  somebody in dev with no command that leaves, which is the same shape as the restore write this
  branch just deleted. The ordering was the one aimed mutation of seventeen to survive; it is now
  watched by `saveSlots.test.ts` "is out of the mode even when the store refuses to take the snapshot
  away".

- **`SaveContext` is not a published surface.** `published.test.ts` refuses a bare `string` on
  anything a driver can hold, and `synced` is one. It is a slot name, which is a file name rather
  than words, and no surface reads one off the context: c13 is that a surface draws `saveReport`.
  The context is the handle a driver keeps slots through, which is the same reason `CommandContext`
  was already listed there.

- **The standing is dropped by every route a payload becomes this session, and the walk that says so
  is derived over `COMMANDS` twice.** Pass 6 found the third route: `runSessionTest` replays a
  `# test`'s directives through `applyDirective`, so a `load:` inside one — and `/create-test` writes
  one as every test's first line — never reached the `load:` arm in `runDirective` where the standing
  is dropped. `/test` on an ordinary generated test wrote a stranger's game over the player's slot
  with no warning. Two guards now, both in `command.ts`, and the reason they are two is that
  `runDirective` knows which directive it ran and `runNamedTest` cannot know: a replay may have been
  any game at all, so its standing goes unconditionally. What makes two guards a rule rather than a
  list is that the proof derives its subjects — `no line leaves this session writing a slot that is
  not its game (c4)` walks every `COMMANDS` entry outside dev, beside the c9 walk that walks them
  inside it, so a fourth route is walked on the day it exists.
- **A walk that hands every command the same argument only ever exercises its refusal.** That is why
  the route above went two passes unwalked: `/test 1` names no test. `ACTS_ON` gives each entry an
  argument it acts on, the count of entries missing one is asserted against `COMMANDS`, and the walks
  are asserted to be driven by that map rather than beside it — a map full while the lines still say
  `1` is exactly the walk that missed this.
- **`synced` is an `Answer`, so the handle stays inside the published walk.** It was a bare `string`,
  which put `SaveContext` on `published.test.ts`'s hand-maintained skip list. `Answer` exists for
  this and its own comment names a slot as the example, so the entry came off the list rather than
  onto it.

## Open questions

- Where the store interface lives, and whether the autosave decision — has the cadence elapsed,
  write the slot — sits beside it or in the command surface. Both drivers need that decision, so it
  belongs below `ui`; which module is for whoever has read the region.
- Whether a slot is one file or a directory per slot under the CLI. Nothing above the interface can
  tell, which is the point of c1, so the first implementation decides.
- How many player slots the game eventually offers. This branch needs the one being played and
  whatever `single-dev-mode` names; a save-slot picker is a question no record has asked yet.

## Audit passes

### Pass 1 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `886350d041e033d2b956ee5c9213593297c95984`
- proof 1: met — Three aimed mutations on src/runtime/store.ts, all KILLED by src/runtime/store.test.ts:
deleting `driver.remove(name)` killed by "reads, writes, removes and lists, and an absent slot is
nothing rather than a raise"; making the store parse the payload into the envelope killed by "never
parses a payload"; adding `import { readFileSync } from 'node:fs'` killed by "reaches neither a save
nor the filesystem", which asserts store.ts's import list equals exactly `['./runtime']` and so
derives the no-I/O claim rather than asserting it. Re-run:
npm run mutate -- C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass1-mutations.json
- proof 2: met — Two aimed mutations, both KILLED. `writtenAt: now()` -> `writtenAt: 0` killed by
store.test.ts "stamps the write off the clock it was built with". Folding the stamp into the payload
on the way to the driver killed by "stamps a payload that carries no stamp of its own, and leaves it
carrying none", which writes one fixture into two slots 60s apart and asserts the payloads are equal
while the stamps differ by 60_000 -- so a stamp riding inside the exported bytes cannot pass.
- proof 3: met — `decode` normalising the payload (`parsed.payload.trim()`) is KILLED by two of the nine
parametrised store.test.ts round-trips -- `"   "` and the mixed CRLF/LF body. The nine payloads cover
non-JSON, empty, whitespace-only, unicode, mixed line endings and key-order/whitespace variants of a
`# save` body, so the case a normalising store would silently pass is in the table.
- proof 4: met — Five aimed mutations, all KILLED by scripts/play-cli.test.ts against a file-backed store.
Deleting `if (seconds === 0) return false` killed by "writes nothing at all until somebody asks for a
cadence" (which asserts the directory is never created). `>= seconds * 1000` -> `>= seconds` killed by
"measures real seconds since the slot was written". Making `settle` return before the check killed by
that same test; making it check unconditionally killed by "is not checked after a command that changed
nothing". Deleting `autosaved(ctx)` from the live-run tick killed by "is checked on each live tick".
The cadence lives in its own `autosave` slot holding `'30'`, asserted at the file level.
- proof 5: met — All four spellings converge on one function: `/load <id>` and a `# test` `load:` both
reach performDirective's 'load' arm, which now calls `loadSaved` (src/runtime/session.ts:404-419), and
`/import` and `/restore` reach it through `importPayload`. Nothing on that path reads a clock. Two
aimed mutations, both KILLED: adding `next.time += (Date.now() % 1000) + 1` after `loadSave` inside
`loadSaved` killed by play-cli.test.ts "leaves the clock at what the payload holds, through a # save,
an import and a slot"; making `loadSave` source `time` from `Date.now()` killed by save.test.ts
"leaves state.time at exactly what the payload holds".
- proof 6: met — `/export` returns `[serializeSession(ctx.session)]` and nothing else, and no second
serialization exists anywhere in the diff. Three aimed mutations, all KILLED: pretty-printing the
exported bytes killed by both "prints the bytes serializeSession returns and nothing else" and "pastes
into /dsl save <id> unchanged, and comes back through /load" (which pastes the printed line verbatim
into the staging command, reloads it and asserts the clock came back to 5); making `/import` a no-op
killed by "takes its own output back through /import, to the same bytes".
- proof 7: unmet — The three enumerated cases are delivered and mutation-proved (four aimed mutations
KILLED: a non-transactional load, the withSaves catch removed, the absent-slot message downgraded, the
importPayload catch removed). The clause's own leading sentence is not: a slot that parses and that
checkSave accepts can still leave the session changed and crash instead of saying why. Reproduce with
npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass1-probe4.ts
 -- a `player.slot` holding `{"version":11,"activeAction":{...,"roster":{"player":3}}}` gives
`gateAdmits: true`, `/restore` reports `THREW OUT OF runLine -- TypeError: Cannot read properties of
undefined (reading 'indexOf')`, and afterwards every `view()` raises the same, so the session is
bricked with the bad state already adopted. Two independent causes: the gate is incomplete (c14), and
`importPayload` (src/runtime/command.ts:625-633) adopts the state through `loadSaved` and only then
calls `view()`, outside its own try -- the transaction boundary is drawn before anything proves the
loaded state renderable, and `refused()` rethrows a non-RuntimeError past the command layer.
- proof 8: met — c4-c7 and c9-c13 are all proved in scripts/play-cli.test.ts against `fileSaves(dir)` over
a real temp directory, asserted by reading the `.slot` files back off disk. Deleting `writeFileSync`
from scripts/lib/slotFile.ts is KILLED by "keeps the slots as files, which is the store a player would
have". No browser adapter ships: "ships no browser adapter and no stub of one" walks `src/ui`
recursively and asserts no `.ts`/`.tsx` there imports store, saveSlots or slotFile -- derived from the
tree rather than listed, so a stub added next month fails it. Confirmed independently:
`git diff 878a05b..886350d --stat` touches no file under src/ui.
- proof 9: unmet — The two halves the clause names are delivered and mutation-proved: deleting the
DEV_SNAPSHOT write is KILLED by play-cli.test.ts "snapshots the player slot on the way in and restores
it byte-identically on the way out", and deleting the restore write is KILLED by saveSlots.test.ts
"restores byte-identically over a slot something did overwrite". What is not delivered is "anything
done in between ... is gone on exit". `leaveDev` restores the slot and leaves the running session
holding everything dev did, so the next autosave writes it straight back over the player. Reproduce:
npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass1-probe2.ts
 -- the player slot holds 1 gold, ten commands in dev take the session to 11, `/dev off` restores the
slot to 1 gold (`slotRestoredOnLeaving: true`), and one ordinary command afterwards leaves
`playerOneCommandLater` at 12 gold (`survivedOneMoreCommand: false`). The Deliverable's own words --
"authoring cannot damage the slot being played" -- fail one command after the mode is off.
- proof 10: met — `liveSlot` is the single answer both `saveNow` and `autosave` write through. Collapsing
it to `return PLAYER_SLOT` is KILLED by play-cli.test.ts "snapshots the player slot on the way in and
restores it byte-identically on the way out", which turns `/autosave 1` on inside dev, passes 60s,
plays, and asserts the dev slot holds the current session while the player slot still holds what was
played before entry. Confirmed independently by probe2 above: `playerWhileInDev` stays at 1 gold while
`devSlot` reaches 11. The leak probe2 finds happens after the mode is off, which is c9's scope and
not this clause's.
- proof 11: met — Two aimed mutations, both KILLED by play-cli.test.ts "loses nothing when the process dies
in dev, without an orderly exit", which never calls `/dev off` and rebuilds a second SaveContext over
the same directory -- the restarted context reads the player slot and the snapshot back off disk.
Holding the snapshot in memory (`void encodeSnapshot(...)`) kills it, and so does pointing writes at
the player slot. `enterDev` writes DEV_SNAPSHOT before `save.dev = true`, so no dev write can precede
the snapshot.
- proof 12: met — `npm run tasks -- merge-ready` on this HEAD reports `npm test ok pass`. On top of that,
play-cli.test.ts "creates no dev slot while the mode is off (c12)" drives save, load, restore, export
and wait with `/autosave 1` and a clock that passes 5s between each, then asserts the directory holds
exactly `autosave.slot` and `player.slot`; `return save.dev ? DEV_SLOT : PLAYER_SLOT` ->
`return DEV_SLOT` is KILLED by it. saveSlots.test.ts "creates no dev slot at all while the mode is off"
asserts the same at the store level.
- proof 13: met — `saveReport` (src/runtime/saveSlots.ts:143-150) answers dev, live slot, cadence and every
slot's stamp, and every line the terminal prints comes off it (`slotStanding`,
src/runtime/command.ts:643-651). Two aimed mutations, both KILLED by play-cli.test.ts "answers which
slot is live and whether the mode is on, rather than leaving it to be inferred (c13)": pinning
`report.slot` to PLAYER_SLOT inside the report, and having the renderer override `dev` and
`autosaveSeconds` with a copy of its own. A slot the store cannot read reports `writtenAt: null`
rather than failing the whole report (saveSlots.test.ts "reports a slot it cannot read as one with no
date").
- proof 14: unmet — The derivation over SAVE_FIELDS is real and works: save.test.ts walks
`Object.entries(SAVE_FIELDS)` and per field asserts `holds(sparsest)` and that `loadSave` accepts it,
and `sparsest` is a column of a `Record<SaveField, ...>`, so a new GameState field is a compile error
until somebody fills it in. Five aimed mutations KILLED, two of which prove the walk consults each
field's own `holds` against that field's own sample. But the derivation stops at the top level:
`isActiveAction` (src/runtime/save.ts:72-79) is a hand-written list of ActiveAction's fields and it
omits `roster`, which `ActiveAction` declares (src/runtime/encounter.ts:31) and which `seatedAction`
and `armedAction` destructure without asking. Reproduce with
npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass1-probe3.ts
 -- `SAVE_FIELDS.activeAction.holds({...,roster:{player:3}})` returns true, `checkSave` and `loadSave`
both accept it, and the `view()` that follows raises `TypeError: Cannot read properties of undefined
(reading 'indexOf')` out of encounter.ts:138: a raw TypeError from a payload the gate that exists to
prevent one waved through. The clause is universal over fields; the check is not universal over the
fields of the objects those fields hold, and nothing makes it grow when ActiveAction or Seat does.
- proof 15: met — `npm run tasks -- merge-ready` on 886350d: tsc ok, npm test ok, layer-check ok,
audit-status ok, doctor ok (23 warnings, which the leg does not fail on), bytes ok, tree ok (nothing
uncommitted), base ok. All six legs the clause names pass. The two legs that do not -- `spec` (one open
member) and `clauses` (no recorded audit pass) -- are the ones this pass exists to close and are not
among the six.

### Pass 2 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `718cd5c021068183986b0ff3fa6f71e928be0568`
- proof 1: met — Two aimed mutations on src/runtime/store.ts, both KILLED by src/runtime/store.test.ts.
  Deleting `driver.remove(name)` from the store's remove arm is killed by "reads, writes, removes
  and lists, and an absent slot is nothing rather than a raise", which proves the store owns none
  of the four verbs itself and hands each to the driver. Making the write arm round-trip the
  payload through `JSON.parse`/`JSON.stringify` on the way to the driver is killed by "never
  parses a payload: what the store holds is the driver text it was handed" and by seven more in
  that file, so the opacity of the payload is a property the file measures rather than states.
  The no-I/O half is derived rather than listed: store.test.ts asserts store.ts's import list
  equals exactly `['./runtime']`, so an import of `node:fs` added next month fails it without
  anyone editing the test. Re-read at HEAD: src/runtime/store.ts is 80 lines, imports only
  `RuntimeError`, and its four verbs read/write/remove/list opaque `string` payloads.
- proof 2: met — Two aimed mutations, both KILLED by src/runtime/store.test.ts. `writtenAt: now()` to
  `writtenAt: 0` is killed by "stamps the write off the clock it was built with". Folding the
  stamp into the payload on the way to the driver (writing `{writtenAt, payload: JSON.stringify({
  writtenAt, inner: payload })}`) is killed by "stamps a payload that carries no stamp of its
  own, and leaves it carrying none", which writes one fixture into two slots 60s apart and
  asserts the payloads are equal while the stamps differ by 60_000, so a stamp riding inside the
  exported bytes cannot pass. `slotStore` (src/runtime/store.ts:52-70) is the only place a stamp
  is laid down, above every driver, so the file store and a browser store cannot stamp differently.
- proof 3: met — One aimed mutation, KILLED. Making `decode` normalise on the way out
  (`payload: parsed.payload.trim()`, src/runtime/store.ts:49) is killed by the parametrised
  round-trip "round-trips \"   \"". The nine payloads that walk that table cover non-JSON, empty,
  whitespace-only, unicode, mixed CRLF/LF and key-order variants of a `# save` body, so the two
  cases a normalising store would silently pass are in the table rather than absent from it.
- proof 4: met — Four aimed mutations, all KILLED by scripts/play-cli.test.ts against a file-backed
  store over a real temp directory. Deleting `if (seconds === 0) return false` is killed by
  "writes nothing at all until somebody asks for a cadence", which asserts the directory is never
  created at all. `>= seconds * 1000` to `>= seconds` is killed by "measures real seconds since
  the slot was written, and is checked after a command that changed state". Deleting
  `autosaved(ctx)` from the live-run tick (src/runtime/command.ts:1253) is killed by "is checked
  on each live tick, so a long run does not go unsaved until it ends" — so the pass-1 fix that
  removed the tick's carry did not remove the check itself. Deleting the new adoption gate
  `if (!adopts(save, slot)) return { kind: 'held', slot }` is killed by "does not let a reopened
  game overwrite the save it never read". The cadence itself lives in its own `autosave` slot
  holding the text `'30'`, asserted at the file level, which is what makes c1's claim that the
  store is not save-specific a use rather than an assertion. Checked by hand that the new gate
  does not stop a legitimate first save: a run with no `player.slot` on disk adopts by the
  "nothing there to lose" arm and autosave writes normally
  (C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass2-probe3.ts).
- proof 5: met — One aimed mutation, KILLED. Adding `next.time += 1` immediately after
  `standable(registry, next)` inside `loadSaved` (src/runtime/session.ts:413) is killed by
  play-cli.test.ts "leaves the clock at what the payload holds, through a # save, an import and a
  slot" — which is the one function all four spellings converge on, since `/load <id>`, a `# test`
  `load:`, `/import` and `/restore` all reach `loadSaved`. Read the pass-1 fix diff for a clock
  read: neither `standable` nor `pruned` (the two functions this branch added to the load path)
  reads one, and `sessionStatus` publishes `state.time` rather than sourcing it.
  Probe evidence: a payload carrying `"time":9000` loads and the session reports 9000
  (audit-auto-save-export-and-load-pass2-probe5.ts, 16 payloads through `loadSaved`).
- proof 6: met — One aimed mutation, KILLED. Pretty-printing the exported bytes in the `/export` arm
  (src/runtime/command.ts:912) is killed by play-cli.test.ts "prints the bytes serializeSession
  returns and nothing else". `/export`'s whole body is `[serializeSession(ctx.session)]` and
  `/import` is `importPayload(ctx, body, 'Imported.')`, so there is one serialization on both
  sides; `grep serializeSave` finds it called only by `serializeSession` and `migrate-saves.ts`,
  so no second one was written by this branch.
- proof 7: met — Pass 1 recorded this unmet on one reproduction: a `player.slot` holding an
  `activeAction` with a `roster` the gate waved through bricked the session with the bad state
  already adopted. I re-ran that exact payload myself against a real file-backed store
  (C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass2-probe7.ts): `/restore`
  now answers `save field activeAction holds {...}`, `serializeSession` before and after the
  refusal are identical, and `view()` still works afterwards. The three enumerated cases answer
  in the same run: absent gives "slot player holds nothing.", empty gives "slot player is empty",
  unparseable gives "slot player does not parse", and a slot holding text that is not a save body
  gives "that is not a # save body: ...", with the session byte-identical through all four.
  The clause's leading sentence — a payload that loads and still cannot be played — is delivered
  by `standable` (src/runtime/session.ts:428-436), asked before the state is copied in: deleting
  that call is KILLED by play-cli.test.ts "leaves the session standing when a payload loads but
  cannot be drawn". Hunted for a payload that still escapes as a raw throw: 18 hostile shapes
  that get past `checkSave` (rosters naming missing owners, seats with dotless ownerRefs, travel
  ownerRefs with no pair, cadences for missing entities, journeys to nowhere, equipped instances
  that are not in the table, a location that does not exist) all come back as a RuntimeError or
  load cleanly, and none escapes
  (audit-auto-save-export-and-load-pass2-probe5.ts, `escaped: []`).
  The other half of the pass-1 fix — moving `view()` inside `importPayload`'s try — is filed as a
  finding rather than counted here: its mutation SURVIVED the whole suite, and the guard cannot
  deliver what its comment claims because `loadSaved` has already copied the state in by then.
- proof 8: met — One aimed mutation, KILLED: deleting `writeFileSync(file, text, 'utf8')` from
  scripts/lib/slotFile.ts is killed by play-cli.test.ts "keeps the slots as files, which is the
  store a player would have", so the clauses proved through play-cli are proved against files on
  disk rather than a convenient in-memory driver. c4-c7 and c9-c13 all prove through
  `fileSaves(dir)` over a real temp directory and read the `.slot` files back off disk. No
  browser adapter ships, and that is derived rather than listed: "ships no browser adapter and no
  stub of one" walks `src/ui` recursively and asserts no `.ts`/`.tsx` there imports store,
  saveSlots or slotFile, so a stub added next month fails it. Confirmed independently:
  `git diff 878a05b..718cd5c --stat` touches no file under src/ui, and the pass-1 fix diff
  (886350d..718cd5c) touches none either.
- proof 9: unmet — The reproduction pass 1 filed is fixed, and I confirmed that myself: with a
  `player.slot` holding 1 gold, ten commands in dev take the session to 11, `/dev off` puts both
  the slot and the session back to 1 gold, and the command afterwards — the one the leak used to
  show up on — writes 2 gold rather than 12
  (C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass2-probe4.ts). Three
  aimed mutations back it: replacing `importPayload(ctx, restored, ...)` in `devOff` with a bare
  note is KILLED by "puts the session back with the slot on the way out of dev, so nothing done
  in dev survives it"; deleting the `save.store.write(PLAYER_SLOT, held)` restore is KILLED;
  deleting `adoptedBy(save).delete(PLAYER_SLOT)` from `leaveDev` is KILLED by saveSlots.test.ts
  "holds the player slot again the moment dev mode is left".
  The clause still fails on the branch the fix did not reach: when there was no `player` slot at
  the moment dev was entered. `adopts` (src/runtime/saveSlots.ts:57) returns true for any slot
  the store reads as null, so un-adopting `player` on the way out buys nothing while the slot is
  absent. Reproduce with
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass2-probe3.ts
  a player who has never saved turns `/autosave 1` on, enters dev, takes the session to 20 gold,
  and leaves; `/dev off` reports "There was no player slot to come back to, so this session is
  left as it is"; one ordinary command later `player.slot` holds
  `{"version":11,"inventory":{"gold":21},...}`. The clause's own words — "anything done in
  between ... is gone on exit" — fail one command after the mode is off, exactly as in pass 1,
  and both the source comment at src/runtime/command.ts:684 ("`player` stays unadopted, so
  nothing it does can reach it") and the Decisions paragraph it restates assert a mechanism the
  code does not have.
- proof 10: met — One aimed mutation, KILLED: collapsing `liveSlot` to `return PLAYER_SLOT`
  (src/runtime/saveSlots.ts:61) is killed by play-cli.test.ts "snapshots the player slot on the
  way in and restores it byte-identically on the way out", which turns `/autosave 1` on inside
  dev, passes 60s, plays, and asserts the dev slot holds the current session while the player
  slot still holds what was played before entry. `liveSlot` is the single answer `saveNow`,
  `autosave` and `saveReport` all write and report through, so this is c4's cadence pointed at
  one slot rather than a second cadence. Confirmed independently in probe3 and probe4: while dev
  was on, `player.slot` held exactly what it held at entry across 10 and 20 commands respectively.
  The leak probe3 finds happens after the mode is off, which is c9's scope and not this clause's.
- proof 11: met — One aimed mutation, KILLED: holding the snapshot in memory rather than writing it
  (`void encodeSnapshot(...)` in place of `save.store.write(DEV_SNAPSHOT_SLOT, ...)`,
  src/runtime/saveSlots.ts:144) is killed by play-cli.test.ts "loses nothing when the process
  dies in dev, without an orderly exit", which never calls `/dev off` and rebuilds a second
  SaveContext over the same directory, so the restarted context reads the player slot and the
  snapshot back off disk. Read at HEAD: `enterDev` writes DEV_SNAPSHOT before `save.dev = true`,
  so no dev write can precede the snapshot, and the pass-1 fix added only
  `adoptedBy(save).delete(DEV_SLOT)` between them, which touches nothing on disk.
- proof 12: met — `npm run tasks -- merge-ready` at 718cd5c reports `npm test ok pass`, which is the
  clause's own proof target. On top of that, one aimed mutation KILLED:
  `return save.dev ? DEV_SLOT : PLAYER_SLOT` to `return DEV_SLOT` is killed by play-cli.test.ts
  "creates no dev slot while the mode is off (c12)", which drives save, load, restore, export and
  wait with `/autosave 1` and a clock that passes 5s between each, then asserts the directory
  holds exactly `autosave.slot` and `player.slot`. Confirmed by hand in probe1 and probe3: every
  run that never said `/dev on` left a directory holding only `autosave.slot` and `player.slot`.
- proof 13: met — Two aimed mutations, both KILLED. Pinning the report's new field
  (`adopted: adopts(save, liveSlot(save))` to `adopted: true`, src/runtime/saveSlots.ts:203) is
  killed by play-cli.test.ts "says which it is when asked", which reopens the game over the same
  directory and asserts the reopened session says so. Having the renderer write its own sentence
  instead of the report's (`slotStanding`, src/runtime/command.ts:652) is killed by "answers
  which slot is live and whether the mode is on, rather than leaving it to be inferred (c13)".
  Read at HEAD: every line `slotStanding` prints comes off `saveReport`, and `SaveReport` now
  carries dev, live slot, adoption, cadence and every slot's stamp, so the later surface holds no
  copy. Confirmed by hand in probe2: `saveReport` answered
  `{dev:false, slot:'player', adopted:true, autosaveSeconds:30, slots:[...]}` off a real
  directory. One case where the report refuses instead of answering is filed as a finding rather
  than graded here: an unreadable live slot in a session that has adopted nothing makes
  `saveReport` raise, which is a regression against what pass 1 recorded for this clause.
- proof 14: met — The derivation is real and I re-checked it: save.test.ts "walks every field a save
  carries" iterates `Object.entries(SAVE_FIELDS)` and per field asserts `holds(sparsest)` and
  that `loadSave` accepts it, with `sparsest` a column of a `Record<SaveField, SaveFieldRule>`,
  so a new `GameState` field is a compile error until somebody fills it in. Mutating the gate's
  own dispatch so `rule.holds(value)` can never refuse is KILLED by "refuses the shapes that used
  to reach the loader, naming the field rather than raising from inside it".
  Pass 1's reproduction is closed: `roster` is now checked by name, and removing
  `optional(value, 'roster', (held) => everyValue(held, isSeat))` (src/runtime/save.ts:88) is
  KILLED by the play-cli c7 row that feeds `roster: {"player": 3}` through a real slot. I
  reproduced it myself through `/restore` off disk rather than re-running theirs: the payload is
  refused as `save field activeAction ...` and the session is byte-identical afterwards
  (audit-auto-save-export-and-load-pass2-probe7.ts).
  What makes the clause universal rather than one more name on a list is the backstop, and it is
  mutation-proved too: replacing `pruned`'s conversion with `throw error` (src/runtime/save.ts:311)
  is KILLED by save.test.ts "turns a raise from below the checks into a diagnostic, whatever
  raised". I hunted the next neighbour rather than trusting that: 18 payloads that pass
  `checkSave` and reach into what the pruner and the screen read across — seats naming missing
  owners, a seat whose ownerRef carries no dot, a roster entry for an actor nobody seated, actors
  holding an unknown resource, a one-sided travel ownerRef, a cadence for a missing entity — were
  pushed through `loadSaved` and then `view()`. None escaped as anything but a RuntimeError:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass2-probe5.ts
  prints `escaped: []`. Note for the record that the backstop's diagnostic does not name a field
  ("this save cannot be loaded: <the raw message>"); the Decisions section settles that
  deliberately, so it is recorded rather than graded.
- proof 15: met — `npm run tasks -- merge-ready` at 718cd5c: tsc ok pass, npm test ok pass,
  layer-check ok pass, audit-status ok pass, doctor ok pass (23 warnings, which that leg does not
  fail on), bytes ok pass, tree ok pass (nothing uncommitted), base ok pass. All six legs the
  clause names pass. The two legs that fail — `spec` (one open member) and `clauses` (c7, c9, c14
  outstanding from pass 1) — are the ones this pass exists to move and are not among the six.

### Pass 3 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `1a59d985af45287459a38887068bb7f22a72dd0c`
- proof 1: met — Three aimed mutations on src/runtime/store.ts, all KILLED by src/runtime/store.test.ts and
  re-run at their own file with the mutant still applied. Deleting `driver.remove(name)` is killed by
  "reads, writes, removes and lists, and an absent slot is nothing rather than a raise", so the store
  owns none of the four verbs itself. Making the write arm spread `JSON.parse(payload)` into the
  envelope is killed by "never parses a payload: what the store holds is the driver text it was
  handed". The no-I/O half is derived rather than listed: adding `import { readFileSync } from
  'node:fs'` is killed by "reaches neither a save nor the filesystem", which asserts store.ts's
  import list equals exactly ['./runtime'], so an import added next month fails it with no test edit.
  Read at HEAD: src/runtime/store.ts is 80 lines, imports only RuntimeError, and its four verbs move
  opaque `string` payloads. Re-run: npm run mutate -- C:\Users\yonat\AppData\Local\Temp\mutations-auto-save-export-and-load-pass3.json
- proof 2: met — Two aimed mutations, both KILLED. `writtenAt: now()` to `writtenAt: 0` is killed by
  store.test.ts "stamps the write off the clock it was built with". Folding the stamp into the
  payload on the way to the driver is killed by "stamps a payload that carries no stamp of its own,
  and leaves it carrying none", which writes one fixture into two slots 60s apart and asserts the
  payloads are equal while the stamps differ, so a stamp riding inside the exported bytes cannot
  pass. `slotStore` (src/runtime/store.ts:52-70) is the only place a stamp is laid down and it sits
  above every driver, so a file store and a browser store cannot stamp differently. Confirmed by
  hand in probe3: the payload read back off `player.slot` is exactly `serializeSession`'s bytes with
  no stamp in them.
- proof 3: met — One aimed mutation, KILLED. Making `decode` normalise on the way out
  (`parsed.payload.trim()`, src/runtime/store.ts:49) is killed by two of the parametrised
  round-trips, named in the run: `round-trips "   "` and `round-trips "line one\nline two\r\nline
  three\n"`. The table covers non-JSON, empty, whitespace-only, unicode, mixed CRLF/LF and key-order
  variants, so both cases a normalising store would silently pass are in it rather than absent.
- proof 4: met — Five aimed mutations, all KILLED by scripts/play-cli.test.ts against fileSaves(dir) over
  a real temp directory. Deleting `if (seconds === 0) return false` is killed by "writes nothing at
  all until somebody asks for a cadence", which asserts the directory is never created. `>= seconds *
  1000` to `>= seconds` is killed by "measures real seconds since the slot was written". Deleting the
  `result.recorded.length === 0` guard is killed by "is not checked after a command that changed
  nothing"; deleting `autosaved(ctx)` from the live tick is killed by "is checked on each live tick".
  Deleting the adoption gate `if (!adopts(save, slot)) return { kind: 'held', slot }` is killed by
  "does not let a reopened game overwrite the save it never read". The cadence lives in its own
  `autosave` slot holding the text '30', asserted at the file level. Checked over-strictness myself
  rather than trusting the gate: probe3 case D drives a brand-new game with no player.slot on disk —
  the first autosave writes normally with no message, the second writes gold 2, a reopened context is
  held *with a warn message*, `/restore` picks the slot up and writing resumes at gold 3. So the
  is/isNot pair refuses no legitimate save.
  Probe: C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass3-probe3.ts
- proof 5: met — Two aimed mutations, both KILLED. Adding `next.time += (Date.now() % 1000) + 1` after
  `standable(registry, next)` inside `loadSaved` (src/runtime/session.ts:413) is killed by
  play-cli.test.ts "leaves the clock at what the payload holds, through a # save, an import and a
  slot" — the one function all four spellings converge on, since `/load <id>`, a `# test` `load:`,
  `/import` and `/restore` all reach `loadSaved`. Sourcing `time` from `Date.now()` inside
  `loadSave`'s field copy (src/runtime/save.ts:329) is killed by save.test.ts "leaves state.time at
  exactly what the payload holds". Read the pass-2..HEAD diff for a new clock read on the load path:
  the only source change to that path is `importPayload`'s try boundary moving, and neither arm
  reads one.
- proof 6: met — Two aimed mutations, both KILLED. Pretty-printing the exported bytes in the `/export`
  arm is killed by play-cli.test.ts "prints the bytes serializeSession returns and nothing else".
  Making `/import` a no-op note is killed by "takes its own output back through /import, to the same
  bytes". `/export`'s whole body is `[serializeSession(ctx.session)]` and `/import` is
  `importPayload(ctx, body, 'Imported.')`, so there is one serialization on both sides. Confirmed by
  hand in the command-table sweep: `/export` inside dev mode prints the dev session and writes
  nothing anywhere.
- proof 7: met — Four aimed mutations, all KILLED. Making `loadSaved` build over the live state rather
  than beside it (`const next = internals.state`) is killed by "leaves the session standing when a
  payload gets past the checks and raises below them". Deleting `standable(registry, next)` is killed
  by "leaves the session standing when a payload loads but cannot be drawn" — the clause's leading
  sentence, which pass 1 graded unmet. Removing `withSaves`'s catch is killed by "says so when the
  live slot is absent, empty or unreadable, and plays on". I checked the enumerated three myself off
  a real directory rather than re-running pass 2's probe: a `player.slot` holding raw `{{{ truncated`
  answers `slot player does not parse` through both `/restore` and `/dev on`, and the bytes are still
  on disk afterwards, byte for byte
  (C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass3-probe1.ts, and the c9
  sweep's 108th case). One route where the branch does *not* say why is filed as a HIGH finding
  below: autosave's own entitlement check now converts "cannot read" into "nothing to lose".
- proof 8: met — One aimed mutation, KILLED: deleting `writeFileSync(file, text, 'utf8')` from
  scripts/lib/slotFile.ts is killed by play-cli.test.ts "keeps the slots as files, which is the store
  a player would have". Every clause I graded through play-cli here was graded against fileSaves(dir)
  over a real temp directory, and my own three probes drive `fileSlots` and read the `.slot` files
  back off disk. No browser adapter ships, derived rather than listed: "ships no browser adapter and
  no stub of one" walks src/ui recursively and asserts no .ts/.tsx there imports store, saveSlots or
  slotFile. Confirmed independently: `git diff 878a05b..1a59d98 --stat` touches no file under src/ui,
  and neither does the pass-3 window `git diff 718cd5c..1a59d98`.
- proof 9: met — Graded on a derivation I built myself, because the branch's is not one. Two passes
  graded this unmet on one reproduction each, so I did not hunt a third instance: I derived the
  subjects from the two things that actually vary and drove the whole cross. The acts a dev session
  can perform are not a hand-listed four — they are `COMMANDS`, the same table `handleCommand`
  dispatches through — so the sweep is every entry of COMMANDS (27, each with a plausible argument)
  driven inside dev, from every state the player's slot can be in at entry (4, including one the
  branch's own table does not have: bytes that are a readable slot but not a loadable save). 108
  cases. For each: 20 commands in dev with `/autosave 1`, the command under test, `/dev off`, then
  the player's slot compared byte for byte against what it held at entry, then five more ordinary
  commands with the slot re-read after each. Result: `leaks: []` — not one case where the slot
  differed at exit, and not one where dev's session reached it afterwards.
  Re-run: npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass3-probe2.ts
  Nine aimed mutations back the mechanism, all KILLED and re-run at their own file with the mutant
  still applied: deleting the DEV_SNAPSHOT write; deleting the restore write; deleting the
  `if (current) save.store.remove(PLAYER_SLOT)` arm; replacing `withhold(save, PLAYER_SLOT)` with the
  pass-1 spelling `standingOf(save).is.delete(PLAYER_SLOT)` (killed by "entering on nothing at all,
  having played" — which is pass 2's exact reproduction, now watched); dropping `!standing.isNot.has
  (slot) &&` from `adopts`; replacing `importPayload` in `devOff` with a bare note; deleting
  `if (!loaded(result)) return result`; and routing `enterDev`'s read through `readable`, killed by
  "refuses to enter at all on a slot it cannot read, and touches nothing".
  Two other states I checked by hand and found correct: a session that crashed in dev leaves the
  player's slot intact, a reopened process reads it, is held with a warning, re-enters dev taking a
  fresh snapshot of the intact slot, and leaves restoring it (probe3 case B); and two dev cycles in
  one session from an absent player slot leave the slot absent through both, with the session at 30
  gold never reaching it (probe3 case C).
  What is graded here is the property, not the file that claims it: the branch's own proof is a
  hand-listed 3x4 with a tautological coverage assertion, filed as a finding below.
- proof 10: met — One aimed mutation, KILLED: collapsing `liveSlot` to `return PLAYER_SLOT`
  (src/runtime/saveSlots.ts:87) is killed by play-cli.test.ts "snapshots the player slot on the way
  in and restores it byte-identically on the way out". `liveSlot` is the single answer `saveNow`,
  `autosave` and `saveReport` all write and report through, so this is c4's cadence pointed at one
  slot rather than a second cadence. Confirmed independently and much more widely by my own sweep:
  across all 108 cases the player's slot at `/dev off` equalled what it held at entry, which includes
  the 20 in-dev autosaves each case ran — every one of which landed in `dev.slot`.
- proof 11: met — One aimed mutation, KILLED: holding the snapshot in memory (`void encodeSnapshot(...)`
  in place of `save.store.write(DEV_SNAPSHOT_SLOT, ...)`) is killed by play-cli.test.ts "loses
  nothing when the process dies in dev, without an orderly exit". Reproduced the crash myself rather
  than trusting it (probe3 case B): a session saves, enters dev, takes 20 gold and the process ends
  with no `/dev off`; the player's slot on disk is byte-identical to what was saved, a second
  SaveContext and session over the same directory read it back, `/slots` reports the mode off and the
  slot not this session's, the first command is held with a warning rather than writing, and `/dev
  on` in the reopened process snapshots the intact slot. Read at HEAD: `enterDev` writes
  DEV_SNAPSHOT before `save.dev = true`, so no dev write can precede the snapshot.
- proof 12: met — `npm run tasks -- merge-ready` at 1a59d98 reports `npm test ok pass`, which is this
  clause's own proof target. One aimed mutation, KILLED: `return save.dev ? DEV_SLOT : PLAYER_SLOT`
  to `return DEV_SLOT` is killed by play-cli.test.ts "creates no dev slot while the mode is off
  (c12)", which drives save, load, restore, export and wait with `/autosave 1` and asserts the
  directory holds exactly autosave.slot and player.slot. Confirmed by hand: probe3 case D never says
  `/dev`, and every run of it left a directory holding only autosave.slot and player.slot.
- proof 13: met — Three aimed mutations, all KILLED. Pinning `slot: liveSlot(save)` to PLAYER_SLOT inside
  the report, and having the renderer override the report's `dev` and `autosaveSeconds` with a copy
  of its own, are both killed by play-cli.test.ts "answers which slot is live and whether the mode is
  on, rather than leaving it to be inferred (c13)". Pinning `adopted: adopts(save, liveSlot(save))`
  to `true` is killed by "says which it is when asked". Read at HEAD: every line `slotStanding`
  (src/runtime/command.ts:648-655) prints comes off `saveReport`, so the later surface holds no copy.
  Confirmed by hand in probe1 and probe3: `/slots` answered `writing dev, dev mode on` from a session
  stuck in dev, and `writing player, dev mode off — this session did not come out of that slot...`
  from a reopened one, both off real directories. Pass 2's finding is closed: an unreadable live slot
  no longer makes the report raise — probe1's `/slots` answers with `player unreadable` in the date
  column while the slot on disk is unparseable.
- proof 14: met — The derivation is real and I re-checked it at HEAD: save.test.ts "walks every field a
  save carries" iterates `Object.entries(SAVE_FIELDS)` and per field asserts `holds(sparsest)` and
  that `loadSave` accepts it, with `sparsest` a column of a `Record<SaveField, SaveFieldRule>`, so a
  new GameState field is a compile error until somebody fills it in. Four aimed mutations, all
  KILLED: gating `activeAction` on `isObject` alone is killed by "refuses the shapes that used to
  reach the loader, naming the field rather than raising from inside it"; emptying activeAction's
  `sparsest` is killed by "admits the sparsest activeAction", which proves the walk consults each
  field's own `holds` against that field's own sample; replacing `pruned`'s conversion with `throw
  error` is killed by "turns a raise from below the checks into a diagnostic, whatever raised", which
  is the backstop that makes the clause universal rather than a longer list of names; and making the
  `roster` check always admit (`everyValue(held, isSeat) || true`) is killed off a real slot by the
  play-cli c7 row that feeds `roster: {"player": 3}` through the file store. Nothing in the pass-3
  window touches src/runtime/save.ts, so this clause's ground did not move.
- proof 15: met — `npm run tasks -- merge-ready` at 1a59d98, run by me: tsc ok pass, npm test ok pass,
  layer-check ok pass, audit-status ok pass, doctor ok pass (23 warnings, which that leg does not
  fail on), bytes ok pass, tree ok pass (nothing uncommitted), base ok pass. All six legs the clause
  names pass. The two that fail — `spec` (one open member) and `clauses` (c9 outstanding from passes
  1 and 2) — are the ones this pass exists to move and are not among the six. `git status` is clean
  at 1a59d98; I modified no tracked file.

### Pass 4 — 2026-08-16

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `a72a74140c627916fc69e95bc97bc3170c3d3106`
- proof 1: met — Two aimed mutations of my own on src/runtime/store.ts, both KILLED by src/runtime/store.test.ts
  and re-measured with the mutant still applied. Replacing `return text === null ? null : decode(name, text)`
  with a hand-built `{ payload: text, writtenAt: 0 }` (the store conjuring a slot rather than reading one
  through the driver) is killed by "reads, writes, removes and lists, and an absent slot is nothing rather
  than a raise"; `return [...driver.names()].sort()` to `return []` is killed by the same test. The four
  verbs are the whole of `SlotStore` and none of them is save-shaped; store.ts imports only './runtime',
  which store.test.ts asserts structurally. Re-run:
  npm run mutate -- C:\Users\yonat\AppData\Local\Temp\mutations-auto-save-export-and-load-pass4-aimed.json
- proof 2: met — Two aimed mutations, both KILLED. `return { payload: parsed.payload, writtenAt: parsed.writtenAt }`
  to `writtenAt: 0` (the stamp not coming back off the slot) is killed by store.test.ts "stamps the write off
  the clock it was built with"; `{ writtenAt: now(), payload }` to `{ writtenAt: 1, payload }` is killed by
  "stamps a payload that carries no stamp of its own, and leaves it carrying none", which writes one fixture
  into two slots 60s apart and asserts the payloads equal while the stamps differ, so a stamp riding inside
  the exported bytes cannot pass. Same manifest as proof 1.
- proof 3: met — One aimed mutation, KILLED. `parsed.payload` to `parsed.payload.trim()` in `decode` is killed by
  the parametrised store.test.ts round-trip `round-trips "   "`. I read the nine payloads in that table
  myself: non-JSON, empty, whitespace-only, unicode, mixed CRLF/LF and key-order variants, so a normalising
  store has no way through. Same manifest.
- proof 4: met — One aimed mutation, KILLED, and I checked the cadence really is a slot. `save.now() - writtenAt
  >= seconds * 1000` to `>= seconds` is killed by scripts/play-cli.test.ts "measures real seconds since the
  slot was written, and is checked after a command that changed state", re-measured at its own file. Zero
  means never is `if (seconds === 0) return false` in `autosaveDue`; probe G of my own run
  (audit-auto-save-export-and-load-pass4-probes2.js) shows the cadence living in `autosave.slot` beside
  `player.slot` on disk, and `settle` fires the check only on `result.recorded.length > 0`. Same manifest.
- proof 5: met — One aimed mutation, KILLED. `Object.assign(internals.state, next)` to
  `Object.assign(internals.state, { ...next, time: next.time + 1 })` inside `loadSaved` is killed by
  play-cli.test.ts "leaves the clock at what the payload holds, through a # save, an import and a slot".
  I re-read the four spellings myself: `/load <id>` and a `# test` `load:` both reach performDirective's
  'load' arm, which calls `loadSaved` (src/runtime/session.ts:400-419), and `/import` and `/restore` reach
  the same function through `importPayload`. Nothing on that path reads a clock. Same manifest.
- proof 6: met — One aimed mutation, KILLED. Pretty-printing what `/export` prints
  (`[serializeSession(ctx.session)]` to `[JSON.stringify(JSON.parse(...), null, 2)]`, command.ts:934) is
  killed by play-cli.test.ts "prints the bytes serializeSession returns and nothing else". The neighbouring
  test pastes the printed line verbatim into `/dsl save <id>` and reloads it, and a grep for `serializeSave`
  finds one caller chain, so there is no second serialization. Same manifest.
- proof 7: met — Two aimed mutations, both KILLED. `const next = createGameState(...)` to
  `const next = internals.state` (a load built over the live session rather than beside it) is killed by
  play-cli.test.ts "leaves the session standing when a payload gets past the checks and raises below them";
  removing `standable(registry, next)` is killed by "leaves the session standing when a payload loads but
  cannot be drawn", so the second backstop is watched as well as the first. I reproduced the three named
  slot states through the file driver myself: an absent slot answers "slot player holds nothing", an empty
  and an unparseable one answer "slot player does not parse", each a message with the session playing on.
  One case falls outside the clause's three words and crashes instead: see finding 3. Same manifest.
- proof 8: met — Two aimed mutations, both KILLED by play-cli.test.ts "keeps the slots as files, which is the
  store a player would have": deleting `writeFileSync(staging, text, 'utf8')` and deleting
  `renameSync(staging, file)` from scripts/lib/slotFile.ts, so both halves of the new staged write are
  watched. I confirmed independently that no browser adapter ships: `git diff 878a05b..HEAD --stat` touches
  no file under src/ui, and the test walks src/ui recursively for an import of store/saveSlots/slotFile
  rather than listing files. Every clause above is proved through play-cli against `fileSaves(dir)` over a
  real temp directory. Same manifest.
- proof 9: met — One aimed mutation, KILLED by the derivation itself: `withhold(save, PLAYER_SLOT)` to
  `adopted(save, PLAYER_SLOT)` in `leaveDev` is killed by play-cli.test.ts "over every line the command
  table takes, entering on nothing at all", re-measured at its own file. The derivation is real rather than
  a bigger enumeration, and I checked the one way it could have been hollow: `/import ${MARKED}` genuinely
  lands (the session reads gold 999 after it), so the mark the leak check hunts for is really in the dev
  session, and the acts come off `COMMANDS`. I then hunted a route the two axes cannot reach by enumerating
  every write in the diff instead: `saveNow`, `autosave` and `setAutosaveSeconds` write `liveSlot` or the
  cadence slot, and `enterDev` writes only the snapshot, so `leaveDev` is the only writer of PLAYER_SLOT
  while the mode is on and the walk covers it. Probe H of mine adds the case the four entry states cannot
  hold: a player's slot corrupted *during* dev is restored byte-identically on the way out
  (`JSON.parse(after).payload === JSON.parse(before).payload` is true). Two limits worth recording rather
  than grading down: the walk gives each command only `''` and `'1'` as arguments, so most entries refuse
  rather than act; and removing `save.store.write(PLAYER_SLOT, held)` survives the walk and is killed by a
  neighbour in the same proof file ("puts the slot back on the way out even when something spoiled it while
  dev was on"), so the walk sees the leak direction and not the restore direction.
- proof 10: met — One aimed mutation, KILLED. `return save.dev ? DEV_SLOT : PLAYER_SLOT` to `return PLAYER_SLOT`
  is killed by play-cli.test.ts "snapshots the player slot on the way in and restores it byte-identically on
  the way out", which turns the cadence on inside dev, passes the clock and asserts the dev slot holds the
  current session while the player's still holds what was played before entry. `liveSlot` is the single
  answer both `saveNow` and `autosave` write through, which I checked by grep, so the isolation half holds
  unconditionally. The other half, that a write in dev reaches the dev slot, is dead from the second dev
  session onward: that is finding 1. Graded met because the clause's purpose is isolation and that never
  fails, but the finding is a regression against 718cd5c and I would fix it before merge. Same manifest.
- proof 11: met — One aimed mutation, KILLED. `save.store.write(DEV_SNAPSHOT_SLOT, encodeSnapshot(...))` to
  `void encodeSnapshot(...)` (the snapshot held in memory instead of on disk) is killed by play-cli.test.ts
  "loses nothing when the process dies in dev, without an orderly exit", which never calls `/dev off` and
  rebuilds a second SaveContext over the same directory. I read the order myself: `enterDev` writes the
  snapshot before `save.dev = true`, so no dev write can precede it, and probe B of mine shows both
  `player.slot` and `dev-snapshot.slot` on disk while the mode is on. Same manifest.
- proof 12: met — One aimed mutation of my own, KILLED, plus a run. `createSaveContext` returning `dev: true`
  instead of `dev: false` is killed by play-cli.test.ts "creates no dev slot while the mode is off (c12)",
  re-measured at its own file, so "a context nobody put into dev mode is not in it" is watched rather than
  assumed. Probe G of mine drives `/autosave 1`, `/save` and a world-changing command with the mode off and
  reads the directory back: exactly `autosave.slot` and `player.slot`, no dev slot and no snapshot. On the
  question the brief raised, a dev slot outliving the mode is never reachable while the mode is off
  (`liveSlot` is PLAYER_SLOT and nothing reads DEV_SLOT outside dev), so c12 stands; what it breaks is the
  *next* dev session, which is finding 1 and belongs to c10. `npm run tasks -- merge-ready` at HEAD, run by
  me, reports `npm test ok pass`.
- proof 13: met — One aimed mutation, KILLED. `writes: writesLive(save)` to `writes: 'yes'` in `saveReport` is
  killed by play-cli.test.ts "says which it is when asked" and "leaves dev with the slot back and the
  session where it is when the snapshot will not load", re-measured at the proof file the clause names. I
  checked the surface holds no second copy: command.ts's `slotStanding` builds all three lines off
  `saveReport`, and `WHY_NOT` is one sentence per `SlotWrites` answer rather than a re-derivation. Probe A
  of mine finds the one question the report cannot answer at all: an unreadable *cadence* slot makes
  `saveReport` raise and the whole answer disappear, which is finding 2. Same manifest.
- proof 14: met — Two aimed mutations, both KILLED, and I re-read the derivation. Replacing the RuntimeError
  `pruned` raises with a bare `throw error` is killed by save.test.ts "turns a raise from below the checks
  into a diagnostic, whatever raised", which stubs `registry.locations.has` to throw a TypeError so the case
  is a raise from *below* the named checks rather than one of them. Weakening one field's gate back to what
  it was (`player`'s `holds: isPlayer` to `holds: isObject`) is killed by "refuses the shapes that used to
  reach the loader, naming the field rather than raising from inside it". The derivation is genuine:
  `Object.entries(SAVE_FIELDS)` supplies the subjects and each field's own `sparsest` supplies the sample,
  so a field added next month is walked by the table entry the compiler already forces somebody to write,
  with no edit to the test. Same manifest.
- proof 15: met — `npm run tasks -- merge-ready` at 9055116, run by me: tsc ok pass, npm test ok pass,
  layer-check ok pass, audit-status ok pass, doctor ok pass (23 warnings, which that leg does not fail on),
  bytes ok pass, tree ok pass. All six legs the clause names pass. Two legs outside those six report FAIL
  and are expected here: `base` wants `git merge main` because main has moved past the merge base, and
  `spec` counts the member still in-progress, which is what closing it after this pass clears.

### Pass 5 — 2026-08-17

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `3e6232a3f1a6937aad578761e8b603e240ac8b91`
- proof 1: met — Two aimed mutations of my own on src/runtime/store.ts, both KILLED and re-measured at
  their own file with the mutant still applied. `driver.remove(name)` to `void name` is killed by
  src/runtime/store.test.ts "reads, writes, removes and lists, and an absent slot is nothing rather
  than a raise", so the store owns none of the four verbs itself. The no-I/O half stays derived
  rather than listed: store.test.ts asserts store.ts's import list equals exactly ['./runtime'].
  Read at HEAD: src/runtime/store.ts is 80 lines, its four verbs move opaque `string` payloads, and
  nothing in `SlotStore` is save-shaped. Re-run:
  npm run mutate -- C:\Users\yonat\AppData\Local\Temp\mutations-auto-save-export-and-load-pass5.json
- proof 2: met — One aimed mutation, KILLED. `const slot: Slot = { writtenAt: now(), payload }` to
  `writtenAt: 0` in `slotStore`'s write arm is killed by store.test.ts "stamps the write off the
  clock it was built with", re-measured at its own file. `slotStore` (src/runtime/store.ts:52-70) is
  the only place a stamp is laid down and it sits above every driver, so a file store and a browser
  store cannot stamp differently. Confirmed by hand in my probe1: the payload read back off
  `player.slot` is `serializeSession`'s bytes with no stamp inside them. Same manifest as c1.
- proof 3: met — One aimed mutation, KILLED by two named rows. `parsed.payload` to `parsed.payload.trim()`
  in `decode` (src/runtime/store.ts:49) is killed by store.test.ts `round-trips "   "` and the mixed
  CRLF/LF row, so both cases a normalising store would silently pass are in the parametrised table
  rather than absent from it. Same manifest.
- proof 4: met — One aimed mutation, KILLED. `if (seconds === 0) return false` to `return true` in
  `autosaveDue` (src/runtime/saveSlots.ts:137) is killed by scripts/play-cli.test.ts "writes nothing
  at all until somebody asks for a cadence", which asserts the saves directory is never created at
  all, against `fileSaves(dir)` over a real temp directory. The cadence is a slot in its own right:
  my probe1 read `autosave.slot` off disk beside `player.slot`, and `settle`
  (src/runtime/command.ts:1125-1133) fires the check only on `result.recorded.length > 0`. One route
  the cadence is not watched on is filed as finding 3 rather than graded down here: the `unreadable`
  arm of `cadenceOrNone` survives the whole suite. Same manifest.
- proof 5: met — One aimed mutation, KILLED. `Object.assign(internals.state, next)` to
  `Object.assign(internals.state, { ...next, time: next.time + 1 })` inside `loadSaved`
  (src/runtime/session.ts:418) is killed by play-cli.test.ts "leaves the clock at what the payload
  holds, through a # save, an import and a slot". I re-read the spellings at HEAD: `/load <id>` and a
  `# test` `load:` reach performDirective's 'load' arm, `/import` and `/restore` reach
  `importPayload`, and `/dev on` and `/dev off` now reach it too — all six converge on `loadSaved`,
  and nothing on that path reads a clock. Same manifest.
- proof 6: met — One aimed mutation, KILLED. Pretty-printing what `/export` prints
  (src/runtime/command.ts:953) is killed by play-cli.test.ts "prints the bytes serializeSession
  returns and nothing else". `/export`'s whole body is `[serializeSession(ctx.session)]`, `/import`
  is `importPayload(ctx, body, 'Imported.')`, and the neighbouring test pastes the printed line
  verbatim into `/dsl save <id>` and reloads it. No second serialization was added in this window.
  Same manifest.
- proof 7: met — Two aimed mutations, both KILLED. Removing `standable(registry, next)` from `loadSaved`
  (src/runtime/session.ts:413) is killed by play-cli.test.ts "leaves the session standing when a
  payload loads but cannot be drawn" — the clause's leading sentence, which pass 1 graded unmet.
  Making the file driver's `attempting` wrapper rethrow the raw filesystem error rather than a
  `RuntimeError` (scripts/lib/slotFile.ts:50) is KILLED by five named rows, four of them the new
  "a filesystem that refuses reaches the command table as a message (c7)" table — so the pass-5
  wrapper is watched on every verb rather than only on `write`. I drove the three named slot states
  myself off a real directory in probe2: absent, empty and unparseable each answer with a message
  and the session plays on. What a *failing write* does on the way out of dev is outside this
  clause's three words and is filed as finding 2. Same manifest, plus
  C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass5-probe2.js
- proof 8: met — One aimed mutation, KILLED: `renameSync(staging, file)` to `void file` in
  scripts/lib/slotFile.ts is killed by play-cli.test.ts "keeps the slots as files, which is the store
  a player would have", so the staged write's second half is watched and the clauses proved through
  play-cli are proved against files on disk. Every probe of mine drove `fileSlots` over a real temp
  directory and read the `.slot` files back with `readFileSync`. No browser adapter ships, derived
  rather than listed: the test walks src/ui recursively for an import of store/saveSlots/slotFile.
  Confirmed independently: `git diff 878a05b..HEAD --stat` touches no file under src/ui, and neither
  does the pass-5 window `git diff 9055116..HEAD`. Same manifest.
- proof 9: met — Graded on a derivation of my own, over the axis pass 4's walk cannot reach. The branch's
  walk enters dev once, from four player-slot states, over every COMMANDS entry — and because each
  case gets a fresh temp directory the dev slot is always empty at entry, so the pass-5 change that
  makes `/dev on` *load* a payload is never walked by it. I drove the missing axis: four player-slot
  states at entry crossed with three states the dev slot can be in at a *second* entry (emptied by
  the first visit, left as the first visit wrote it, bytes nothing can read), two full dev cycles per
  case with `/autosave 1`, a `/import` mark of 999 gold inside dev, then the player's slot compared
  byte for byte against what it held at entry and re-read after each of three ordinary commands.
  Twelve cases, `leaks: []` — the player's slot never differed at exit and dev's session never
  reached it afterwards. Re-run:
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass5-probe3.js
  Two aimed mutations back the mechanism: `withhold(save, PLAYER_SLOT)` to `adopted(save,
  PLAYER_SLOT)` in `leaveDev` is KILLED by five named play-cli rows, and turning a missing snapshot
  into `{ kind: 'was-empty' }` (which would *erase* the player's slot rather than leave it) is KILLED
  by saveSlots.test.ts "refuses to leave when the snapshot is gone rather than erasing what it cannot
  restore". The same run shows what the second axis costs: eight of those twelve second visits warn
  that autosave is held, which is finding 1 and belongs to c10.
- proof 10: unmet — The isolation half is met and mutation-proved: `return save.dev ? DEV_SLOT :
  PLAYER_SLOT` to `return PLAYER_SLOT` is KILLED by play-cli.test.ts "snapshots the player slot on
  the way in and restores it byte-identically on the way out", and my twelve-case cross found no
  write reaching the player's slot in either dev cycle. The other half, that *every write goes to the
  dev slot*, is false on a second dev visit whose dev slot is empty, which is pass 4's finding 1 one
  branch over. Pass 4 fixed it by making `/dev on` pick the dev slot up, but it also added
  `withhold(save, DEV_SLOT)` to `leaveDev` and to `devOff`, and nothing takes that withholding back
  on the way in: `enterDev` returns null for an empty dev slot, `devOn` therefore never calls
  `adopted`, and `adopts` refuses because `isNot` still holds `dev` from the previous exit.
  Reproduce (case A, a first dev visit that wrote nothing, then a second):
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass5-probe1.js
  every command in the second visit answers "autosave held: slot dev", `dev.slot` is never created,
  and `/slots` reports "writing dev, dev mode on — this session did not come out of that slot". Four
  of the four "left empty by the first visit" cases in probe3 do the same, from every player-slot
  entry state. It is a regression against 9055116, where `withhold` was never called with `DEV_SLOT`
  at all and an empty dev slot was adoptable. Graded unmet rather than filed only as a finding
  because the clause has now failed at two passes on two branches of one rule, which CLAUDE.md names
  as the tell that a fix aimed at the reproduction was too small; an unmet clause creates the work
  and a pass-5 finding does not. The line that does it is unwatched: deleting `withhold(save,
  DEV_SLOT)` from `leaveDev` SURVIVED the whole suite (3502 tests) in my manifest.
- proof 11: met — One aimed mutation, KILLED. `save.store.write(DEV_SNAPSHOT_SLOT, encodeSnapshot(...))`
  to `void encodeSnapshot(...)` (src/runtime/saveSlots.ts:210) is killed by play-cli.test.ts "loses
  nothing when the process dies in dev, without an orderly exit", which never calls `/dev off` and
  rebuilds a second SaveContext over the same directory. I re-read the order at HEAD against the
  pass-5 change: `enterDev` still writes the snapshot before `save.dev = true`, and the new read of
  the dev slot happens after both, so no dev write and no pick-up can precede the snapshot. Same
  manifest.
- proof 12: met — `npm run tasks -- merge-ready` at 3e6232a, run by me, reports `npm test ok pass`, which
  is this clause's own proof target. One aimed mutation on top of it, KILLED: `createSaveContext`
  returning `dev: true` is killed by play-cli.test.ts "creates no dev slot while the mode is off
  (c12)", which drives save, load, restore, export and wait with `/autosave 1` and then asserts the
  directory holds exactly `autosave.slot` and `player.slot`. Checked the question the pass-5 change
  raises: `enterDev`'s new read of `DEV_SLOT` is reached only from `devOn`, `liveSlot` is
  `PLAYER_SLOT` while the mode is off, and my probe1 case B and probe2 case D both left directories
  holding only the slots a mode-off run writes. Same manifest.
- proof 13: met — One aimed mutation, KILLED. `writes: writesLive(save)` to `writes: 'yes'` in
  `saveReport` (src/runtime/saveSlots.ts:311) is killed by play-cli.test.ts "says which it is when
  asked", re-measured at its own file. Every line `slotStanding` (src/runtime/command.ts:652-659)
  prints comes off `saveReport`, including the new `autosaveSeconds === null` arm, so the later
  surface holds no copy. Confirmed by hand: in probe1 `/slots` answered "writing dev, dev mode on —
  this session did not come out of that slot" off a real directory, and in probe2 it answered
  "player  unreadable" in the date column while the file on disk was a directory. One arm of the new
  report has no proof at all and is filed as finding 3: mutating `cadenceOrNone`'s `unreadable`
  answer from `null` to the default SURVIVED the whole suite.
- proof 14: met — One aimed mutation, KILLED, and I re-read the derivation at HEAD. Weakening one field's
  gate back to what it was (`player`'s `holds: isPlayer` to `holds: isObject`,
  src/runtime/save.ts:110) is killed by save.test.ts "refuses the shapes that used to reach the
  loader, naming the field rather than raising from inside it". The derivation is genuine:
  save.test.ts walks `Object.entries(SAVE_FIELDS)` and takes each field's sample from that field's
  own `sparsest`, a column of a `Record<SaveField, SaveFieldRule>` the compiler forces somebody to
  fill in when a `GameState` field is added, so a field added next month is walked with no edit to
  the test. This clause's ground did not move in the pass-5 window: `git diff 9055116..HEAD` touches
  src/runtime/save.ts not at all. Same manifest.
- proof 15: met — `npm run tasks -- merge-ready` at 3e6232a, run by me: tsc ok pass, npm test ok pass,
  layer-check ok pass, audit-status ok pass, doctor ok pass (23 warnings, which that leg does not
  fail on), bytes ok pass, tree ok pass (nothing uncommitted). All six legs the clause names pass.
  Two legs outside those six report FAIL and are the same two every pass has recorded: `base` wants
  `git merge main` because main has moved past the merge base, and `spec` counts the one member still
  in-progress. `git status` is clean at 3e6232a and I modified no tracked file.

### Pass 6 — 2026-08-17

- base: `878a05b24259f773e932538d176b0e2e2bd1c11f`
- head: `f1e85f1dae4668e0ad34abaee93d4956d931ae93`
- proof 1: met — One aimed mutation of my own on src/runtime/store.ts, KILLED and re-measured at its own
  file with the mutant still applied: `driver.remove(name)` to `void name` in the store's remove arm is
  killed by src/runtime/store.test.ts "reads, writes, removes and lists, and an absent slot is nothing
  rather than a raise", so the store owns none of the four verbs itself and hands each to the driver.
  Read at HEAD: src/runtime/store.ts is 80 lines, imports only `RuntimeError`, and `SlotStore`'s four
  verbs move opaque `string` payloads with nothing save-shaped in the interface. The no-I/O half stays
  derived rather than listed: store.test.ts asserts store.ts's import list equals exactly ['./runtime'].
  Nothing in the pass-6 window (ea7242b..HEAD) touches store.ts, so this ground did not move. Re-run:
  npm run mutate -- C:\Users\yonat\AppData\Local\Temp\mutations-auto-save-export-and-load-pass6-aimed.json
- proof 2: met — One aimed mutation, KILLED by three named rows and re-measured at its own file:
  `const slot: Slot = { writtenAt: now(), payload }` to `writtenAt: 0` in `slotStore`'s write arm is
  killed by store.test.ts "stamps the write off the clock it was built with", "never parses a payload:
  what the store holds is the driver text it was handed" and one more. `slotStore`
  (src/runtime/store.ts:52-70) is the only place a stamp is laid down and it sits above every driver, so
  a file store and a browser store cannot stamp differently. Confirmed by hand off a real directory in
  my probe1: every `.slot` file on disk is an envelope of `{writtenAt, payload}` and the payload read
  back is `serializeSession`'s bytes with no stamp inside them. Same manifest as c1.
- proof 3: met — One aimed mutation, KILLED by two named rows: `return { payload: parsed.payload, ... }` to
  `parsed.payload.trim()` in `decode` (src/runtime/store.ts:49) is killed by store.test.ts
  `round-trips "   "` and the mixed CRLF/LF row, so both cases a normalising store would silently pass
  are in the parametrised table rather than absent from it. Same manifest. Independently: my probe1's
  slot reader unwraps the envelope and compares payloads byte for byte across every case, and every
  byte-identity assertion in it held.
- proof 4: unmet — The cadence's own mechanics are met and mutation-proved — two aimed mutations, both KILLED
  and re-measured at their own files: `>= seconds * 1000` to `>= seconds` is killed by play-cli.test.ts
  "measures real seconds since the slot was written, and is checked after a command that changed state"
  and "is checked on each live tick"; `if (seconds === 0) return false` to `return true` is killed by
  "writes nothing at all until somebody asks for a cadence", which asserts the directory is never
  created. The cadence lives in its own `autosave` slot, read off disk in my probe1 case L.
  What fails is the entitlement rule this clause's proof carries — scripts/play-cli.test.ts files it
  under "a session writes back only what it came out of (c4, c7, c9)", and passes 2-5 graded the
  adoption gate here. A third route makes a payload the session without answering which slot's game it
  now is, so autosave writes a stranger's game over the player's slot with no warning at all.
  Reproduce (clean tree, HEAD f1e85f1, file-backed store over a real temp directory):
  npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass6-probe2.js
  `/autosave 30`, three commands, `/save` leaves player.slot holding 3 gold. `/test replay` — a `# test`
  whose first line is `load: somebody-elses` (999 gold), which is the shape `/create-test` emits for
  every recorded session, since its generated first line is `load: <id>-start`. Measured:
  `syncedAfterReplay: 'player'`, `playerSlotGoldBefore: 3`, `playerSlotGoldAfter: 1001`,
  `playerSlotOverwritten: true`, `warnedAboutHold: []`. `run: replay` gives the identical result. The
  typed `load:` control in the same run is correct (`synced: null`, slot unchanged, held with a
  warning), which is exactly what this window added — so the window closed two spellings of one defect
  and left the third. The in-dev variant destroys the author's dev slot instead (1 gold to 1001).
  Cause: `runNamedTest` (src/runtime/command.ts:319) hands the id to `runSessionTest`
  (src/runtime/session.ts:803), which replays the test's directives through `applyDirective` against the
  live state, so a `load:` inside a `# test` reaches `loadSaved` without passing `runDirective`'s
  `directive.kind === 'load'` arm (command.ts:376). The Decisions paragraph "A load is required to say
  which slot it came out of" claims "the two routes a payload becomes this session are exactly those
  two"; there are three, and the third is the recursive one an enumeration over directive kinds cannot
  see. Filed as finding 1, and graded unmet rather than filed only as a finding because this is the
  fifth pass at one rule and an unmet clause creates the work where a finding does not.
  A second measurement backs the diagnosis: the rule's own expression is unwatched. `writesLive`'s
  `if (save.synced === slot) return 'yes'` mutated to `if (save.synced !== null) return 'yes'` SURVIVED
  the whole suite (3508 tests) — finding 2.
- proof 5: met — One aimed mutation, KILLED by five named rows and re-measured at its own files:
  `Object.assign(internals.state, next)` to `Object.assign(internals.state, { ...next, time: next.time
  + 1 })` inside `loadSaved` (src/runtime/session.ts) is killed by play-cli.test.ts "leaves the clock at
  what the payload holds, through a # save, an import and a slot", "pastes into /dsl save <id>
  unchanged, and comes back through /load" and three more. I re-read the spellings at HEAD and they
  converge on `loadSaved` more tightly than before, not less: `/load <id>` and a `# test` `load:` reach
  performDirective's 'load' arm, `/import`, `/restore`, `/dev on` and `/dev off` reach it through
  `importPayload`, and a replayed `# test` reaches it through `runTest` — seven spellings, one function,
  and nothing on that path reads a clock. `git diff ea7242b..HEAD` touches session.ts not at all.
  Same manifest.
- proof 6: met — One aimed mutation, KILLED by three named rows: pretty-printing what `/export` prints
  (src/runtime/command.ts:954, `lines: [serializeSession(ctx.session)]` to a re-stringified copy) is
  killed by play-cli.test.ts "prints the bytes serializeSession returns and nothing else", "pastes into
  /dsl save <id> unchanged, and comes back through /load" and "takes its own output back through
  /import, to the same bytes". `/export`'s whole body is those bytes and `/import` is
  `importPayload(ctx, body, 'Imported.', null)`, so there is one serialization on both sides. The window
  changed `/import` only by adding the required `from` argument. Same manifest.
- proof 7: met — One aimed mutation, KILLED and re-measured at its own file: removing `standable(registry,
  next)` from `loadSaved` is killed by play-cli.test.ts "leaves the session standing when a payload
  loads but cannot be drawn" — the clause's leading sentence, which pass 1 graded unmet. I drove the
  slot states myself off a real directory rather than re-running an earlier pass's probe (probe1 cases
  E, F, J, K, L): a player slot the store cannot read answers "that slot holds bytes nothing here can
  read" and the bytes on disk are byte-identical afterwards; a dev slot the store cannot read is left
  exactly as it lies with a message on every command; an unreadable cadence gives "autosave: slot
  autosave does not hold a cadence in seconds" and `/slots` still answers in full; a directory standing
  where player.slot goes is a message and the session plays on. Every one is a message and none is a
  crash. The window's own new failure surface — `decodeSnapshot` refusing a snapshot that is not one —
  answers as `no-snapshot` rather than raising (saveSlots.test.ts "says a snapshot it cannot make sense
  of is one it has not got"), and probe1 case K confirms it off disk.
- proof 8: met — One aimed mutation, KILLED by 26 named rows: `renameSync(staging, file)` to `void file` in
  scripts/lib/slotFile.ts is killed by play-cli.test.ts "measures real seconds since the slot was
  written", "keeps the slots as files, which is the store a player would have" and 24 more, so the
  staged write's second half is watched and the clauses proved through play-cli are proved against
  files on disk. Every probe of mine drove `fileSaves(dir)` over a real temp directory and read the
  `.slot` files back with `readFileSync`. No browser adapter ships, and that stays derived rather than
  listed: the test walks src/ui recursively for an import of store/saveSlots/slotFile. Confirmed
  independently: `git diff 878a05b..f1e85f1 --stat -- src/ui` is empty, and so is the pass-6 window
  `git diff ea7242b..f1e85f1 --stat -- src/ui`.
- proof 9: met — Graded on measurements of my own over the axis the rebuild changed. Six aimed mutations on
  the new mechanism, all KILLED and re-measured at their own files: `leaveDev`'s `save.synced = becomes`
  to `PLAYER_SLOT` (pass 2's exact leak — the dev session laundered into an empty player slot) is killed
  by seven named rows; to `null` is killed by four; moving `save.store.remove(DEV_SNAPSHOT_SLOT)` ahead
  of `save.dev = false` is killed by "is out of the mode even when the store refuses to take the
  snapshot away"; `devSnapshot` returning `synced: PLAYER_SLOT` instead of the snapshot's own is killed
  by three, including "comes back out to the standing it went in with"; `devOff` calling
  `leaveDev(save, exit.synced)` rather than `back ? exit.synced : null` is killed by "leaves dev with
  the session where it is when the snapshot will not load"; `importPayload` not recording `from` is
  killed by three.
  Then I drove the four recorded failures myself against a file store, all closed
  (npm run inspect -- - < C:\Users\yonat\AppData\Local\Temp\audit-auto-save-export-and-load-pass6-probe1.js):
  case A, a reopened game holding an hour of play, a full dev cycle and five commands after — the
  player's slot is byte-identical throughout and the session stays no slot's; case B, a new game whose
  empty player slot is its own, dev taking the session to 6 gold — the slot is untouched in dev and one
  command after `/dev off` holds the pre-dev session (gold 2), never dev's; case K, a snapshot this
  build cannot read — out of the mode, player slot unchanged, `synced: null`; case J, a player slot the
  store cannot read — dev is now entered on it and the corrupt bytes are byte-identical afterwards.
  The residual damage this window deliberately gives up — repairing what another process did to the
  player's slot during dev — is named in the clause and ruled by the author, and I judge the trade
  sound: the compensating write was the only step on the way out that could fail, and pass 5 measured
  it stranding an author and then destroying their work. Probe1 case E is that failure now: a directory
  standing where player.slot goes gives `devOffErrors: []`, `stillInDev: false`, `authoringIntact: true`.
  Two things about the clause's text rather than its delivery are filed as findings 6 and 4: the third
  conjunct ("byte-identical ... at every command afterwards") is false by design and the branch's own
  test asserts the opposite, and the COMMANDS walk that proves this clause supplies arguments that make
  most of the table refuse rather than act — which is why finding 1 sits inside a command the walk
  visits twice and never makes act.
- proof 10: met — Pass 5 graded this unmet on an empty dev slot being permanently unadoptable after a first
  visit; that is closed and I measured it rather than reading it. Two aimed mutations, both KILLED:
  `save.synced = authoring.kind === 'empty' ? DEV_SLOT : null` to `null` (never take an empty dev slot —
  pass 5's first HIGH re-injected) is killed by four named rows including "picks the dev slot back up on
  a second visit, so authoring carries on where it stopped"; to `DEV_SLOT` (take it even when somebody's
  authoring is in it) is killed by "will not autosave over a dev slot a crashed session left behind" and
  "leaves a dev slot nobody has loaded as no session's until the caller says it picked it up". Both
  directions of the empty/non-empty answer are watched, which is what pass 5 found missing.
  Driven by hand off a real directory (probe1): case D, a first dev visit that wrote nothing followed by
  a second — `secondEntryErrors: []`, `heldWarnings: []`, `devSlotGold: 3`, and `/slots` says "writing
  dev, dev mode on" with no caveat; case C, a first visit that did write — same, `devSlotGold: 4`; case
  I, a crash in dev then a restart then `/dev on` — "Dev mode on, slot dev picked up.", no holds, the
  authoring carries on from 3 to 6 gold while the player's slot stays byte-identical throughout. The
  isolation half is unconditional by construction: `liveSlot` is the single answer `saveNow`, `autosave`
  and `saveReport` all write and report through, and no other writer of PLAYER_SLOT exists — I
  enumerated every `store.write` in the tree (saveSlots.ts:101 cadence, :132 autosave, :140 saveNow,
  :176 snapshot) and the only two that name a game slot go through `liveSlot`.
- proof 11: met — One aimed mutation, KILLED by 14 named rows and re-measured at its own files:
  `save.store.write(DEV_SNAPSHOT_SLOT, JSON.stringify({ payload: session, synced: save.synced }))` to
  `void JSON.stringify(...)` is killed by play-cli.test.ts "snapshots the session on the way in and
  leaves the player slot byte-identical throughout", "loses nothing when the process dies in dev,
  without an orderly exit" and 12 more, so the snapshot being on disk rather than in memory is watched
  after the rebuild changed what it holds. Reproduced the crash myself (probe1 case I): a session saves,
  enters dev, takes the dev slot to 3 gold and the process ends with no `/dev off`; a second context and
  session over the same directory read `player.slot` back byte-identically
  (`playerIntactAfterCrash: true`), `/dev on` picks the authoring up, and nothing the crashed session
  did reaches the player's slot (`playerStillWhatItWas: true`). Read at HEAD: `enterDev` writes the
  snapshot before `save.dev = true`, and the read of the dev slot happens after both, so no dev write
  and no pick-up can precede it. That ordering is unwatched — swapping the two lines SURVIVED the whole
  suite — and is filed as finding 3 rather than graded down here, because the code at HEAD has it right
  and the clause's property holds.
- proof 12: met — `npm run tasks -- merge-ready` at f1e85f1, run by me, reports `npm test ok pass`, which is
  this clause's own proof target. On top of it I checked the question the rebuild raises, since
  `createSaveContext` now reads the player slot at construction: the file driver's `read` is `existsSync`
  then `readFileSync` with no `mkdirSync` anywhere on it (scripts/lib/slotFile.ts:62-65), so a run that
  was not asked to save still creates nothing — which play-cli.test.ts "writes nothing at all until
  somebody asks for a cadence" asserts by checking the directory does not exist, and my "zero no longer
  means never" mutation is killed by exactly that row. saveSlots.test.ts "creates no dev slot at all
  while the mode is off" holds it at the store level, and every mode-off probe of mine (cases G, H, L)
  left a directory holding only `autosave.slot` and `player.slot`.
- proof 13: met — Every line `slotStanding` (src/runtime/command.ts:652-659) prints comes off `saveReport`,
  and the rebuild replaced the report's `writes` source without adding a second copy: `writesLive` reads
  `save.synced` and the renderer reads `report.writes` through `WHY_NOT`, one sentence per answer. Two
  aimed mutations reach it and are KILLED: `enterDev` never taking an empty dev slot is killed by
  "answers which slot is live and whether the mode is on, rather than leaving it to be inferred (c13)",
  and `createSaveContext` treating any player slot as this session's is killed by three rows including
  the report's own. Confirmed by hand off real directories in probe1, all three `SlotWrites` answers
  drawn: "writing dev, dev mode on" (case D), "writing player, dev mode off — this session did not come
  out of that slot..." (case K), "writing player, dev mode off — that slot holds bytes nothing here can
  read..." (case J), and an unreadable cadence answering "autosave — the slot the cadence lives in does
  not hold one" with the rest of the report still standing (case L), which is pass 5's finding 3 closed.
- proof 14: met — One aimed mutation, KILLED and re-measured at its own file: weakening one field's gate back
  to what it was (`player`'s `holds: isPlayer` to `holds: isObject`, src/runtime/save.ts:110) is killed
  by save.test.ts "refuses the shapes that used to reach the loader, naming the field rather than
  raising from inside it". The derivation is genuine and I re-read it: save.test.ts walks
  `Object.entries(SAVE_FIELDS)` and takes each field's sample from that field's own `sparsest`, a column
  of a `Record<SaveField, SaveFieldRule>` the compiler forces somebody to fill in when a `GameState`
  field is added, so a field added next month is walked with no edit to the test. This clause's ground
  did not move in the pass-6 window: `git diff ea7242b..HEAD` touches src/runtime/save.ts not at all.
  Same manifest.
- proof 15: met — `npm run tasks -- merge-ready` at f1e85f1, run by me: tsc ok pass, npm test ok pass,
  layer-check ok pass, audit-status ok pass, doctor ok pass (23 warnings, which that leg does not fail
  on), bytes ok pass, tree ok pass (nothing uncommitted). All six legs the clause names pass. Three legs
  outside those six report FAIL and are the ones this pass exists to move or that no pass has cleared:
  `base` wants `git merge main`, `spec` counts two open members, and `clauses` counts c10 outstanding
  from pass 5. `git status` is clean at f1e85f1 and I modified no tracked file.
