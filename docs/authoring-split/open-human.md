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

## What a contributor should be told to run

The rule this branch is built on is that no author's edit can redden `npm test`, and that the
corpus's verdict is `npm run oracle`'s alone. That settles what an agent runs. It does not settle
what the game tells a person who has just edited a section in it and pressed whatever the button
says — whether the page runs the same check the oracle runs and shows them the same words, or
something shorter.
*Closes when:* you say what the editing page shows a contributor after an edit, and whether it is
the oracle's own sentences or a shorter reading of them.

## Which of the corpus's own rules are refusals

Eight rules about the world are moving out of the suite and into the load path (see
`open-agent.md`). Two of them are judgements rather than mechanics, and which way they go changes
what a half-finished draft is allowed to be:

*Every location is reachable from the starting one.* As a refusal, a draft with a place not yet
joined by a road will not load, which is a normal state to be in halfway through writing a quarter.
As a remark, the game loads and the oracle says so.

*Every `# test` states its claim in words rather than only in a save body.* That is a rule about how
you want routes written, not about whether the world works.
*Closes when:* you say, for each of those two, whether the engine refuses the world or the oracle
merely says so.
