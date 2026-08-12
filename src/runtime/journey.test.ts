import { describe, expect, it } from 'vitest';
import { DISCOVERED } from '../content/location';
import { loadUniverseWithDiagnostics, type Registry } from '../content/registry';
import { parseSaveSection } from '../content/saveSection';
import { reachable, roadsFrom, routeTo } from './journey';
import { loadSave } from './save';
import { apply, applyDirective, beginAction, cancelAction, runTest, serializeSession, sessionStatus, startSession, view, wait, type PlaySession, type PlayView } from './session';
import { createGameState, type GameState } from './state';

// A line of four, so a route has somewhere to be wrong: the fewest legs, the
// order they are crossed in, and a middle that has to be walked through.
const CHAIN = [
  '# info chain',
  'version: 1.0.0',
  '',
  '# location a',
  'x: 0, y: 0',
  'starting',
  'title: A',
  'adjacent:',
  '  b',
  '',
  '# location b',
  'x: 1, y: 0',
  'title: B',
  'adjacent:',
  '  a',
  '  c',
  '',
  '# location c',
  'x: 2, y: 0',
  'title: C',
  'adjacent:',
  '  b',
  '  d',
  '',
  '# location d',
  'x: 3, y: 0',
  'title: D',
  'adjacent:',
  '  c',
  '',
];

// Two ways to the far bank: a short one behind a flag and a long one that is
// always open, so a shut road is told apart from a missing one.
const GATED = [
  '# info gated',
  'version: 1.0.0',
  '',
  '# flag bridge-down',
  '',
  '# location yard',
  'x: 0, y: 0',
  'starting',
  'title: Yard',
  'adjacent:',
  '  span while bridge-down',
  '  ford',
  '',
  '# location span',
  'x: 1, y: 0',
  'title: Span',
  'adjacent:',
  '  yard',
  '  far-bank',
  '',
  '# location ford',
  'x: 0, y: 1',
  'title: Ford',
  'adjacent:',
  '  yard',
  '  shallows',
  '',
  '# location shallows',
  'x: 1, y: 1',
  'title: Shallows',
  'adjacent:',
  '  ford',
  '  far-bank',
  '',
  '# location far-bank',
  'x: 2, y: 0',
  'title: Far Bank',
  'adjacent:',
  '  span',
  '  shallows',
  '',
];

// Two places and no road between them, plus the `# test` that asks for the
// walk anyway: the regression format is where a directive that does nothing
// has to be heard.
const ISLANDS = [
  '# info roads',
  'version: 1.0.0',
  '',
  '# location camp',
  'x: 0, y: 0',
  'starting',
  'title: Camp',
  'adjacent:',
  '  shore',
  '',
  '# location shore',
  'x: 1, y: 0',
  'title: Shore',
  'adjacent:',
  '  camp',
  '',
  '# location island',
  'x: 5, y: 0',
  'title: Island',
  '',
  // The first travel: in a `# test` is the placement, so each script stands
  // somewhere before it asks to walk.
  '# test swims-for-it',
  'travel: roads.camp',
  'travel: roads.island',
  '',
  '# test walks-to-the-shore',
  'travel: roads.camp',
  'travel: roads.shore',
  '',
];

// A road that shuts itself behind the player: arriving at the shore discovers
// the cove, and the way on is open only while the cove is unknown. So a route
// worked out from the camp is legal when it is worked out and illegal by the
// time its second leg is reached.
const TRAPDOOR = [
  '# info shut',
  'version: 1.0.0',
  '',
  '# location camp',
  'x: 0, y: 0',
  'starting',
  'title: Camp',
  'adjacent:',
  '  shore',
  '',
  '# location shore',
  'x: 1, y: 0',
  'title: Shore',
  'adjacent:',
  '  camp',
  '  cove while not shut.cove.discovered',
  '',
  '# location cove',
  'x: 2, y: 0',
  'title: Cove',
  'adjacent:',
  '  shore',
  '',
];

