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

## Open questions

- Where the store interface lives, and whether the autosave decision — has the cadence elapsed,
  write the slot — sits beside it or in the command surface. Both drivers need that decision, so it
  belongs below `ui`; which module is for whoever has read the region.
- Whether a slot is one file or a directory per slot under the CLI. Nothing above the interface can
  tell, which is the point of c1, so the first implementation decides.
- How many player slots the game eventually offers. This branch needs the one being played and
  whatever `single-dev-mode` names; a save-slot picker is a question no record has asked yet.
