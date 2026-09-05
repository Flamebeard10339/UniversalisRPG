# Open — these wait on the author

## The flash on a new line is a quarter as long a movement as it was

A line that has just arrived is marked by a colour that holds for three seconds
and then fades over one. That was written as a single four-second animation, three
quarters of which held one value that was not moving — and at 64x the log gains
twenty-five lines a second, so about a hundred of them were interpolating a
background colour at once. Measured in a real Chrome, that was 1188ms of style
recalculation every 15 seconds, more main-thread time than the game tick and the
whole React render together; on a CPU throttled to stand in for a phone it was the
whole difference between 36fps with a quarter of the frames over 33ms and 102fps
with none.

The hold is now the delay before the fade, with the colour supplied by a backwards
fill so it still wins the cascade against the Tailwind background classes the way
an animation did. It is meant to look identical, and the numbers say a quarter as
many lines are moving at any moment.

*Moves when:* the author has watched a busy log at 1x and at 64x and said whether
the flash still finds the eye. If it does, this line is deleted; if it does not,
it becomes an agent line to put the four seconds back a cheaper way — the fade can
be an overlay's opacity, which the compositor runs without touching the main
thread, at the cost of a layer per line.
