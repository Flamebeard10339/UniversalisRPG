# info engine-en
version: 1.0.0
pack: engine
language: en

# locale en
engine.travel.to: Travel to {destination}
engine.travel.no-way: There is no way from here to {destination}.
engine.travel.nowhere: No road leads anywhere you have found from here.
engine.travel.unknown-origin: unknown travel origin: {location}
engine.travel.unknown-destination: unknown travel destination: {location}
engine.craft.label: Craft {recipe}
engine.talk.to: Talk
engine.requires.item: You need {item} for that.
engine.requires.unmet: You cannot do that yet.
engine.target.absent: There is no {target} here.
engine.target.unoffered: The {target} is in no state for that just now.
engine.inputs.short: You don't have enough {item}.
engine.inputs.grown: Your {item} has grown a plane of its own, and a grown item is never spent.
engine.inputs.bare-slot: You are wearing nothing on your {slot}.
engine.combat.player.hit: You hit the {target} for {damage}.
engine.combat.player.miss: You miss the {target}.
engine.combat.foe.hit: The {attacker} hits you for {damage}.
engine.combat.foe.miss: The {attacker} misses you.
engine.combat.other.hit: The {attacker} hits the {target} for {damage}.
engine.combat.other.miss: The {attacker} misses the {target}.
engine.combat.started: You are fighting the {target}.
engine.combat.felled: The {target} falls.
engine.examine.beside: {subject} — {examine}
engine.entity.unexamined: ?
engine.carried.stack: {item} x{count}
engine.carried.worn: {item} ({slot})
engine.modal.name: Name
engine.modal.race: Race
engine.modal.race.carries: {race} - {carries}
engine.modal.race.bonus: {amount} {stat}
engine.modal.race.and: {carries}, {more}
engine.modal.choice: Choice
engine.modal.read: Continue
engine.modal.item: Item
engine.modal.confirm: {verb} {item} for good?
engine.carried.verb.grow: Skill Tree
engine.carried.verb.equip: Equip
engine.carried.verb.unequip: Unequip
engine.carried.verb.destroy: Destroy
engine.carried.close: Close
engine.carried.confirmed: Go ahead
engine.growth.no-copy: you carry no {item}
engine.growth.no-worn: you wear nothing in {slot}
engine.growth.unknown-item: there is no item or item instance called {item}
engine.growth.not-a-base: {item} is not a base: only an item you can wear has a plane to grow
engine.growth.not-a-jewel: {item} is not a cluster jewel
engine.pack.full: Your pack is full, so the {item} stays where it is.
engine.equip.requires: You are not the {item}'s match yet, and it stays in your pack.
engine.plane.base: Base
engine.plane.go: Go to {hex}
engine.plane.slot: slot: {direction} with {jewel}
engine.plane.allocate.slot: allocate: slot {direction}
engine.plane.allocate.position: allocate: position {position}
engine.plane.unallocate.slot: unallocate: slot {direction}
engine.plane.unallocate.position: unallocate: position {position}
engine.plane.back: Back to inventory
engine.plane.heading: {plane} at {hex}
engine.plane.heading.said: {heading} — {said}
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
engine.plane.not-allocated: {node} is not allocated, so there is nothing there to take back
engine.plane.socket-spent: {node} is a jewel socket, and a socket is spent for good — a jewel put in one stays in it
engine.plane.plane-root: {node} is where the plane starts, and cost no point to take
engine.plane.strands: {node} cannot be taken back while {stranded} stands on it
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
engine.stat.base: Base
engine.shop.label: Trade
engine.shop.counter: The counter — you are carrying {held} {coin}
engine.shop.side.buy: Buy
engine.shop.side.sell: Sell
engine.shop.buy: Buy {item} — {price} each, {count} in stock
engine.shop.sell: Sell {item} — {price} each, you carry {count}
engine.shop.count.buy: How many {item} will you buy?
engine.shop.count.sell: How many {item} will you sell?
engine.shop.close: Step away from the counter
engine.shop.stale: nothing here keeps a shop called {shop} any more
engine.shop.refused.unknown-item: There is nothing by that name to trade.
engine.shop.refused.untradable: That is not something they will put a price on.
engine.shop.refused.out-of-stock: They do not have that many.
engine.shop.refused.not-carried: You are not carrying that many.
engine.shop.refused.not-afforded: You cannot afford that.
engine.shop.refused.not-a-count: That is not a number of things to trade.
engine.shop.refused.pack-full: Your pack is full — there is nowhere to put it.
engine.modal.opened: A screen opens: {modal}.
engine.prune.race: Cleared the player's race because {race} is not loaded.
engine.prune.setting: Put setting {setting} back where it stands because {value} is not one of the ways it can be played.
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
engine.prune.population.guise: {entity} at {location} is itself again because the guise {guise} it was wearing is not loaded.
engine.command.invalid-choice: invalid choice: {choice}
engine.command.speed: Speed set to {speed}x.
engine.command.stopped: Stopped.
engine.shell.map: Map
engine.skill.levelled: Congratulations! You have levelled up {skill} to level {level}!
engine.shell.recentre: Recentre
engine.shell.socket: Jewel socket
engine.shell.allocate: Allocate
engine.shell.unallocate: Take back
engine.shell.insert: Socket a jewel
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
engine.journal.which: Which quest?
engine.journal.reading: Quest
engine.journal.close: Close
engine.stat.which: Which stat?
engine.stat.reading: Stat
engine.stat.close: Close
engine.skill.which: Which skill?
engine.skill.reading: Skill
engine.skill.close: Close
engine.shell.journal: Journal
engine.shell.journal.empty: No quests loaded.
engine.shell.sheet.empty: Nothing to do here.
engine.shell.journal.untouched: You have not begun this quest.
engine.shell.close: Close
engine.shell.command: Command
engine.shell.run: Run
engine.shell.level: Level
engine.shell.levelled: {skill} reached level {level}
engine.shell.points: Points
engine.shell.spent: Spent
engine.shell.ready: Ready
engine.shell.locked: Locked
engine.shell.dead: Dead
engine.shell.free: Free
engine.shell.node.position: Position {position}
engine.shell.node.slot: Slot {direction}
engine.shell.local: Here
engine.shell.global: World
engine.shell.every-kind: Every kind
engine.shell.section: Section
engine.shell.grammar: Grammar
engine.shell.colour: Colour
engine.shell.starting: lines start this way
engine.shell.undeclared: is not declared anywhere yet
engine.shell.step-in: →
engine.shell.step-out: ←
engine.shell.new: New
engine.shell.search: Search
engine.shell.search-hint: all terms must match, e.g. tutorial sword; for either, write:
engine.shell.command-line: Command line
engine.shell.stage: Stage
engine.shell.unstage: Unstage
engine.shell.copy: Copy
engine.shell.place: Place
engine.shell.link: Link
engine.shell.region: Region
engine.shell.region-hint: name one, then tap rooms to gather them
engine.shell.pin: Pin
engine.shell.pin-hint: tap a place, then the one it hangs off
engine.shell.dev: Dev mode
engine.shell.speed: Speed
engine.shell.clear: Clear local changes
engine.shell.mods: Mods
engine.shell.mods-hint: turn a pack off to play the world without it
engine.shell.mods-refused: on, but the world would not open with it
engine.shell.reopen: Open again
engine.playtest: Record a playtest
engine.playtest.turn: Turn {turn}
engine.playtest.nothing: Nothing played yet.
engine.playtest.attach: Note
engine.playtest.keep: Attach
engine.playtest.discard: Never mind
engine.playtest.copy: Copy the run
engine.playtest.copied: The run is on the clipboard.
engine.playtest.filed: The run is in the game as {at}. Reload to run through it again.
engine.playtest.unfiled: The run could not be filed, and is still being recorded: {because}
engine.playtest.stop: Stop recording
engine.playtest.runs: Runs in the game
engine.playtest.none: No runs are in the game.
engine.playtest.drop: Drop
engine.playtest.rename: Rename
engine.playtest.renaming: A new name for {run}
engine.playtest.replay: Watch
engine.playtest.about: About {line}
engine.playtest.note: What you were doing, and why
engine.playtest.expected: Something you reached for and could not do
engine.playtest.confusion: Anything unclear, contradictory or unfinished
engine.playtest.blocked: Say why the run cannot go on, if it cannot
engine.replay: Watch a run
engine.replay.of: Replaying {test}
engine.replay.step: Step {at} of {count}
engine.replay.play: Play
engine.replay.pause: Pause
engine.replay.back: Back a step
engine.replay.on: On a step
engine.replay.every: Every {seconds}s
engine.replay.parted: The run and the game have parted here: {because}
engine.replay.done: The run has played out.
engine.replay.close: Close
engine.repl.place: {location} ({id})
engine.repl.here: Here: {entities}
engine.repl.grouped: [{group}] {said}
engine.repl.clock: [time: {time}s]
engine.repl.pool: {resource}: {meter}
engine.repl.held: Holding: {effects}
engine.repl.held.effect: {effect} {left}
engine.repl.held.stacked: {effect} ×{stacks}
engine.repl.swing: Your swing {meter}
engine.repl.choice: {index}) {choice}
engine.repl.choice.owned: {index}) {owner}: {choice}
engine.repl.modal: [{modal}] {options}
engine.repl.modal.answered: [{modal}] (answered)
engine.repl.modal.asking: {option}:
engine.repl.modal.free: submit-modal: {option}=<text>
engine.repl.modal.leaving: submit-modal: {option}={leaving} to step back
engine.repl.journal.none: No quests loaded.
engine.repl.journal.struck: (done) {said}
engine.repl.journal.unknown: no quest is called {quest}
engine.repl.stat: {stat} — {value}
engine.repl.stat.unknown: no stat is called {stat}
engine.repl.skill.unknown: no skill is called {skill}
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
engine.repl.plane.heading: {plane} — level {level}, {spent} spent, {points}
engine.repl.plane.heading.worn: {plane} — worn — level {level}, {spent} spent, {points}
engine.repl.plane.points.one: 1 point left
engine.repl.plane.points.many: {points} points left
engine.repl.plane.cluster: {hex}  {jewel} · {shape} · {from} · mods {mods}/{slots}
engine.repl.plane.origin: origin
engine.repl.plane.via: via {hex} {direction}
engine.repl.plane.effect: {effect} {amount}% {stat}
engine.repl.plane.empty: (empty)
engine.repl.plane.blocked: blocked by {beyond}
engine.repl.plane.holds: holds {beyond}
engine.away.ran: you came back
engine.away.capped: the world had run {hours} hours on your behalf, which is as far as it runs unattended
engine.away.carry-on: Carry on
engine.away.nothing: Nothing came of it.
engine.modal.welcome-back: Welcome back
engine.playtest.download: Download
engine.playtest.chunk: part {part}
engine.span.ran: You were at that for {span}s, and stopped because {reason}.
engine.span.pool: {resource}: {before} to {after}
engine.span.gained: Gained: {item} x{count}
engine.span.spent: Spent: {item} x{count}
engine.span.xp: {skill}: {gained} experience
engine.span.levelled: {skill}: {gained} experience, and level {level}
engine.span.moved: You are standing in {location}.
engine.stopped.itself: what you were doing called a halt
engine.stopped.condition: {condition} came true
engine.stopped.counted: it had come round {times} times
engine.stopped.event: {event} happened
engine.stopped.finished: it was finished
engine.stopped.unfinished: it ran out of attempts
engine.stopped.unavailable: you could not carry on with it
engine.stopped.arrived: you got where you were going
engine.stopped.no-road: the way on was closed
engine.stopped.called-off: you called it off
engine.stopped.forced: something else took hold of you
engine.forced.holds: you cannot do anything else until this is over
engine.stopped.engaged: the {attacker} came at you
engine.stopped.bound: the world had already run {hours} hours on your behalf, which is as far as it will run unattended
engine.stopped.still: what was under way advances by nothing, so waiting it out would never end
engine.stopped.pack-full: your pack was full and there was nowhere to put what you found
engine.stopped.unloadable: what was under way could not be picked up again
engine.stopped.short: {because}, and {condition} never came true
engine.stopped.short-count: {because}, and it came round {times} of the {wanted} times asked for
engine.stopped.round: a pass through the block left the world exactly as it found it, so going round again would never end
engine.setting.stands: {setting}: {value}
engine.setting.takes: takes {choices}
engine.setting.on: On
engine.setting.off: Off
engine.setting.hardcore: Hardcore
engine.setting.hardcore.note: Fainting costs you everything you were carrying and wearing.
engine.setting.reveal: Paced dialogue
engine.setting.reveal.note: What is said to you arrives a line at a time, at reading speed, rather than all at once.
engine.setting.masking: Look before you know
engine.setting.masking.note: Something nobody has looked at keeps its name and everything it offers back until somebody does. Off, a room reads as it is written — which is what an author wants and a player does not.
engine.setting.regions: Region shape
engine.setting.regions.note: Whether a region is drawn as a shape that follows the rooms it holds, or as one rectangle around all of them.
engine.setting.regions.blob: Blob
engine.setting.regions.box: Box
