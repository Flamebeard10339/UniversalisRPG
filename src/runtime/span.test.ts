import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { Registry } from '../content/registry';
import { Directive, Terminator } from '../content/sections/test';
import { BASE_LANGUAGE, Localized, Localizer, localizerFor } from './localized';
import { applyDirective, startSession, view } from './session';

const WORLD = `
# stat max-health
base: 30

# stat max-focus
base: 5

# stat regeneration

# resource health
max: max-health
rate: regeneration

# resource focus
max: max-focus
rate: regeneration

# skill fishing

# skill lore

# event a-level
title: A Level
trigger: level-up

# item cod
title: Cod

# flag steady

# action fish
title: Fish
continuous
time: 2
on success:
  give: 1 cod
  xp: fishing 400
  drain: 2 health

# action chop
title: Chop
time: 2
on success:
  give: 1 cod

# action study
title: Study
continuous
time: 1
stops on: a-level
on success:
  xp: lore 1000

# action prime
title: Prime
time: 1
on success:
  set: steady

# action pace
title: Pace
continuous
time: 1
requires: steady
on success:
  unset: steady

# action tap
title: Tap
time: 1
attempts: 2
damage: nibbling
on unfinished:
  say: Nothing budges.

# stat nibbling
base: 0.1

# action quit
title: Quit
continuous
time: 1
on success:
  stop

# action plod
title: Plod
continuous
time: 600

# entity player
skills: fishing, lore
uses: fish, chop, study, prime, pace, tap, quit, plod

# location shore
title: The Shore
x: 0, y: 0
starting
adjacent: dunes

# location dunes
title: The Dunes
x: 1, y: 0
`;

const registry = loadInEnglish(WORLD);
const say = (of: Registry = registry): Localizer => localizerFor(of, BASE_LANGUAGE);

const act = (id: string): Directive => ({ kind: 'use', obj: 'action', objId: id, actionId: id });

function said(directive: Directive, of: Registry = registry): Localized[] {
  const session = startSession(of);
  applyDirective(session, directive);
  return view(session).said;
}

const until = (inner: Directive, terminator: Terminator = 'done'): Directive => ({ kind: 'until', inner, until: terminator });

const BELOW_TEN: Terminator = { kind: 'comparison', left: { path: ['resource', 'health'] }, operator: '<', right: 10 };

const ran = (span: number, reason: Localized, of: Registry = registry): Localized => say(of).engine('engine.span.ran', { span, reason });

describe('a span the engine runs unattended is summarised, and one the player steps is not', () => {
  it('says nothing at all over the one cycle a bare use: comes back after', () => {
    expect(said(act('fish'))).toEqual([]);
  });

  it('reports eleven cod and a pool over the same action given a terminator', () => {
    expect(said(until(act('fish'), BELOW_TEN))).toEqual([
      say().engine('engine.skill.levelled', { skill: say().title('skill', 'fishing'), level: 2 }),
      say().engine('engine.skill.levelled', { skill: say().title('skill', 'fishing'), level: 3 }),
      say().engine('engine.skill.levelled', { skill: say().title('skill', 'fishing'), level: 4 }),
      ran(22, say().engine('engine.stopped.condition', { condition: say().identifier('resource.health < 10') })),
      say().engine('engine.span.gained', { item: say().title('item', 'cod'), count: 11 }),
      say().engine('engine.span.levelled', { skill: say().title('skill', 'fishing'), gained: 4400, level: 4 }),
      say().engine('engine.span.pool', { resource: say().title('resource', 'health'), before: 30, after: 8 }),
    ]);
  });

  it('names neither the skill nor the pool the span left where it found them', () => {
    const lines = said(until(act('fish'), BELOW_TEN));
    for (const untouched of [say().title('skill', 'lore'), say().title('resource', 'focus')]) {
      expect(lines.some((line) => line.includes(untouched)), untouched).toBe(false);
    }
  });

  it('reports a resource this test never named, added to the world and moved by nothing the action does', () => {
    const grown = loadInEnglish(`${WORLD}\n# stat max-grit\nbase: 4\n\n# stat grit-rate\nbase: 60\n\n# resource grit\nmax: max-grit\nstart: 0\nrate: grit-rate\n`);
    const lines = said(until(act('fish'), BELOW_TEN), grown);
    expect(lines).toContain(say(grown).engine('engine.span.pool', { resource: say(grown).title('resource', 'grit'), before: 0, after: 4 }));
  });

  it('says nothing where nothing was under way to be away from', () => {
    expect(said({ kind: 'wait-out' })).toEqual([]);
  });
});

describe('a summary says what stopped the span, in the words of whoever stopped it', () => {
  const stoppedBy = (directive: Directive, seconds: number, reason: Localized): void => {
    expect(said(directive)).toContain(ran(seconds, reason));
  };

  it('says it was finished where the action ran out of work after two seconds', () => {
    stoppedBy(until(act('chop')), 2, say().engine('engine.stopped.finished'));
  });

  it('says it ran out of attempts where two of them went by', () => {
    stoppedBy(until(act('tap')), 2, say().engine('engine.stopped.unfinished'));
  });

  it('names the event a stops on: fired, one second in', () => {
    stoppedBy(until(act('study')), 1, say().engine('engine.stopped.event', { event: say().title('event', 'a-level') }));
  });

  it('says it could not be carried on with where the action unset its own requirement', () => {
    const session = startSession(registry);
    applyDirective(session, act('prime'));
    applyDirective(session, until(act('pace')));
    expect(view(session).said).toContain(ran(1, say().engine('engine.stopped.unavailable')));
  });

  it('says the action called a halt where its own on success: wrote stop', () => {
    stoppedBy(until(act('quit')), 1, say().engine('engine.stopped.itself'));
  });

  it('says the journey arrived, five seconds down the one road there is', () => {
    const walk = until({ kind: 'begin', inner: { kind: 'travel', location: 'dunes' } });
    stoppedBy(walk, 5, say().engine('engine.stopped.arrived'));
    expect(said(walk)).toContain(say().engine('engine.span.moved', { location: say().title('location', 'dunes') }));
  });

  it('says the engine had run four hours on the player behalf, and refuses the directive with the same words', () => {
    const bound = say().engine('engine.stopped.bound', { hours: 4 });
    expect(said(until(act('plod')))).toContain(ran(14400, bound));
  });
});
