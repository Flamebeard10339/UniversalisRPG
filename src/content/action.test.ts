import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

const module = (...lines: string[]): string => ['# info thieving', 'version: 1.0.0', '', '# stat thieving', 'base: 0', '', '# skill thieving', 'title: Thieving', 'stat: thieving', '', '# stat vigilance', '', '# stat wards', '', ...lines].join('\n');

const steal = ['# action steal', 'title: Steal', 'continuous', 'attempts: 1', 'rate: 15', 'on unfinished:', '  say: A hand closes on your wrist.'];

const stealing = (...lines: string[]): string => module(...steal, '', ...lines);

const declared = (source: string, id: string) => loadModule(source).actions.get(`thieving.${id}`)!;

describe('# action extends:', () => {
  it('starts from the whole body of the action it names', () => {
    const action = declared(stealing('# action pick-pocket', 'extends: steal', 'accuracy: my thieving vs their vigilance'), 'pick-pocket');

    expect(action.kind).toBe('continuous');
    expect(action.attempts).toBe(1);
    expect(action.rate).toBe(15);
    expect(action.onUnfinished).toEqual([{ kind: 'say', text: 'A hand closes on your wrist.', key: 'thieving.action.steal.say.0' }]);
    expect(action.accuracy).toEqual({ left: { side: 'my', id: 'thieving.thieving' }, right: { side: 'their', id: 'thieving.vigilance' } });
  });

  it('keeps its own name, which is what an entity overloading a shared action may not do', () => {
    const source = stealing('# action pick-pocket', 'title: Pick a Pocket', 'extends: steal', 'accuracy: my thieving vs their vigilance');

    expect(declared(source, 'pick-pocket').label).toBe('Pick a Pocket');
    expect(declared(source, 'steal').label).toBe('Steal');
  });

  it('takes the name its id makes where it writes no title:, rather than the name it extends', () => {
    const action = declared(stealing('# action pick-pocket', 'extends: steal'), 'pick-pocket');

    expect(action.label).toBe('pick-pocket');
    expect(action.generatedLabel).toBe(true);
  });

  it('replaces what it writes bare and adds to what it writes with +', () => {
    const laid = declared(stealing('# action pick-the-lock', 'extends: steal', 'rate: 30', '+on unfinished:', '  say: The pick snaps.'), 'pick-the-lock');

    expect(laid.rate).toBe(30);
    expect(laid.onUnfinished?.map((result) => (result.kind === 'say' ? result.text : result.kind))).toEqual(['A hand closes on your wrist.', 'The pick snaps.']);
  });

  it('lays one over another however deep the chain runs', () => {
    const action = declared(stealing('# action steal-quietly', 'extends: steal', 'rate: 30', '', '# action pick-pocket', 'extends: steal-quietly', 'accuracy: my thieving vs their vigilance'), 'pick-pocket');

    expect(action.rate).toBe(30);
    expect(action.attempts).toBe(1);
    expect(action.accuracy?.right).toEqual({ side: 'their', id: 'thieving.vigilance' });
  });

  it('is what an entity gets when it uses one, overload and all', () => {
    const registry = loadModule(
      stealing(
        '# action pick-pocket',
        'extends: steal',
        'accuracy: my thieving vs their vigilance',
        '',
        '# location square',
        'x: 0, y: 0',
        'starting',
        'entities:',
        '  mark',
        '',
        '# entity mark',
        'title: A Mark',
        'stats: thieving 0, vigilance 20',
        'uses: pick-pocket',
        'pick-pocket:',
        '  xp: thieving 4',
      ),
    );
    const [action] = registry.entities.get('thieving.mark')!.actions;

    expect(action.kind).toBe('continuous');
    expect(action.rate).toBe(15);
    expect(action.results).toEqual([{ kind: 'xp', skill: 'thieving.thieving', amount: { min: 4, max: 4 } }]);
  });

  it('leaves a line it inherited keyed under whoever wrote it, rather than minting an entry per action that extends in', () => {
    const registry = loadModule(stealing('# action pick-pocket', 'extends: steal', '', '# action pick-the-lock', 'extends: steal'));

    expect([...registry.locales.base].filter(([, entry]) => entry.text === 'A hand closes on your wrist.').map(([key]) => key)).toEqual(['thieving.action.steal.say.0']);
  });

  it('refuses a chain that closes on itself, naming the way round', () => {
    expect(() => loadModule(module('# action one', 'extends: two', '', '# action two', 'extends: three', '', '# action three', 'extends: one'))).toThrow(
      /# action thieving\.one extends itself: thieving\.one -> thieving\.two -> thieving\.three -> thieving\.one/,
    );
  });

  it('refuses a body that only makes sense apart from the one it lands on', () => {
    expect(() => loadModule(module('# action steal', 'instant', 'say: Gone.', '', '# action pick-pocket', 'extends: steal', 'rate: 12'))).toThrow(/an instant action takes no rate:/);
  });

  it('is written once, so a second one is refused where it stands', () => {
    expect(() => loadModule(stealing('# action pick-pocket', 'extends: steal', 'extends: steal'))).toThrow(/extends is defined more than once/);
  });
});
