# Requirement: three ways out of Miki's house

The first subject of the authoring loop. Written by the author, handed to an
authoring agent together with `npm run oracle` and nothing else.

The shape is **one prestate, N paths, one poststate**, which is the `# test`
section's own shape: `load:` a save, run the directives, `expect:` a save. Every
route below ends by expecting the *same* save, so convergence is proven rather
than reviewed.

## Prestate

The player begins in Miki's house, as the game already starts today. Miki greets
them and offers to show them the ropes.

## Poststate, identical for every route

Outside the house, in or adjacent to the market district, holding the
long-running *leave tutorial island* quest, with a rough idea of how to play.
Miki's joke is that this quest cannot be completed; the player does not know that
yet.

One save fixture holds this, and all three route tests `expect:` it.

## The three routes

### 1. Miki's quest

Accept the offer. Bake the bread, kill the rats in the basement, and Miki unlocks
the front door. This route substantially exists today.

### 2. Thieving

Snub Miki. He refuses to help. Lockpicks are in the dresser drawer upstairs, which
already exists. Picking the front door **fails** and makes Miki angry. Climbing out
of the second-storey window **succeeds**, and costs 5 damage on landing.

### 3. Apology

Snub Miki, then apologise. He offers the skilling route instead: he gives a fishing
net and asks the player to reach level 2 in any skill. Doing so gets the door open.

## What the routes must know about each other

- **Crossing routes is acknowledged.** A player who snubbed Miki and then killed the
  rats anyway gets sarcasm, not the straight version of the line.
- **The choice outlives the house.** Re-entering later and talking to Miki reads
  differently for a player who went out of the window than for one who was let out
  of the door. The poststate is the same; what the world remembers is not.

## What is not authored here

The prose. Every line the player reads may be a stub as long as it is playable —
mark it `@@@` and move on. The author is writing the dialogue and descriptions in
parallel and will replace them; a stub that is honest about being a stub is worth
more than a good guess.

## What to do when the engine cannot do it

Several things above may have no mechanism yet: a window as a way out, damage on
landing, a fishing net, a skill-level gate, dialogue that varies on a flag set by a
route not taken. **Do not invent a mechanism and do not work around one.** Leave a
`@@@` note saying what was asked for and what the engine would not do, and author
the nearest playable thing. That list is the feature queue, and producing it is
part of the deliverable rather than a failure of it.

## How this is proven

Three `# test` sections, one per route, each ending `expect:` the same poststate
save. A fourth for a crossing route if one can be written. `npm test` runs them.
