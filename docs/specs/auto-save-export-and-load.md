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
- [c9] **Entering dev mode snapshots the player's slot before anything is editable, and leaving
  restores it.** Anything done in between — content edits, play, cheats, a save-breaking mistake — is
  gone on exit and the slot is byte-identical to the snapshot.
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
