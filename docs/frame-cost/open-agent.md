## The whole PlayView is rebuilt every frame, most of it for panes nobody opened

`sessionStatus` returns 26 freshly-mapped arrays every 100ms. It is 0.5-0.6ms now,
down from 2.3ms, and the world-sized share of it was measured at 80-91%: the quest
journal, every stat's breakdown, every recipe tested for craftability, and the
titles of all 75 undiscovered places — which no player ever sees, because
`undiscovered` is read only by the map in author mode and by the editing page.
`undiscovered` is 12KB of the 32KB view and `journal` another 8KB.

**Laziness is the obvious shape and it was tried and reverted. Do not reach for it
again without reading this.** Making the fields memoized getters stops the view
being a snapshot: the getter reads the state as it is when someone looks rather
than as it was when the view was made. Three tests found it immediately by holding
a view across a mutation, and the same pattern is in production — `useNotices` in
`App.tsx` keeps the previous view in a ref and compares it to the new one *in an
effect*, which runs after ticks have moved the world, so quest and level notices
would silently stop being raised.

What makes a lazy view unsound is therefore not the laziness but what is reading
it: something downstream treats the view as a record of when things happened. That
production half stands in `open-human.md` — a quest's standing is derived rather
than recorded, so the one notice of the five that cannot be raised where it happens
is waiting on a decision — and laziness is worth another pass once it closes, but
only then, and measured rather than assumed, because the tests holding a view
across a mutation are a second reader and closing the notices line says nothing
about them.

What is left that is sound: publish less, or make what is published keep its
identity. A view field that has not changed can keep the object it had —
`JSON.stringify` over all 26 fields costs 0.09ms against a 0.55ms build, so the
comparison is nearly free — and that is the unlock for `React.memo`, which cannot
bite today because every field is a fresh array every tick. The panes would then
have to take the slices they draw rather than the whole view.

*Closes when:* a frame with only the home pane drawn does not build the journal,
the stat breakdowns or the recipe list, and `npm run oracle -- --at content` and
the suite are unchanged.

## React re-renders the whole tree ten times a second

`advance` publishes a new snapshot every tick and `App` renders from the root.
There is one `React.memo` in the UI, on the transcript's `Line`. Measured on the
shipped world with production react-dom under jsdom: ~1ms of the ~2ms frame.

The case for doing something is not the millisecond, it is the rate. Instrumented
over the shipped world at player speed, the fraction of ticks that change anything
outside `time`, the action's progress and the pools that regenerate: **0.77%
fishing, 1.0% poaching, 6.9% in a fight, 3.3% travelling.** So more than nine in
ten renders draw the same screen twice.

Two ways in, and the first is a prerequisite for the second. Keep field identity
(above), then memoize the panes on their slices. Or publish the continuously
moving numbers as ramps — the engine already holds `Cadence { progress, span }`
in `state.ts` and publishes only a sample of it — so two quiet views are
structurally identical and `publish()` can be gated on a plain deep-equal with
nothing excluded and no list.

Watch: `driver.snapshot()` is what React subscribes to *and* what the agent test
harness reads (`testState` asserts on `live.progress` right after a tick), so a
gate needs `snapshot()` and a fresh `latest()` split apart. And
`frameCost.dom.test.tsx` asserts exactly one publish per tick, which a gate makes
false by construction; it becomes at most one, plus a claim about the rate, and
that rate claim is the real gate for this work.

*Closes when:* a run of a hundred quiet ticks renders the App fewer than ten
times, and the test harness still reads a live progress that moved.

## A pack full of grown gear puts the frame over its whole budget

`sessionStatus` builds `planeReports(registry, state)` on every tick, for every
grown item the player is carrying, whether or not a plane is on screen. Each
report walks the item's whole cluster lattice — every position, every slot, every
link across, and a stat contribution per node.

It costs about 40µs today, because a shipped save carries one grown item with a
one-cluster plane. Measured on synthetic saves, `view()` goes 1 grown item on an
8-cluster plane **1.14ms**, 4 items **2.27ms**, 16 items **7.51ms**, 28 items
**14.48ms**. The pack is 28 slots. So a late player who has built and kept a pack
of gear takes the frame from two per cent of a core to a hundred and forty, and
nothing between here and there says so.

This is the same shape as the quest depth that was found and fixed: not a cost
today, a cliff a player walks off later. The fix is the one the first line names —
a plane's body is read by the plane modal and nothing else, while the ledgers want
only its name and level, and `modalFocus(state)` already says which plane is open.
Splitting the header from the body is smaller than making the whole view lazy.

The body may then be built on demand, because laziness's soundness problem does not
reach this far. A lattice is not a live reading of the world the way a pool or a
progress bar is — it is settled by the item — so a body built when the modal opens
says what a body built on the tick would have said. Where the two disagree the item
has been edited under the engine, or the save predates a version bump. So the modal
checks the lattice it opened against the stats recorded on the item and, where they
disagree, clears the item and draws an empty tree rather than a wrong one.
Migration is what should stop a player ever seeing that, and a disagreement
standing at all is the signal that migration did not.

*Closes when:* `view()` on a save carrying 28 grown items costs what it costs on a
save carrying one, the plane modal still draws its lattice, and a lattice that
disagrees with the item's recorded stats draws an empty tree instead.
