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

## What the engine reads off the same word

A field whose every shape is one placeholder and nothing else holds a name, or a
list of them, and nothing else. `section()` reads the kind off that field and
walks it itself, so no kind's file writes the same word into a `visit` of its
own. It prunes it too: a list loses the members nothing declares any more, and a
name held on its own takes its section with it — unless the field says
`standsWithout: true`, which `origin-cluster:` does, because an item that merely
points at a cluster stands when the cluster goes.

A value with structure inside it — an ally, an edge, a tag, a quantity — is
still walked by hand, because where each placeholder lands in the parsed value
is not something the form says. The claims below hold those walks to the
grammar, and to each other.

## Where this is proved

Three claims in `src/content/dsl.test.ts`, each picking its own subjects.

`a hole of every line of every kind` walks every line of every kind's grammar and
every placeholder in them, stands an id in each, hands the section to the engine,
and holds the line's declaration to whatever reference kind comes back. That is
the probe that used to run in the panel, moved to where a second authority
belongs: as the proof, not as the answer. It is one-directional — where the
engine names a kind, the line must say the same kind; where the engine names
none, the panel may still offer, as `unequip: <slot>` and `open-modal: <modal>`
do. A kind the section list does not declare is passed over: the action slug
under `use:` is keyed rather than declared, so there is nothing to offer for it.

`a field whose values are names` holds the generated walk and the generated
pruning to what each field declares.

`what a section is pruned by` takes every reference the shipped corpus makes, one
per site each kind writes, removes it, and requires the section to change. A
section says what it names twice — once walking, once pruning — and the second is
not derived from the first, so this holds them to each other. It found two
things the day it was written: an entity's `on <event>:` handler was walked and
never pruned, and so was its `hidden if:`.
