// English for every string the engine says on its own behalf. It is content,
// loaded through the same `# locale` mechanism any other language uses, and its
// own module so that a universe without the tutorial island still has English
// and a test can load English without loading an island.
//
// The keys are closed in code, by the union in src/content/locale.ts. A key
// missing from here shows itself on screen rather than falling back.

# info engine-en
version: 1.0.0
language: en

# locale en
engine.travel.to: Travel to {destination}
engine.travel.no-way: There is no way from here to {destination}.
engine.craft.label: Craft {recipe}
engine.talk.to: Talk to {entity}
engine.inputs.short: You don't have enough {item}.
engine.inputs.grown: Your {item} has grown a plane of its own, and a grown item is never spent.
engine.inputs.worn: Your {item} is the one you are wearing, and what you wear is never spent.
engine.combat.player.hit: You hit the {target} for {damage}.
engine.combat.player.miss: You miss the {target}.
engine.combat.foe.hit: The {attacker} hits you for {damage}.
engine.combat.foe.miss: The {attacker} misses you.
engine.combat.other.hit: The {attacker} hits the {target} for {damage}.
engine.combat.other.miss: The {attacker} misses the {target}.
engine.item.examine: This is {article} {item}.
engine.item.modified: Modified {item}
engine.modal.opened: modal:{modal}
engine.prune.record: Removed {path} {id} because its {kind} is not loaded.
engine.prune.location: Moved from unavailable location {from} to {to}.
engine.prune.nowhere: (nowhere)
engine.prune.buff.actor: Removed every buff on {actor} because it is not a character this world has.
engine.prune.buff.stat: Removed buff {buff} on {actor} because its stat {stat} is not loaded.
engine.prune.buff.item: Removed buff {buff} on {actor} because its item {item} is not loaded.
engine.prune.buff.resource: Removed buff {buff} on {actor} because its resource {resource} is not loaded.
engine.prune.equipped.missing: Unequipped {slot} because its item {item} is not loaded.
engine.prune.equipped.slot: Unequipped {slot} because its item {item} no longer declares that slot.
engine.prune.modal: Closed modal {modal} because {reason}.
engine.prune.journey: Stopped the journey to {to} because location {lost} is not loaded.
engine.prune.action: Stopped unavailable action {action}: {reason}.
engine.prune.instance.kind: Removed instance {instance} because {kind} is not an instance kind this engine knows.
engine.prune.instance.template: Removed instance {instance} because its template {template} is not loaded.
engine.prune.instance.empty: Removed instance {instance} because nothing is left recorded about it.
engine.prune.instance.repaired: Repaired instance {instance}: {repair}.
engine.prune.population.location: Removed the population record for {entity} at {location} because its location {location} is not loaded.
engine.prune.population.entity: Removed the population record for {entity} at {location} because its entity {entity} is not loaded.
engine.text.untranslated: (untranslated)
