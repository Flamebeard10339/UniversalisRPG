# Open — these wait on the author

## Half the flash on a new line is worth another look, and the rest of it is worth a decision

A line that has just arrived is marked by a colour that holds for three seconds
and then fades over one. That was written as a single four-second animation, three
quarters of which held one value that was not moving — and at 64x the log gains
twenty-five lines a second, so about a hundred of them were interpolating a
background colour at once. It was the largest single cost in the app, larger than
the game tick and the whole React render together.

The hold is now the delay before the fade, with the colour supplied by a backwards
fill so it still wins the cascade against the Tailwind background classes the way
an animation did. **Verified**: screenshots of a busy log at 64x, before and
after, are identical — the flash is the same colour over the same lines. And
measured in a real Chrome at 4x CPU throttle, which is the closest thing here to a
phone, three runs each:

| | style recalc | fps | p90 frame | frames over 33ms |
|---|---|---|---|---|
| the four-second animation | 2429ms / 15s | 42 | 66ms | 22% |
| **as it stands** | **1560ms** | **73** | **31ms** | **8.5%** |
| the animation turned off | 1004ms | 100 | 17ms | 2.4% |

So it took about 60% of what was there to take. The remaining 40% is Chrome still
keeping a delayed animation in its running set — the animation count barely moved,
72 against 74 — so the delay is cheaper than interpolating but not free.

Two things are left, and both are the author's.

*Moves when:* the author has watched a busy log and said whether the **fade** still
reads. The screenshot settles the hold; it cannot show the fade, which is now a
full ease-out over one second where it was the tail of an ease-out over four. And
whether the last 40% is worth having: the fade can be an overlay's opacity, which
the compositor runs without touching the main thread, at the cost of a layer per
line — which is a trade a phone might not want either way.
