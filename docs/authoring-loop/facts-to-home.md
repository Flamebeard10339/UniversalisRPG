# Facts with no home yet

These twelve lines stood under "Content facts worth knowing" in `CLAUDE.md` until
this branch took them out. A hand-kept list of things an author must know is the
failure mode the mission statement forbids: nothing derives it, nothing checks
it, and it goes stale silently — which is why it was removed rather than moved.

This file is a **work-list, not a record**. Each line is verified against the
code, then given one of three homes, then struck from here. When the list is
empty the file is deleted. Nothing is to be added to it.

The three homes, in order of preference:

1. **the engine refuses it** — then `npm run oracle -- --at <draft>` names it, and
   an author who gets it wrong is told so at the point of writing
2. **the oracle says it** — a `— note` on the line in the grammar tree, derived
   from the kind's own declaration in `src/content/sections/<kind>.ts`
3. **the outline template says it** — only for a genuine authoring convention
   that no engine rule could enforce

A fact that verification shows is **stale or false** is struck with no home.

## Unverified

- [ ] "descriptive flavor text for an object" is **one** mechanism
- [ ] modals are rendered unconditionally with guaranteed closing behavior. A screen
      that shows something rather than asking about it publishes it on the view and
      says which through `focus`, the way the plane and the quest journal both do
- [ ] a `# quest` is one section: stages, what the journal reads at each, and what an
      entity says while the quest stands there. A stage is a flag, `goto` names a
      stage, and the quest gives its lines to entities rather than editing them
- [ ] a quest lives in its own module. Take that module out and the world still
      loads: `content/tutorial-quests.dsl` is the pattern, and the entity it speaks
      through keeps an `always` node of its own to say when nothing else has anything
- [ ] quest/stage conditions are runtime flag checks evaluated against live state
- [ ] `<obj>.<objId>.<actionId>` is a first-class pattern for anything an object can do
- [ ] item actions are not location-scoped; location and entity actions are
- [ ] enemy-shaped actions and instant actions are two intentionally different tools
- [ ] location connectivity is always explicit and directional
- [ ] travel actions with no cost or reward are pathfinding edges for map navigation
- [ ] progress signals get lightweight UI acknowledgement
- [ ] there is no browser storage to clear and no reset command: `play-cli` starts
      fresh every run, and a `# save` fixture is how a session starts anywhere else
