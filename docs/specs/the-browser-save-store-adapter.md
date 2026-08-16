# the-browser-save-store-adapter

## Deliverable

The named-slot store's browser implementation. `a-named-slot-store-with-a-written-at-stamp` builds one
interface over named slots — read, write, delete, list, with the instant of the write held beside an
opaque payload it never parses — and deliberately ships only the file-backed implementation, because
`localStorage` needs a browser and `src/ui` did not exist when it landed. `gui-rebuild` shipped no
persistence for the mirror reason. This is where the two meet, and it is the branch after which
closing the tab stops losing the session.

The whole of the work is that the browser satisfies an interface someone else owns. Nothing here
decides what a slot means, when autosave fires, or which slot is live: those are
`a-named-slot-store-with-a-written-at-stamp`, `auto-save-export-and-load` and `single-dev-mode`
respectively, and a second answer to any of them is the defect this spec is most likely to produce.
What is genuinely new is that a browser can fail at storage in ways a filesystem does not — a quota
that fills, a private window that refuses, a slot written by a build that has since changed — and
each of those is a message the session survives rather than a session that ends.

Proof:

- [c1] **One implementation of one interface, and the interface is not this branch's.** The adapter is
  a value satisfying the store interface `src/runtime/store.ts` exports, constructed in `src/ui` and
  passed in; nothing below `src/ui` learns that a browser exists, and no file under `src/ui`
  re-declares the interface's shape. The proof derives its subject from the interface: the same
  contract test that pins the file-backed implementation runs against this one, so a method added to
  the store next month is a method this adapter is checked on without an edit here.
  proof: vitest src/ui/browserStore.test.ts src/runtime/store.test.ts
- [c2] **A slot reads back byte-identical, through the browser's own storage.** Written text comes back
  exactly as written — every byte, including trailing newlines, non-ASCII and text longer than one
  `localStorage` value comfortably holds — and the written-at instant comes back beside it rather than
  parsed out of the payload. The test drives a `Storage` implementation, not a mock of the adapter.
  proof: vitest src/ui/browserStore.test.ts
- [c3] **Every way the browser can refuse to store is a message, and the session continues.** A quota
  exception, storage disabled entirely, and a slot whose stored shape this build does not recognise
  are each reported on the tool channel and leave the session playable with the state it already had.
  The clause is universal over the refusal modes the adapter can distinguish, and its proof enumerates
  no message text: it asserts that the session survives and that something was said, for each mode
  induced through the injected `Storage`.
  proof: vitest src/ui/browserStore.test.ts
- [c4] **Nothing in `src/ui` reaches storage except through this adapter.** No component, no driver and
  no hook touches `window.localStorage`, `sessionStorage` or `indexedDB` directly. The proof derives
  its subjects by walking the tree rather than naming files, because the next surface that wants to
  remember something is the one this clause exists to catch.
  proof: vitest src/ui/browserStore.test.ts
- [c5] **The two drivers behave identically over the store.** A session run through `play-cli` against
  the file-backed store and the same session run through the GUI driver against this one produce the
  same slot contents for the same commands. The bytes are the comparison, because a view is what a
  driver was told and the slot is what it is standing in.
  proof: vitest src/ui/driver.test.ts
- [c6] `npm run tasks -- merge-ready` passes before the spec is marked done: tsc, tests, layer-check,
  audit-status, doctor and the byte check in one invocation.
  proof: command npm run tasks -- merge-ready

## Goal

Make the browser a place a session can be kept, so every later branch that wants to remember something
has one place to put it.

## Decisions

**Registers `localStorage persistence`; claims no store interface.** The record already carries this
decision and `tasks plan` already ruled on the earlier wording: there is one slot-store interface,
owned by `a-named-slot-store-with-a-written-at-stamp`, and this is an implementation of it. The
capability that is new is that the game persists in a browser at all, which is what a later survey
will actually ask.

**Pulled into the contribution-mode push rather than left as its tail.** The author ruled on
2026-08-16 that the store chain ships with contribution mode instead of ahead of it as four blocked
records. Contribution mode's own persistence requirement — an authored edit surviving the tab closing
— is not separable from this, and building a narrower localStorage write for DSL text alone would be
the second answer this record was written to prevent.

**Collides with `floating-text-for-xp-events` on `src/ui` and with nothing else.** `tasks where
src/ui/driver.ts` returns two open records: that one and this. They are disjoint in fact — one adds a
transient overlay, this adds a store — but both forecast the directory, so they are sequenced rather
than run together, per one-worker-per-worktree.

## Open questions

- Whether a slot is keyed with a prefix that lets a single origin hold more than one build's slots is
  the worker's call. c2 fixes what a slot must return, not how it is named.
