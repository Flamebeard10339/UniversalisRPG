# What is still wrong that an agent can take

**A line is deleted the day it closes.**

---

## An engine trigger has to be declared before a skill can name it

`trigger:` takes one of two things: `on empty | full`, which needs a `resource:` and gives the
author's own word for it — `# event death` over `core.health`, `# event line-parted` over
`line-health` — or one of eight words the engine already knows: `damage-dealt`,
`damage-taken`, `missed`, `evaded`, `completed`, `unfinished`, `level-up`,
`inventory-changed`.

The second family needs no section and has one anyway, because `gain <n> experience on
<event>` and `on <event>:` resolve against a declared id rather than against the engine's own
vocabulary. So a world that wants experience on a landed blow writes

    # event damage-dealt
    trigger: damage-dealt

whose whole content is the word twice. The id, the trigger and the engine's word are one fact
with three homes, and an author reading the oracle page cannot tell why some triggers need
announcing and others do not.

`# event inventory-changed` is the same shape and worse: `content/core.dsl` and
`src/content/fixture/core.dsl` both declare it and **nothing in either world names it**. It is
ceremony for a reference that was never written.

A section still earns its place where it says something the word does not — `# event
damage-taken` also names `resource: core.health`, which scopes which pool's damage counts, and
every `on empty` event is a real declaration. Those stay.

*Closes when:* an engine trigger word can be named directly wherever an event is, a `# event`
is needed only where it adds a resource or a name of the author's own, and the two
`inventory-changed` sections are deleted rather than rewritten.

*Not while an authorbot runs.* `trigger:` is grammar, and a run probes its corpus against this
checkout's parser; changing the vocabulary underneath one breaks whatever it has already
written against the old page.
