# What is still wrong that a lane can take

Every line here is a question the oracle did not answer while `content/thieving.dsl`
was being written, found by building a scratch module and reading what the engine
did. **A line is deleted the day it closes.**

---

## A stat used as a `one of:` weight is a raw ratio, and the page does not say so

Measured over thirty rolls at three levels: `thieving-ability:` against `100x` hits
once in thirty at level 1 and five in thirty at level 20, while `thieving-ability vs
25:` and an `accuracy:` contest hit about a third of the time at level 1. Nothing on
the page distinguishes the two: the `<weight>` line still reads *may instead name a
# stat* and no more.

*Closes when:* the `<weight>` line of the page says the stat stands as a weight beside
the numbers around it, and names the contest form as the shape for a check.

## A hidden entity refuses its actions and not a `talk:`

`hidden if:` on an entity refuses every action it offers now, and a route that
`talk:`s to it is still answered. Measured on 2026-09-02 against a scratch entity
hidden behind a flag: `use:` on it is refused and `talk:` on it is not. The page says
the thing is *not there to be met or robbed*, and half of that holds. It is why every
dialogue on a hidden entity in `content/thieving.dsl` — the lurker in the den, the man
in the cell, the warden in each of his three rooms — still writes its entity's gate
again as a `when:`.

*Closes when:* a `talk:` to an entity whose `hidden if:` holds is refused, and those
`when:` lines can read `when: always` with every route still walking.
