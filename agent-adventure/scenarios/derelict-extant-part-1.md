# Private Scenario Brief: Derelict Extant, Part 1

Do not expose this document, milestone names, or future facts to the player.

## Genre and Premise

Survival-horror mystery aboard a ruined spacecraft or station. The protagonist
wakes without memories inside a cryopod. A time loop will eventually make them
immune to lasting death, but neither the player nor character knows this during
the first life.

Some things reset with the loop and some do not. Part 1 establishes the first
death and recognition of the loop; it does not explain the alien mechanism or
resolve the larger mystery.

## Milestones

### 1. Wake in the cryopod

- Begin with an action, not an unsolicited narration dump.
- Establish cold, confinement, missing memory, damaged machinery, and a ship
  operating at the edge of failure.
- Let the player inspect the pod and discover a plausible way out.

### 2. Enter the starting room

- The room is derelict and exposed to a star field.
- Temporal fluctuations shift the stars backward every few breaths. Describe
  the observation before offering any explanation.
- Evidence should make investigating the station and finding communications
  feel like natural goals.

### 3. Establish life-support pressure

- The exit is an airlock. The player must put on a spacesuit before leaving.
- Opening the airlock vents the room and begins ongoing air loss.
- Initial supplies include two spare air canisters and small amounts of water
  and food.
- Resource pressure should be experienced through duration and depletion, not a
  speech about survival mechanics.

### 4. Explore and reach the captain's quarters

- Provide several rooms, paths, environmental clues, and limited supplies.
- Investigation should reveal more about the wreck without resolving the
  temporal phenomenon.
- The player locates communications equipment and sends a distress beacon.

### 5. Fail the beacon and exhaust the first life

- The beacon fails for an unknown reason.
- The player is already low on supplies and must venture out again.
- Their resources eventually run out while seeking an answer or more supplies.
- The suit is ripped before or during death in a causally legible way.

### 6. Wake again

- Return the player to the cryopod through authoritative death/reset mechanics.
- Repeat enough sensory detail to make the recurrence unmistakable without
  immediately naming a time loop.
- Preserve only state that the implemented persistence rules designate.

### 7. Recognize the loop and reach the main intersection

- Let the player compare reset and non-reset details.
- By the time they return to the main intersection, they should have sufficient
  evidence to infer a loop.
- End Part 1 with a meaningful choice of unexplored directions.

## Tone Constraints

- Cold and descriptive, never melodramatic.
- Technology is physical, damaged, and only partly legible.
- Use short investigative actions to create rhythm and permit player curiosity.
- Do not introduce the powered alien ziggurat, object ejection, loop boundary,
  accumulated debt, or the eventual 287-year rescue delay in Part 1.

## Required Capability Check

Before treating Part 1 as export-ready, verify support for:

- finite inventory and item consumption,
- finite actions (pick up water bottle (3/5)) tied to locations. 
- negative/positive resource changes from actions,
- conditional action visibility or unlocking (should be a general purpose requirement system),
- action-driven relocation or an equivalent choice-only travel mechanism (should be equivalent to map navigation),
- death reset with per-state persistence policies,
- a torn-suit state that can persist across the first reset.
- verbose log of each GM/Player run that can be reviewed after the fact. 

Report missing support through protocol capability requests.