const universe = (lines: readonly string[], name: string): Registry => loadUniverseWithDiagnostics([{ name, text: lines.join('\n') }]).registry;

const open = (lines: readonly string[], name: string): PlaySession => startSession(universe(lines, name));

// Standing back at A with C on the map. Arriving discovers the room and its
// neighbours, so C is two roads out and unfound until the player has stood in
// B — and a walk to somewhere unfound is not offered.
function walkedOut(registry: Registry): PlaySession {
  const session = startSession(registry);
  apply(session, 'travel:chain.b');
  apply(session, 'travel:chain.a');
  return session;
}

// A state to ask a route question of, with exactly the places named said to be
// found. Built rather than taken off a session, because what the route reads is
// a location and some flags and nothing else.
function standingAt(location: string, found: readonly string[]): GameState {
  const state = createGameState(location);
  for (const place of found) state.flags[`${place}.${DISCOVERED}`] = true;
  return state;
}

const at = (shown: PlayView): string => shown.location.id;

describe('the roads out of a place', () => {
  it('lists the ones that can be walked today and leaves the shut ones out', () => {
    const registry = universe(GATED, 'gated');

    expect(roadsFrom('gated.yard', registry, standingAt('gated.yard', []))).toEqual(['gated.ford']);
  });

  it('opens one as soon as what shut it is true', () => {
    const registry = universe(GATED, 'gated');
    const state = standingAt('gated.yard', []);
    state.flags['gated.bridge-down'] = true;

    expect(roadsFrom('gated.yard', registry, state).sort()).toEqual(['gated.ford', 'gated.span']);
  });

  it('has nothing to say about a place that is not there', () => {
    expect(roadsFrom('chain.nowhere', universe(CHAIN, 'chain'), standingAt('chain.a', []))).toEqual([]);
  });
});

describe('the way there', () => {
  const registry = universe(CHAIN, 'chain');
  const walked = ['chain.a', 'chain.b', 'chain.c', 'chain.d'];

  it('names the places still to cross, in the order they are crossed, ending at the destination', () => {
    expect(routeTo('chain.a', 'chain.d', registry, standingAt('chain.a', walked))).toEqual(['chain.b', 'chain.c', 'chain.d']);
  });

  it('takes the way that is open rather than the way that is short', () => {
    const gated = universe(GATED, 'gated');
    const everywhere = ['gated.yard', 'gated.span', 'gated.ford', 'gated.shallows', 'gated.far-bank'];

    expect(routeTo('gated.yard', 'gated.far-bank', gated, standingAt('gated.yard', everywhere))).toEqual(['gated.ford', 'gated.shallows', 'gated.far-bank']);

    const bridged = standingAt('gated.yard', everywhere);
    bridged.flags['gated.bridge-down'] = true;
    expect(routeTo('gated.yard', 'gated.far-bank', gated, bridged)).toEqual(['gated.span', 'gated.far-bank']);
  });

  it('is nothing at all when the roads do not reach, and nothing for where the player already is', () => {
    expect(routeTo('gated.yard', 'gated.far-bank', universe(GATED, 'gated'), standingAt('gated.yard', ['gated.yard']))).toBeNull();
    expect(routeTo('chain.a', 'chain.nowhere', registry, standingAt('chain.a', walked))).toBeNull();
    expect(routeTo('chain.a', 'chain.a', registry, standingAt('chain.a', walked))).toBeNull();
  });

  it('ends in a place the player has not found, and never crosses one', () => {
    const nearby = standingAt('chain.a', ['chain.a', 'chain.b']);

    // C is one road past a place already found, so it is somewhere to walk to.
    // D is one road past C, and C is not found, so there is no way to it yet.
    expect(routeTo('chain.a', 'chain.c', registry, nearby)).toEqual(['chain.b', 'chain.c']);
    expect(routeTo('chain.a', 'chain.d', registry, nearby)).toBeNull();
  });
});

