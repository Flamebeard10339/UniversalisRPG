import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

const room = (...lines: string[]): string => ['# location shore', 'x: 0, y: 0', 'starting', 'entities:', '  bollard', '', '# entity bollard', 'title: A Bollard', ...lines].join('\n');

describe('# entity examine:', () => {
  it('is offered as an action addressed examine, which says those words and nothing else', () => {
    const registry = loadModule(room('examine: Iron, and cold to the hand.'));
    const [action, ...rest] = registry.entities.get('bollard')!.actions;

    expect(rest).toEqual([]);
    expect(action.label).toBe('Examine');
    expect(action.kind).toBe('instant');
    expect(action.results).toEqual([{ kind: 'say', text: 'Iron, and cold to the hand.', key: 'entity.bollard.examine' }]);
  });

  it('says those words under the key the field already holds them at, rather than a second copy of them', () => {
    const registry = loadModule(room('examine: Iron, and cold to the hand.'));

    expect(registry.locales.base.get('entity.bollard.examine')!.text).toBe('Iron, and cold to the hand.');
    expect([...registry.locales.base].filter(([, entry]) => entry.text === 'Iron, and cold to the hand.')).toHaveLength(1);
  });

  it('is named the same way a written action is, so a # test can walk up to it', () => {
    const registry = loadModule([room('examine: Iron, and cold to the hand.'), '', '# test walk', 'use: entity.bollard.examine'].join('\n'));

    expect(registry.namespace.has('action-slug', 'entity.bollard.examine')).toBe(true);
    expect([...registry.tests.keys()]).toEqual(['walk']);
  });

  it('leaves the words unspoken by anyone else, since no action is minted where the field is not written', () => {
    expect(loadModule(room('stats: might 1', '', '# stat might')).entities.get('bollard')!.actions).toEqual([]);
  });
});

describe('an entity a location stands', () => {
  const refusal = /# entity bollard: stands in shore and offers a player nothing there/;

  it('is refused when nothing it declares reaches a player', () => {
    expect(() => loadModule(room())).toThrow(refusal);
  });

  it('stands on any one of examine:, an action, uses:, stations:, keeps shop:, stats: or a dialogue that owns it', () => {
    expect(() => loadModule(room('examine: Iron, and cold to the hand.'))).not.toThrow();
    expect(() => loadModule(room('lean on it:', '  say: It holds.'))).not.toThrow();
    expect(() => loadModule(room('uses: shove', '', '# action shove', 'instant', 'say: It holds.'))).not.toThrow();
    expect(() => loadModule(room('stations: mooring', '', '# station mooring'))).not.toThrow();
    expect(() => loadModule(room('keeps shop: chandlery', '', '# item penny', '', '# shop chandlery', 'coin: penny'))).not.toThrow();
    expect(() => loadModule(room('stats: might 1', '', '# stat might'))).not.toThrow();
    expect(() => loadModule(room('', '# dialogue chat', 'owner = bollard', 'node greet:', '  It says nothing, at length.'))).not.toThrow();
  });

  it('is asked of what an author wrote, not of what a condition would allow, so a gated offer still counts', () => {
    expect(() => loadModule(room('hidden if: sunk', 'flags: sunk', 'lean on it:', '  requires: sunk', '  say: It holds.'))).not.toThrow();
  });

  it('is not asked of an entity no location stands, which is what the entity a game is played as has in common with a template', () => {
    expect(() => loadModule(['# location shore', 'x: 0, y: 0', 'starting', '', '# entity player', 'title: You'].join('\n'))).not.toThrow();
    expect(() => loadModule(['# location shore', 'x: 0, y: 0', 'starting', '', '# entity bollard', 'title: A Bollard'].join('\n'))).not.toThrow();
  });
});
