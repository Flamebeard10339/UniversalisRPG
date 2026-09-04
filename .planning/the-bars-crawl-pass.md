# The Bar's Crawl: the pass it is owed

This is a pass over `content/the-bars-crawl.dsl`, the only file this run may write. Read the
module and its note, `.planning/planning_quests/The Bar's Crawl.md`, before changing a line.
The note is eight lines; the pass is one beat. Keep the route walking.

Do not edit `tulsa.dsl`, `fishing.dsl` or `cooking.dsl`. Match the style of `fishing.dsl`.

## What to do

The note's one mechanical ask is that the blowfish bones are poisonous, and that cooking them
wrong leaves the poison in. The module carries a `@@@` saying a recipe has one `say:` and no
`on refused:` of its own, so a fumble comes back as the world's generic burnt food. That is
true of the words and not of the thing: a `# recipe` names what a fumble *produces* with
`burnt:`, and it need not be `cooking.burnt-food`. Declare a poisoned-bones item here with an
examine that says the poison stayed in, point the cleaning recipe's `burnt:` at it, and let
Sunny have a line for being handed it. Delete the `@@@` once the fumble says what it is.

Everything else — the blowfish hole, the two-step recipe, the cap and the apron, the four
hundred cooking experience — matches the note or exceeds it and stays.

## Done means

`npm run oracle -- --at <your corpus>` green, the route walking, and a second route under
`fail-checks` that fumbles and holds the poisoned bones.
