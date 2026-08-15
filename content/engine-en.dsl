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
engine.travel.unknown-origin: unknown travel origin: {location}
engine.travel.unknown-destination: unknown travel destination: {location}
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
engine.carried.stack: {item} x{count}
engine.carried.worn: {item} ({slot})
engine.modal.name: Name
engine.modal.race: Race
engine.modal.choice: Choice
engine.modal.item: Item
engine.modal.confirm: {verb} {item} for good?
engine.carried.verb.grow: Grow
engine.carried.verb.equip: Equip
engine.carried.verb.unequip: Unequip
engine.carried.verb.destroy: Destroy
engine.carried.close: Close
engine.carried.confirmed: Go ahead
engine.race.human: Human
engine.race.elf: Elf
engine.race.dwarf: Dwarf
engine.race.orc: Orc
engine.growth.max-level: {item} is already at level {level}, which is its maximum
engine.growth.no-copy: you carry no {item}
engine.growth.no-worn: you wear nothing in {slot}
engine.growth.unknown-item: there is no item or item instance called {item}
engine.growth.not-a-base: {item} is not a base: only an item you can wear has a plane to grow
engine.growth.no-experience: {item} grants no item experience
engine.growth.not-a-jewel: {item} is not a cluster jewel
engine.plane.base: Base
engine.plane.go: Go to {hex}
engine.plane.slot: slot: {direction} with {jewel}
engine.plane.allocate.slot: allocate: slot {direction}
engine.plane.allocate.position: allocate: position {position}
engine.plane.feed: feed: with {item}
engine.plane.back: Back to inventory
engine.plane.heading: {plane} at {hex}
engine.plane.heading.said: {plane} at {hex} — {said}
engine.plane.node.slot: the {direction} slot of {hex}
engine.plane.node.position: position {position} of {hex}
engine.plane.no-slot: there is no jewel slot on the {direction} edge of {hex}
engine.plane.slot-blocked: the {direction} slot of {hex} is blocked: a cluster already stands in {beyond}
engine.plane.slot-filled: the {direction} slot of {hex} already holds a jewel
engine.plane.slot-unallocated: the {direction} slot of {hex} has not been allocated
engine.plane.no-cluster: no cluster stands in {hex}
engine.plane.no-position: {shape} has no position {position} (1-{count})
engine.plane.already-allocated: {node} is already allocated
engine.plane.no-points: {node} costs a point and none remain
engine.plane.unreachable: {node} touches nothing allocated
engine.plane.repair.origin: the origin cluster {jewel} is not loaded, so the base's own cluster stands in its place
engine.plane.repair.cluster: dropped the {jewel} cluster at {hex}, whose declaration is gone, and everything allocated in it
engine.plane.repair.stranded: dropped the {jewel} cluster at {hex}, which entered through a {direction} slot of {parent} that is gone
engine.plane.repair.dropped: dropped {node}, which {jewel} no longer has, returning its point
engine.plane.repair.unreachable: dropped {node}, which nothing allocated reaches any more, returning its point
engine.plane.repair.effect: dropped the {effect} effect on the cluster at {hex}, whose declaration is gone
engine.cluster.not-an-effect: {item} carries no cluster effect
engine.cluster.effect-repeated: the cluster at {hex} already carries {effect}
engine.cluster.slots-full: the cluster at {hex} fills all {count} of its mod slots
engine.said.elided: … {dropped} more lines
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
engine.modal.stale.unknown: it is not a modal this engine knows
engine.modal.stale.no-option: it has no option {option}
engine.modal.stale.no-value: it has no {option} that takes {value}
engine.modal.stale.unanswerable: it asks for {option} and nothing answers it
engine.modal.stale.answered: it was saved with every option already answered
engine.plane.stale.uncarried: it grows {item}, which the player no longer carries
engine.plane.stale.slot: it grows what was worn in {slot}, and that slot is empty
engine.plane.stale.hex: it holds {hex}, where that plane has no cluster
engine.dialogue.stale.unloaded: dialogue {dialogue} is not loaded
engine.dialogue.stale.no-node: dialogue {dialogue} has no node {node}
engine.dialogue.stale.no-menu: dialogue {dialogue} node {node} no longer offers a menu there
engine.action.stale.owner: unknown {kind}: {id}
engine.action.stale.action: unknown action {action} on {owner}
engine.action.stale.actor: unknown encounter actor: {actor}
engine.action.stale.cadence: unknown encounter cadence actor: {actor}
engine.action.stale.resource: unknown encounter resource: {resource}
engine.prune.journey: Stopped the journey to {to} because location {lost} is not loaded.
engine.prune.action: Stopped unavailable action {action}: {reason}.
engine.prune.instance.kind: Removed instance {instance} because {kind} is not an instance kind this engine knows.
engine.prune.instance.template: Removed instance {instance} because its template {template} is not loaded.
engine.prune.instance.empty: Removed instance {instance} because nothing is left recorded about it.
engine.prune.instance.repaired: Repaired instance {instance}: {repair}.
engine.prune.population.location: Removed the population record for {entity} at {location} because its location {location} is not loaded.
engine.prune.population.entity: Removed the population record for {entity} at {location} because its entity {entity} is not loaded.
engine.command.invalid-choice: invalid choice: {choice}
engine.command.speed: Speed set to {speed}x.
engine.command.stopped: Stopped.
engine.shell.map: Map
engine.skill.levelled: Congratulations! You have levelled up {skill} to level {level}!
engine.shell.recentre: Recentre
engine.shell.socket: Jewel socket
engine.shell.allocate: Allocate
engine.shell.insert: Socket a jewel
engine.shell.feed: Feed
engine.shell.empty: Empty
engine.shell.experience: Experience
engine.shell.to-next: To next level
engine.shell.an-hour: Experience an hour
engine.shell.until-next: Until next level
engine.shell.edit: Edit
engine.shell.home: Home
engine.shell.settings: Settings
engine.shell.stats: Stats
engine.shell.skills: Skills
engine.shell.equipment: Equipment
engine.shell.inventory: Inventory
engine.shell.command: Command
engine.shell.run: Run
engine.shell.level: Level
engine.shell.points: Points
engine.shell.spent: Spent
engine.shell.ready: Ready
engine.shell.locked: Locked
engine.shell.dead: Dead
engine.shell.free: Free
engine.shell.node.position: Position {position}
engine.shell.node.slot: Slot {direction}
engine.repl.place: {location} ({id})
engine.repl.here: Here: {entities}
engine.repl.clock: [time: {time}s]
engine.repl.pool: {resource}: {meter}
engine.repl.swing: Your swing {meter}
engine.repl.choice: {index}) {choice}
engine.repl.choice.owned: {index}) {owner}: {choice}
engine.repl.modal: [{modal}] {options}
engine.repl.modal.answered: [{modal}] (answered)
engine.repl.modal.asking: {option}:
engine.repl.modal.free: submit-modal: {option}=<text>
engine.repl.state.location: Location: {location}
engine.repl.state.time: Elapsed simulated time: {time}s
engine.repl.state.flags: Flags: {flags}
engine.repl.state.inventory: Inventory: {inventory}
engine.repl.state.grown: Grown: {grown}
engine.repl.state.xp: XP: {xp}
engine.repl.state.equipped: Equipped: {equipped}
engine.repl.live.running: {action}... {bar}{pools}  {clock}
engine.repl.live.done: {action}: done.  {clock}
engine.repl.live.pool: {resource} {current}/{max}
engine.repl.live.counting: hits:{attempts} completion:{completion}
engine.repl.live.stop: (press any key to stop)
engine.repl.opening: Type /help for commands (/state and /inventory show your progress).
engine.repl.plane.heading: {plane} — level {level}/{max}, {spent} spent, {points}
engine.repl.plane.heading.worn: {plane} — worn — level {level}/{max}, {spent} spent, {points}
engine.repl.plane.points.one: 1 point left
engine.repl.plane.points.many: {points} points left
engine.repl.plane.cluster: {hex}  {jewel} · {shape} · {from} · mods {mods}/{slots}
engine.repl.plane.origin: origin
engine.repl.plane.via: via {hex} {direction}
engine.repl.plane.effect: {effect} {amount}% {stat}
engine.repl.plane.empty: (empty)
engine.repl.plane.blocked: blocked by {beyond}
engine.repl.plane.holds: holds {beyond}
