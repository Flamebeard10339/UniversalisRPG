# What is still wrong that a lane can take

A frame of live play is 10 a second and now costs about 4ms of the 100 it has:
1.5ms rebuilding the view, ~1ms simulating, ~2.6ms rendering the App over the
shipped world. It was 70ms and more. The gate that keeps it there is
`src/ui/frameCost.dom.test.tsx`, which mounts the real App on the fixture world,
leaves an action under way and drives the clock. Reach for it before believing
any line below: it prints what a frame reads, wakes and draws.

The two lines here are one piece of work in two halves, and the second pays only
after the first. **A line is deleted the day it closes.**

---

## Every pane of every layer is drawn on every frame

`App.tsx` builds `bodies = LAYERS.map(...)`, `Pager` renders all of a layer's
panes into one strip and `VStack` stacks every layer, so a player standing on the
home screen is also drawing the map, the settings page, the stats and skills
pages, both ledgers and the journal — 351 elements, eight panes, one of them
visible. Offscreen panes are hidden by a CSS transform, not by not existing.

Measured on the shipped world: the whole tree is 2.6ms per render and roughly
1.5ms of that is panes nobody can see. Nothing is memoized, and memoizing would
not bite anyway while `view` is a fresh object every tick and `words`, `localizer`
and every inline arrow prop are fresh identities per render.

What makes this more than a saving: a pane that is never drawn need not have its
data built either, which is the line below.

The reason it was left is that `render.test.tsx` reads several claims off one
render — that every field the runtime publishes is drawn somewhere, and what each
page draws — and those are the author's claims, not an agent's. Culling means
teaching them to walk to the page they are asking about. A swipe can only reach an
adjacent page, so drawing the current page and its neighbours is enough.

*Closes when:* `a-frame-draws-only-what-a-swipe-can-reach` passes, and
`render.test.tsx` still proves every published field is drawn somewhere.

## The whole PlayView is rebuilt every frame, most of it for panes nobody opened

`sessionStatus` returns 25 freshly-mapped arrays every 100ms. Timed on
`combat-lessons.fresh-off-the-sewer` before the pattern cache landed, the shares
were: the quest journal 31%, 53 stat breakdowns 26%, every recipe in the world
tested for craftability 8%, and the titles of all 75 undiscovered places 4%. It is
1.48ms now, down from 2.33ms, and the shares will have moved — measure again
before choosing a target.

None of it is wrong to publish; it is wrong to publish ten times a second when the
journal is one subpage and the recipe list another. The shape that fits is lazy
memoized fields on the returned view, so a collection is built when a pane reads
it — but that pays nothing while every pane is mounted, so it is second.

Watch two things. `viewLeaves` and `published.test.ts` walk the view's own fields
and would walk getters, and `serializeSession` must not start building collections
it did not need.

*Closes when:* a frame with only the home pane drawn does not build the journal,
the stat breakdowns or the recipe list, and `npm run oracle -- --at content` and
the suite are unchanged.

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