describe('everywhere the roads reach', () => {
  it('says how many legs away each place is', () => {
    const registry = universe(CHAIN, 'chain');

    expect([...reachable('chain.a', registry, standingAt('chain.a', ['chain.a', 'chain.b', 'chain.c', 'chain.d']))]).toEqual([
      ['chain.b', 1],
      ['chain.c', 2],
      ['chain.d', 3],
    ]);
  });

  it('names no place the player has not found, however many roads reach it', () => {
    const registry = universe(CHAIN, 'chain');

    // D is one road past C and C is found, so the roads reach it — and it is
    // not somewhere to set off for, because the player has never seen it.
    expect([...reachable('chain.a', registry, standingAt('chain.a', ['chain.a', 'chain.b', 'chain.c']))]).toEqual([
      ['chain.b', 1],
      ['chain.c', 2],
    ]);
  });
});

describe('setting off for somewhere that is not next door', () => {
  it('is offered as one choice, saying how far it is', () => {
    const shown = view(walkedOut(universe(CHAIN, 'chain')));

    expect(shown.choices.filter((choice) => choice.kind === 'travel').map((choice) => [choice.leadsTo, choice.legs])).toEqual([
      ['chain.b', 1],
      ['chain.c', 2],
    ]);
    // And the one that is a walk away is on the map, which is where a driver
    // that withdraws it from the action sheet expects the player to pick it.
    expect(shown.discovered.map((place) => place.id)).toContain('chain.c');
  });

  // The offer and the map are one thing: a place the sheet withdraws for being
  // a walk away has a bubble to be tapped instead, and a place with no bubble
  // is not named at all — including by its title, which is what the choice
  // label would have carried.
  it('offers only places the player has found, so nothing is named that the map cannot draw', () => {
    const opening = view(open(CHAIN, 'chain'));
    const drawn = new Set(opening.discovered.map((place) => place.id));

    expect([...drawn].sort()).toEqual(['chain.a', 'chain.b']);
    for (const choice of opening.choices) if (choice.leadsTo !== undefined) expect(drawn.has(choice.leadsTo), `${choice.leadsTo} is offered and not drawn`).toBe(true);
    expect(opening.choices.map((choice) => choice.label)).not.toContain('Travel to C');
  });

  it('walks every leg where it stands, and spends every leg, on the instant path', () => {
    const session = open(CHAIN, 'chain');
    const oneLeg = apply(session, 'travel:chain.b').time;
    apply(session, 'travel:chain.a');

    const arrived = apply(session, 'travel:chain.c');

    expect(at(arrived)).toBe('chain.c');
    // Four legs walked in all: out, back, and the two of the walk to C.
    expect(arrived.time).toBe(oneLeg * 4);
    expect(arrived.journey).toBeNull();
  });

  it('arms the first leg and publishes the route, on the driving path', () => {
    const session = walkedOut(universe(CHAIN, 'chain'));

    const armed = beginAction(session, 'travel:chain.c');

    expect(at(armed)).toBe('chain.a');
    expect(armed.journey).toEqual({ to: 'chain.c', legs: ['chain.b', 'chain.c'] });
    expect(armed.action?.label).toBe('Travel to B');
  });

  it('crosses the legs one after another as time passes, and lets go on arrival', () => {
    const session = open(CHAIN, 'chain');
    const oneLeg = apply(session, 'travel:chain.b').time;
    apply(session, 'travel:chain.a');
    beginAction(session, 'travel:chain.c');

    // The first leg is over and the second is under way, so the route has lost
    // the leg it crossed and kept the one it is on.
    const between = wait(session, oneLeg);
    expect(at(between)).toBe('chain.b');
    expect(between.journey).toEqual({ to: 'chain.c', legs: ['chain.c'] });
    expect(between.action?.label).toBe('Travel to C');

    const arrived = wait(session, oneLeg);
    expect(at(arrived)).toBe('chain.c');
    expect(arrived.journey).toBeNull();
    expect(arrived.action).toBeNull();
  });

  it('stops where the player stopped it, rather than going on without them', () => {
    const session = open(CHAIN, 'chain');
    const oneLeg = apply(session, 'travel:chain.b').time;
    apply(session, 'travel:chain.a');
    beginAction(session, 'travel:chain.c');
    wait(session, oneLeg);

    const stopped = cancelAction(session);

    expect(at(stopped)).toBe('chain.b');
    expect(stopped.journey).toBeNull();
    // And it stays stopped: time passing does not pick the walk back up.
    expect(at(wait(session, oneLeg * 4))).toBe('chain.b');
  });

  it('offers nothing to a place the roads do not reach', () => {
    const shut = view(open(GATED, 'gated'));

    // The ford, and nowhere else. The shallows are one road past it and have
    // not been found, so they are somewhere to walk into rather than set off
    // for; the far bank is past them, and the span that would have gone
    // straight there is shut.
    expect(shut.choices.map((choice) => choice.leadsTo)).toEqual(['gated.ford']);
    expect(() => apply(open(GATED, 'gated'), 'travel:gated.far-bank')).toThrow(/unavailable choice/);
  });

  it('is still the walk it was after a save and a load', () => {
    const registry = universe(CHAIN, 'chain');
    const session = walkedOut(registry);
    beginAction(session, 'travel:chain.c');
    const carried = sessionStatus(session).journey;

    const { saved } = parseSaveSection({
      kind: 'save',
      id: 'mid-walk',
      body: [{ text: serializeSession(session), span: { start: 0, end: 0 }, children: [] }],
      span: { start: 0, end: 0 },
    });
    const loaded = createGameState();
    loadSave(loaded, saved, registry);

    expect(carried).toEqual({ to: 'chain.c', legs: ['chain.b', 'chain.c'] });
    expect(loaded.journey).toEqual(carried);
  });

  it('is dropped whole when the place it was going to is no longer loaded', () => {
    const registry = universe(CHAIN, 'chain');
    const session = walkedOut(registry);
    beginAction(session, 'travel:chain.c');
    const { saved } = parseSaveSection({
      kind: 'save',
      id: 'mid-walk',
      body: [{ text: serializeSession(session), span: { start: 0, end: 0 }, children: [] }],
      span: { start: 0, end: 0 },
    });

    const shorter = universe(CHAIN.slice(0, CHAIN.indexOf('# location c')), 'chain');
    const loaded = createGameState();
    const warnings = loadSave(loaded, saved, shorter);

    expect(loaded.journey).toBeNull();
    expect(warnings.map((warning) => warning.path)).toContain('journey');
  });
});


