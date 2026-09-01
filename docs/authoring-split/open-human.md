# Authoring and the engine, split apart — open, for the author

## The engine's English has left `content/`

`engine-en.dsl` is now `src/content/engine/engine-en.dsl`. It still ships, still bundles, still
loads as an ordinary module, and a translator still overrides any of its keys by writing their own
`# locale` — none of that moved. What moved is who owns the file: it is the engine speaking on its
own behalf, so it sits with the engine, and `content/` now holds only what an author writes.

The cost is that its English is no longer in the folder the authoring surface treats as editable, so
retouching an engine string is a code change rather than an in-game one.
*Closes when:* you have wanted to reword an engine string in the game and said whether that wanting
is worth putting the file back within an author's reach.

## What the editing page tells a contributor after an edit

The rule this branch is built on is that no author's edit can redden `npm test`, and that the
corpus's verdict is `npm run oracle`'s alone. That settles what an agent runs. It does not settle
what the game says to a person who has just edited a section in it — whether the page runs the same
checks and shows the same sentences, including the six warnings above, or something shorter.
*Closes when:* you say what the page shows after an edit, and whether it is the oracle's own words
or a shorter reading of them.

## Authoring is dispatched now, not typed

`npm run authorbot -- <brief>` was already the tool and was not reachable from a session; the
`authoring` skill is the way in, and `CLAUDE.md` opens with the line the two jobs sit either side
of. An agent asked to write a quest should now hand it to the harness rather than typing DSL.

What is not settled is how far the line goes the other way. Nothing stops a session editing
`content/` by hand — a balance pass, a reword, a fix while you watch — and blocking that would be
wrong. But it means "authoring goes through authorbot" is a rule an agent follows rather than one
the machine keeps.
*Closes when:* you say whether hand-editing `content/` from a session should be warned about, or
left alone as the ordinary way you and an agent work together on a module.

## Are ten warnings the right ten

`src/runtime/worldRemarks.ts` holds what the engine takes and an author probably did not mean: a
place no road reaches from where a game begins, a shop no entity keeps, a coin the shop that counts
in it would also price, a base written into a save's inventory, a save restating the layer beneath
it, a route that states no claim in words, words nothing in the game ever says, a module nobody can
turn off because it names no pack, a module that leans on nothing and will not load on its own, and
a reference build that has gone stale against the curve under it.

The shipped corpus breaks none of them, and each was verified by planting the break it is meant to
catch. They caught four things in the engine's own fixture in the hours they were written — two
rooms nothing reached, a route that claimed nothing, and a recipe whose name no screen ever said.

They are warnings and not refusals, so a half-written quarter still loads and the oracle still exits
non-zero. What is unsettled is whether the list is the right list — a rule you would not act on is
noise in front of every author who runs the gate.
*Closes when:* you have run `npm run oracle -- --at content` over a draft of your own and said which
of them you would want louder, quieter, or gone.
