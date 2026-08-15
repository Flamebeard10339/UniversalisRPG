import { describe, expect, it } from 'vitest';
import { DslError } from '../grammar/parser';
import { loadModule } from './registry';

const VALID = `
# stat attack
base: 10

# stat dr

# stat max-health
base: 30

# stat regeneration

# stat attack-rate
base: 25

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# skill brawling
stat-id: attack

# item straw
examine: A fistful of straw.

# item hat
slot: head

# location den
x: 0, y: 0
starting
entities: training-dummy

# location shed
x: 1, y: 0

# action strike
title: Strike
continuous
rate: my attack-rate
damage: my attack vs their dr
depletes: their health
xp: brawling 2

# entity player
stats: max-health 30, attack 10, attack-rate 25
uses: strike

# passive spined
+1 dr
when hit: drain: 5 health from them

# item balm
+2 regeneration, 30s

# entity training-dummy
stats: max-health 12, dr 2
passives: spined
on death: stop

# dialogue caretaker
owner = training-dummy

node hello:
  when: time >= 0
  Nothing to say.
  give: 1 straw
`;

function loading(replace: string, withText: string): () => void {
  return () => loadModule(VALID.replace(replace, withText));
}

describe('load-time reference resolution', () => {
  it('loads content whose references all resolve', () => {
    expect(() => loadModule(VALID)).not.toThrow();
  });

  it('names the section and the field it failed in', () => {
    expect(loading('rate: my attack-rate', 'rate: my attack-rat')).toThrow(/# action strike rate: names an unknown stat: attack-rat/);
  });

  // Each fell through to a different silent default, so they are pinned
  // individually rather than as one representative case.
  it.each([
    ['rate: my attack-rate', 'rate: my nope', /unknown stat: nope/],
    ['damage: my attack vs their dr', 'damage: my nope vs their dr', /unknown stat: nope/],
    ['damage: my attack vs their dr', 'damage: my attack vs their nope', /unknown stat: nope/],
    ['depletes: their health', 'depletes: their helth', /unknown resource: helth/],
    ['depletes: their health', 'depletes: their health\naccuracy: my nope', /unknown stat: nope/],
    ['depletes: their health', 'depletes: their health\naccuracy: my attack vs their nope', /unknown stat: nope/],
  ])('rejects %s → %s', (from, to, message) => {
    expect(loading(from, to)).toThrow(message);
  });

  it('rejects a pool whose max: or rate: names no stat', () => {
    expect(loading('max: max-health', 'max: max-helth')).toThrow(/# resource health max: names an unknown stat: max-helth/);
    expect(loading('rate: regeneration', 'rate: regen')).toThrow(/# resource health rate: names an unknown stat: regen/);
  });

  it('rejects an event, a use: or a faction naming nothing', () => {
    expect(loading('resource: health\ntrigger: on empty', 'resource: helth\ntrigger: on empty')).toThrow(/# event death resource: names an unknown resource: helth/);
    expect(loading('uses: strike', 'uses: strke')).toThrow(/# entity player uses: names an unknown action: strke/);
    expect(loading('on death: stop', 'on deth: stop')).toThrow(/# entity training-dummy on deth: names an unknown event: deth/);
    expect(loading('uses: strike', 'uses: strike\nfaction: nobody')).toThrow(/# entity player faction: names an unknown faction: nobody/);
    expect(loading('uses: strike', 'uses: strike\nallies: 2 wisp')).toThrow(/# entity player allies: names an unknown entity: wisp/);
    expect(loading('skills: nothing', 'skills: nothing')).not.toThrow();
    expect(loading('uses: strike', 'uses: strike\nskills: brawlin')).toThrow(/# entity player skills: names an unknown skill: brawlin/);
  });

  it('rejects a location pointing at an entity or a neighbour that does not exist', () => {
    expect(loading('entities: training-dummy', 'entities: training-dumy')).toThrow(/# location den entities: names an unknown entity: training-dumy/);
    expect(loading('entities: training-dummy', 'entities: 3 training-dumy')).toThrow(/# location den entities: names an unknown entity: training-dumy/);
    expect(loading('starting', 'starting\nadjacent: beach')).toThrow(/# location den adjacent: names an unknown location: beach/);
  });

  // Never read: the action asks for the correctly-spelled stat, so the override
  // silently does nothing.
  it('rejects an actor sheet assigning a stat nobody declared', () => {
    expect(loading('stats: max-health 12, dr 2', 'stats: max-health 12, drr 2')).toThrow(/# entity training-dummy stats: names an unknown stat: drr/);
  });

  it('checks an item action and a recipe the same way', () => {
    expect(loading('examine: A fistful of straw.', 'examine: A fistful of straw.\neat:\n  rate: nope\n  take: 1 straw')).toThrow(/# item straw action "eat" rate: names an unknown stat: nope/);
    expect(() => loadModule(`${VALID}\n# recipe weave\nrate: nope\nout: 1 straw\n`)).toThrow(/# recipe weave rate: names an unknown stat: nope/);
  });

  // An action's RESULTS name ids too, each with its own silent failure mode.
  it.each([
    ['xp: brawling 2', 'drain: 5 bogus', /drain: names an unknown resource: bogus/],
    ['xp: brawling 2', 'restore: 5 bogus', /restore: names an unknown resource: bogus/],
    ['xp: brawling 2', 'give: 1 bogus', /give: names an unknown item: bogus/],
    ['xp: brawling 2', 'take: 1 bogus', /take: names an unknown item: bogus/],
    ['xp: brawling 2', 'relocate: bogus', /relocate: names an unknown location: bogus/],
    ['xp: brawling 2', 'discover: bogus', /discover: names an unknown location: bogus/],
    ['xp: brawling 2', 'xp: bogus 2', /xp: names an unknown skill: bogus/],
    ['continuous', 'continuous\n+100% bogus', /tag names an unknown stat: bogus/],
  ])('rejects a result or tag naming nothing: %s → %s', (from, to, message) => {
    expect(loading(from, to)).toThrow(message);
  });

  it('rejects an unreachable handler: an event handler, a dialogue effect, a choice effect', () => {
    expect(loading('on death: stop', 'on death: give: 1 bogus')).toThrow(/# entity training-dummy on death: give: names an unknown item: bogus/);
    expect(loading('  give: 1 straw', '  give: 1 bogus')).toThrow(/# dialogue caretaker node hello give: names an unknown item: bogus/);
    expect(loading('  give: 1 straw', '  -> Take it.\n    give: 1 bogus')).toThrow(/# dialogue caretaker node hello choice give: names an unknown item: bogus/);
    expect(loading('owner = training-dummy', 'owner = training-dumy')).toThrow(/# dialogue caretaker owner names an unknown entity: training-dumy/);
  });

  it('checks a recipe through the action it compiles to', () => {
    expect(() => loadModule(`${VALID}\n# recipe weave\nin: 1 bogus\nout: 1 straw\n`)).toThrow(/# recipe weave in: names an unknown item: bogus/);
    expect(() => loadModule(`${VALID}\n# recipe weave\nout: 1 straw\nskill: bogus 1\n`)).toThrow(/# recipe weave skill: names an unknown skill: bogus/);
    expect(() => loadModule(`${VALID}\n# recipe weave\naccuracy: attack\nout: 1 straw\nburnt: 1 bogus\n`)).toThrow(/# recipe weave burnt: names an unknown item: bogus/);
  });

  it('checks what a character carries a passive by, and what an inflicted payload names', () => {
    expect(loading('passives: spined', 'passives: spinned')).toThrow(/# entity training-dummy passives: names an unknown passive: spinned/);
    expect(loading('when hit: drain: 5 health from them', 'when hit: drain: 5 helth from them')).toThrow(/# passive spined when hit: drain: names an unknown resource: helth/);
    expect(loading('when hit: drain: 5 health from them', 'on hit: inflict: bam on them')).toThrow(/# passive spined on hit: inflict: names an unknown item: bam/);
  });

  // A payload with no duration is granted at an instant already past, so it is
  // over before anything can read it and nothing anywhere says so.
  it('refuses an inflicted payload that declares no duration', () => {
    expect(loading('when hit: drain: 5 health from them', 'on hit: inflict: straw on them')).toThrow(/inflict: names straw, which declares no duration/);
    expect(loading('when hit: drain: 5 health from them', 'on hit: inflict: balm on them')).not.toThrow();
  });

  it('checks a food item tag, the other way a stat id reaches statRange', () => {
    expect(loading('examine: A fistful of straw.', 'examine: A fistful of straw.\nfood, +3 bogus, 60s')).toThrow(/# item straw tag names an unknown stat: bogus/);
  });

  it('resolves forward references, since the pass runs once everything has parsed', () => {
    expect(() => loadModule('# entity ogre\nstats: rage 3\nroar:\n  time: 1\n  damage: rage\n\n# stat rage\n')).not.toThrow();
  });

  it('raises a DslError, the same failure kind the rest of load uses', () => {
    expect(loading('depletes: their health', 'depletes: their helth')).toThrow(DslError);
  });
});

// Every case below loaded clean before the walk was completed, and failed later
// or not at all: a gate that reads false forever, a mid-conversation crash, a
// recipe craftable nowhere, a test that only breaks when it runs.
describe('references the walk used to step over', () => {
  it('rejects a `has` naming no item, wherever the condition sits', () => {
    expect(loading('continuous', 'continuous\nrequires: has strawe')).toThrow(/# action strike requires: has names an unknown item: strawe/);
    expect(loading('continuous', 'continuous\nhidden if: has strawe')).toThrow(/hidden if: has names an unknown item: strawe/);
    expect(loading('starting', 'starting\nadjacent: shed while has strawe')).toThrow(/# location den adjacent: shed while has names an unknown item: strawe/);
    expect(loading('  when: time >= 0', '  when: has strawe')).toThrow(/# dialogue caretaker node hello when: has names an unknown item: strawe/);
  });

  it('reaches inside not/and/or rather than stopping at the operator', () => {
    expect(loading('continuous', 'continuous\nrequires: not has strawe')).toThrow(/has names an unknown item: strawe/);
    expect(loading('continuous', 'continuous\nrequires: has straw and has strawe')).toThrow(/has names an unknown item: strawe/);
    expect(loading('continuous', 'continuous\nrequires: has strawe or has straw')).toThrow(/has names an unknown item: strawe/);
  });

  it('rejects a `has` inside a choice condition and inside interpolated text', () => {
    expect(loading('  give: 1 straw', '  -> Take it. (when has strawe)\n    give: 1 straw')).toThrow(/# dialogue caretaker node hello choice when has names an unknown item: strawe/);
    expect(loading('  Nothing to say.', '  {has strawe: You have straw.}')).toThrow(/# dialogue caretaker node hello has names an unknown item: strawe/);
  });

  it('rejects a goto naming no node in its own dialogue', () => {
    expect(loading('  give: 1 straw', '  goto elsewhere')).toThrow(/# dialogue caretaker node hello goto names an unknown node in # dialogue caretaker: elsewhere/);
    expect(loading('  give: 1 straw', '  -> Take it.\n    goto elsewhere')).toThrow(/choice goto names an unknown node in # dialogue caretaker: elsewhere/);
  });

  it('rejects a recipe whose station nothing provides, and accepts one an entity does', () => {
    expect(() => loadModule(`${VALID}\n# recipe weave\nstation: loom\nout: 1 straw\n`)).toThrow(/# recipe weave station: names an unknown capability: loom/);
    expect(() => loadModule(`${VALID.replace('stats: max-health 12, dr 2', 'stations: loom\nstats: max-health 12, dr 2')}\n# recipe weave\nstation: loom\nout: 1 straw\n`)).not.toThrow();
  });

  it('rejects every id a # test directive names', () => {
    const test = (...lines: string[]) => () => loadModule(`${VALID}\n# test walk\n${lines.join('\n')}\n`);
    expect(test('travel: shedd')).toThrow(/# test walk travel: names an unknown location: shedd/);
    expect(test('talk: training-dumy')).toThrow(/# test walk talk: names an unknown entity: training-dumy/);
    expect(test('craft: weave')).toThrow(/# test walk craft: names an unknown recipe: weave/);
    expect(test('run: other')).toThrow(/# test walk run: names an unknown test: other/);
    expect(test('load: start')).toThrow(/# test walk load: names an unknown save: start/);
    expect(test('expect: start')).toThrow(/# test walk expect: names an unknown save: start/);
    expect(test('assert: has strawe')).toThrow(/# test walk assert: has names an unknown item: strawe/);
    expect(test('begin: travel shedd')).toThrow(/# test walk begin: travel: names an unknown location: shedd/);
    expect(test('equip: strawe')).toThrow(/# test walk equip: names an unknown item: strawe/);
  });

  // The half of a growth verb that names a stack still resolves; the half that
  // names what the player is growing resolves only when it could not have been
  // minted, which is what keeps a typo caught without making a live copy
  // unnameable.
  it('rejects an unknown item a growth verb names, on either side', () => {
    const test = (line: string) => () => loadModule(`${VALID}\n# test walk\n${line}\n`);
    expect(test('feed: hatt with straw')).toThrow(/# test walk feed: names an unknown item: hatt/);
    expect(test('feed: hat with strawe')).toThrow(/# test walk feed: with names an unknown item: strawe/);
    expect(test('slot: hatt at 0,0 e with straw')).toThrow(/# test walk slot: names an unknown item: hatt/);
    expect(test('slot: hat at 0,0 e with strawe')).toThrow(/# test walk slot: with names an unknown item: strawe/);
    expect(test('allocate: hatt at 0,0 position 1')).toThrow(/# test walk allocate: names an unknown item: hatt/);
    expect(test('apply: hatt at 0,0 with straw')).toThrow(/# test walk apply: names an unknown item: hatt/);
    expect(test('apply: hat at 0,0 with strawe')).toThrow(/# test walk apply: with names an unknown item: strawe/);
    expect(test('refuse: feed hatt with straw')).toThrow(/# test walk refuse: feed: names an unknown item: hatt/);
  });

  it('leaves a target shaped like a minted instance id for the runtime to answer', () => {
    const test = (line: string) => () => loadModule(`${VALID}\n# test walk\n${line}\n`);
    expect(test('feed: 1 with straw')).not.toThrow();
    expect(test('slot: 12 at 1,-1 e with straw')).not.toThrow();
    expect(test('allocate: 3 at 0,0 slot ne')).not.toThrow();
    expect(test('apply: 7 at 0,0 with straw')).not.toThrow();
    expect(test('equip: 4')).not.toThrow();
    expect(test('refuse: apply 7 at 0,0 with strawe')).toThrow(/refuse: apply: with names an unknown item: strawe/);
  });

  // A slot is no section's id, so it is checked against what items declare —
  // the same shape as a recipe's station against what entities supply.
  it('rejects an unequip: naming a slot no item declares', () => {
    const test = (line: string) => () => loadModule(`${VALID}
# test walk
${line}
`);
    expect(test('unequip: heaad')).toThrow(/# test walk unequip: names an unknown slot: heaad/);
    expect(test('unequip: head')).not.toThrow();
  });

  // A modal name is the engine's, a layer above this one, so nothing here can
  // say whether it exists; an unknown one is refused where the screen is raised.
  it('resolves nothing for an open-modal:, whatever screen it names', () => {
    const test = (line: string) => () => loadModule(`${VALID}
# test walk
${line}
`);
    expect(test('open-modal: character-creation')).not.toThrow();
    expect(test('open-modal: no-such-screen')).not.toThrow();
  });

  it('rejects a `use:` naming an unknown kind, object, or action', () => {
    const test = (line: string) => () => loadModule(`${VALID}\n# test walk\n${line}\n`);
    expect(test('use: creature.training-dummy.eat')).toThrow(/# test walk use: names an unknown kind: creature/);
    expect(test('use: entity.training-dumy.eat')).toThrow(/# test walk use: names an unknown entity: training-dumy/);
    expect(test('use: entity.training-dummy.eat')).toThrow(/# test walk use: names an unknown action-slug: entity.training-dummy.eat/);
  });

  // The two-sided spelling, checked on both halves: the action by id and the
  // target as an entity, and then that the player is able to bring it.
  it('rejects a `use: <action> on <target>` naming an unknown action or target', () => {
    const test = (line: string) => () => loadModule(`${VALID}\n# test walk\n${line}\n`);
    expect(test('use: strike on training-dummy')).not.toThrow();
    expect(test('use: strke on training-dummy')).toThrow(/# test walk use: names an unknown action: strke/);
    expect(test('use: strike on training-dumy')).toThrow(/# test walk use: on names an unknown entity: training-dumy/);
    expect(() => loadModule(`${VALID.replace('uses: strike', '')}\n# test walk\nuse: strike on training-dummy\n`)).toThrow(/use: names an action the player does not use:/);
  });

  // The other way a name stops meaning something between authoring and merge:
  // `# remove` takes the object, a `-field:` edit takes one member of it, and
  // this walk is what sees either of them.
  it('rejects a flag a -field: edit took away, and accepts the same reference without the edit', () => {
    const owned = ['# entity crab', 'flags: shy', '# entity gull', 'squawk:', '  requires: crab.shy'].join('\n');
    expect(() => loadModule(`${VALID}\n${owned}\n`)).not.toThrow();
    expect(() => loadModule(`${VALID}\n${owned}\n# entity crab\n-flags: shy\n`)).toThrow(/# entity gull action "squawk" requires: names an unknown flag: crab.shy/);
  });
});

describe('the performer declares every stat its action reads off it', () => {
  it('refuses an entity performing an action over a pool its own stats: does not measure', () => {
    expect(loading('stats: max-health 30, attack 10, attack-rate 25', 'stats: max-health 30, attack 10')).toThrow(/# entity player: action "Strike": rate: reads attack-rate, which stats: does not set/);
  });

  it('names the stat the contest reads, not the one it happens to share a word with', () => {
    expect(loading('stats: max-health 30, attack 10, attack-rate 25', 'stats: max-health 30, attack-rate 25')).toThrow(/action "Strike": damage: reads attack, which stats: does not set/);
  });

  // `their` halves are the target's business, and the target is decided by
  // whether it carries the pool — never by a list of permitted types.
  it('asks nothing of the side the performer does not read', () => {
    expect(loading('stats: max-health 12, dr 2', 'stats: max-health 12')).not.toThrow();
  });

  it('leaves a one-sided action alone, whoever owns it', () => {
    expect(loading('examine: A fistful of straw.', 'examine: A fistful of straw.\nsmash:\n  time: 1\n  say: Straw everywhere.')).not.toThrow();
    expect(loading('# location shed\nx: 1, y: 0', '# location shed\nx: 1, y: 0\ncollapse:\n  time: 1\n  say: It groans.')).not.toThrow();
  });

  it('has no authorable depletes: on a recipe for the rule to reach', () => {
    expect(() => loadModule(`${VALID}\n# recipe weave\ndepletes: health\nout: 1 straw\n`)).toThrow(/unknown recipe field: depletes/);
  });
});

describe('an overload governs only its own entity', () => {
  it('refuses a block naming an action the entity does not use:', () => {
    expect(loading('on death: stop', 'strike:\n  hidden if: has straw')).toThrow(/# entity training-dummy: "strike" overloads # action strike, which this entity does not use:/);
  });

  it('takes a bare line as a replacement and a + line as an addition', () => {
    const overloaded = VALID.replace('uses: strike', 'uses: strike\nstrike:\n  +hidden if: has straw');
    expect(() => loadModule(overloaded)).not.toThrow();
  });
});

describe('the slot vocabulary is what entities declare', () => {
  const NL = String.fromCharCode(10);
  const wearing = (slots: string): string => VALID.replace('# entity player', `# entity player${NL}equipment-slots: ${slots}`);

  it('refuses an item naming a slot nothing can wear, at load rather than at equip', () => {
    expect(() => loadModule(wearing('head'))).not.toThrow();
    expect(() => loadModule(wearing('mainhand'))).toThrow(/# item hat slot: names head, which no # entity declares among its equipment-slots:/);
  });

  it('takes the vocabulary from any entity, not from the player alone', () => {
    const alsoTheDummy = wearing('mainhand').replace('# entity training-dummy', `# entity training-dummy${NL}equipment-slots: head`);
    expect(() => loadModule(alsoTheDummy)).not.toThrow();
  });

  it('falls back to what items declare while no entity declares any', () => {
    expect(() => loadModule(`${VALID}${NL}# test walk${NL}unequip: head${NL}`)).not.toThrow();
    expect(() => loadModule(`${wearing('mainhand').replace('slot: head', 'slot: mainhand')}${NL}# test walk${NL}unequip: head${NL}`)).toThrow(/unequip: names an unknown slot: head/);
  });
});

describe('a skill names the stat it raises', () => {
  it('checks stat-id like any other reference', () => {
    expect(loading('stat-id: attack', 'stat-id: attak')).toThrow(/# skill brawling stat-id: names an unknown stat: attak/);
  });
});

// c2. `use:` used to be checked by a rule of its own, which read the built
// action table and compared labels. Both halves after the verb are namespaced
// now, so the walk that already knows a member goes away with its owner is what
// answers, and an unknown action reads like an unknown flag.
describe('a use: names an object and a member of it', () => {
  const walking = (line: string) => () => loadModule(`${VALID}\n# test walk\n${line}\n`);

  it('spells the address, not the title the action is shown under', () => {
    expect(walking('use: entity.player.strike')).not.toThrow();
    expect(walking('use: entity.player.Strike')).toThrow(/unexpected line in # test/);
  });

  it('resolves a shortened owner the way every other reference is resolved', () => {
    expect(walking('use: entity.player.strike')).not.toThrow();
    expect(walking('use: entity.dummy.strike')).toThrow(/names an unknown entity: dummy/);
  });

  // The whole point of the member: an entity that does not bring the action
  // cannot be told to perform it, and nothing had to read its table to say so.
  it('refuses an action of another object, however real that action is elsewhere', () => {
    expect(walking('use: entity.training-dummy.strike')).toThrow(/names an unknown action-slug: entity.training-dummy.strike/);
  });

  it('leaves the kind it leads with the one thing still checked here', () => {
    expect(walking('use: creature.player.strike')).toThrow(/names an unknown kind: creature/);
  });
});