describe('a walk the roads cannot make', () => {
  it('reports the refusal it showed the player, and leaves the world where it was', () => {
    const registry = universe(ISLANDS, 'roads');
    const session = startSession(registry);

    const outcome = applyDirective(session, { kind: 'travel', location: 'roads.island' });

    expect(outcome).toEqual({ failure: 'There is no way from here to Island.' });
    expect(at(view(session))).toBe('roads.camp');
  });

  it('fails the `# test` line that asked for it, rather than passing on to the next one', () => {
    const registry = universe(ISLANDS, 'roads');

    expect(runTest('roads.swims-for-it', registry, createGameState())).toEqual({ passed: false, failure: 'There is no way from here to Island.' });
  });

  // A walk that crossed a leg and then found the way on shut is not this: the
  // world moved, and where the player got to is the answer. Only a route that
  // never existed leaves nothing to report but the refusal.
  it('says nothing when the walk was made in part, since something happened', () => {
    const session = startSession(universe(TRAPDOOR, 'shut'));

    const outcome = applyDirective(session, { kind: 'travel', location: 'shut.cove' });

    expect(outcome).toEqual({});
    expect(at(view(session))).toBe('shut.shore');
  });

  it('says nothing at all about a walk that was made', () => {
    const registry = universe(ISLANDS, 'roads');

    expect(applyDirective(startSession(registry), { kind: 'travel', location: 'roads.shore' })).toEqual({});
    expect(runTest('roads.walks-to-the-shore', registry, createGameState())).toEqual({ passed: true });
  });
});
