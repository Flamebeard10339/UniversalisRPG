# What is still wrong that waits on the author

Everything about the shape of bundles is settled and stands in `open-agent.md`. What
is here is the one call that was deliberately deferred rather than answered.

---

## When a bundle stops being opaque

A bundle is a handle: it can be moved and its `count` read, and nothing else. That
covers the three cases the shape was argued from — a confiscated purse, marks pulled
off a target, one shop's stock poured into another — because none of them looks
inside.

It does not cover *give back only the coin, and keep the gear*. That wants a filter
over the contents, and a filter wants the contents to have parts the language can
name. Guessing at that shape now means designing against a case nobody has written.

*Moves when: a module wants a bundle read rather than moved, and says what it wanted
to ask of it. Then the reading has a case to be shaped around, and this crosses.*
