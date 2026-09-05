# What is still wrong that a lane can take

A frame of live play is ten a second and costs about 2ms of the 100 it has:
0.5-0.6ms rebuilding the view, ~0.2ms simulating, ~1ms rendering the App with the
production React a player runs. It was 70ms and more. In a real Chrome on the
production build, nothing is dropped at any speed on a desktop.

Two gates keep it there. `src/ui/frameCost.dom.test.tsx` mounts the real App on
the fixture world, leaves an action under way and drives the clock: a frame must
read no DSL at all, wake the screen exactly once, cost what it cost at the start
of the session however long the session has run, and draw a log that stops
growing. `journal.test.ts` holds that doubling a quest's stages does not multiply
what the journal costs. Reach for both before believing any line below.

**Measure before believing any number here.** Every share in this file has moved
at least once, and two of the four things that turned out to matter most were not
in it. **A line is deleted the day it closes.**

---

## The whole PlayView is rebuilt every frame, most of it for panes nobody opened

`sessionStatus` returns 26 freshly-mapped arrays every 100ms. It is 0.5-0.6ms now,
down from 2.3ms, and the world-sized share of it was measured at 80-91%: the quest
journal, every stat's breakdown, every recipe tested for craftability, and the
titles of all 75 undiscovered places — which no player ever sees, because
`undiscovered` is read only by the map in author mode and by the editing page.
`undiscovered` is 12KB of the 32KB view and `journal` another 8KB.

**Laziness is the obvious shape and it is unsound. Do not reach for it again
without reading this.** Making the fields memoized getters was tried and reverted:
a lazy view stops being a snapshot, because the getter reads the state as it is
when someone looks rather than as it was when the view was made. Three tests found
it immediately by holding a view across a mutation, and the same pattern is in
production — `useNotices` in `App.tsx` keeps the previous view in a ref and
compares it to the new one *in an effect*, which runs after ticks have moved the
world, so quest and level notices would silently stop being raised.

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

## The modal beat restarts whenever the world speaks under it

`Modal.tsx` draws the typewriter as `<Beat key={spoken.join('\n')} …>`, and
`spoken` is `view.said`, which is drained and rebuilt on every view. So a line
being read a character at a time appears to restart from the first character when
anything else says anything, and goes entirely when a quiet tick leaves `said`
empty.

This is read off the code and was **not** reproduced: it needs a live run ticking
under an open modal, and the paths that put a modal up mostly stop the run first.
No proof stands beside it because a remount can only be seen from a mounted root,
and the `open` project has no jsdom — so the first job is to find out whether it
happens at all, in a `*.dom.test.tsx` beside `Modal.tsx`. If it does not, delete
this line.

*Closes when:* a modal being read a character at a time keeps its place while the
world speaks under it, proved in a `*.dom.test.tsx` beside `Modal.tsx`.

## The log's scroll anchor forces a layout on every batch of new lines

`Home.tsx`'s scroll effect reads two `getBoundingClientRect`s, `scrollHeight` and
`clientHeight`, then writes `scrollTop`, so the anchor lands where the first new
line starts. It runs when the transcript changed, which at 64x is every tick.
Measured in production Chrome: 135ms of every 15 seconds of play, which is the one
app-side cost that survives minification into the top three.

The reads are already batched — they are consecutive, so the browser flushes
layout once and answers the rest from it. So there is no win in reading fewer
times; the 0.9ms is the layout of a column holding up to two hundred lines, and
the only ways out are to not need the measurement (CSS `overflow-anchor` keeps the
scroll position across insertions without asking where anything is) or to stop
laying out lines nobody can see.

It is small next to what has already gone, and it is named here because it is the
last forced synchronous layout on the frame path rather than because it is urgent.

*Closes when:* a batch of new lines anchors the log without a forced layout, and
`logRest.test.ts` still holds.
