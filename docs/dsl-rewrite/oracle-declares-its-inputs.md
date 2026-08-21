# What the grammar panel reads

`src/content/completion.ts` is the machine behind the editing page's grammar
panel and behind `npm run oracle`. It answers, for a cursor in a draft: which
shapes this line could be, which hole the cursor is in, what may stand in that
hole, and what the engine refuses.

It used to answer the third of those by experiment — writing a sentinel id into
the hole, parsing the section, and seeing which reference kind the engine
reported there; and by trying every multi-form parser in the universe to see
which one described a hole. Four bugs in one session came from that guess going
wrong, and none from a list drifting. The kind file was the truth and the panel
guessed at it.

## The rule

**A hole's name is the kind it names, unless its line says otherwise.**

`<item>` names a `# item`. So does `<buff item>` — any word of a hole's name
that is a section kind is the kind it names. A line whose hole names something
its own name does not say declares it, per hole:

- `names: { id: 'stat' }` — this hole names a kind its name does not say.
- `names: { action: null }` — this hole reads like a kind and names nothing.
  `<action>: <result>` gives an action its name rather than looking one up.
- `names: { id: '<kind>' }` — this hole names whatever kind the author wrote in
  another hole of the same line. `use: <kind>.<id>.<action>` in a `# test`.
- `holds: () => ({ condition })` — this hole is filled by a grammar rather than a
  name. It is broken into the words that grammar is written with and the kinds
  its own placeholders name, and it names what the plainest shape of that
  grammar names: a condition may be written as a flag alone.

`names` and `holds` sit on `Filled` in `src/grammar/parser.ts`, carried by both
`Parser` and `Written`, so a form declares them once wherever it is written —
on a field spec, on a value parser, or on a line of a kind's own `grammar:`.
A list takes its element's, and `fieldLines` lays the field's over its parser's.

## Where this is proved

`src/content/dsl.test.ts`, `a hole of every line of every kind`. It walks every
line of every kind's grammar and every placeholder in them, stands an id in each,
hands the section to the engine, and holds the line's declaration to whatever
reference kind comes back. That is the probe that used to run in the panel,
moved to where a second authority belongs: as the proof, not as the answer.

It is one-directional. Where the engine names a kind, the line must say the same
kind. Where the engine names none, the panel may still offer — `unequip: <slot>`
and `open-modal: <modal>` in a `# test` are checked by nothing and offered
anyway. A kind the section list does not declare is passed over: the action slug
under `use:` is keyed rather than declared, and there is nothing to offer for it.

## The one duplication left

A field that declares `names: { id: 'stat' }` says the same thing its kind's
`visit` says with `put(held, 'rate', 'stat', …)`. Both live in the kind's own
file, and the claim above fails the moment they disagree — but they are two
statements of one fact, and collapsing them would mean generating a kind's
`visit` from its fields. That is a larger change than this one and touches every
kind. It is the next thing to do here if this drifts.
