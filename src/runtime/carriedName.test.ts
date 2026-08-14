import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/registry';
import { carriedName } from './carriedName';
import { localizerFor } from './localized';

const SWORD = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# item iron-sword', 'title: Iron Sword', 'slot: mainhand'].join('\n');
const SPANISH = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.iron-sword.title: Espada de Hierro', 'engine.item.modified: {item} modificada'].join('\n');

const registry = loadUniverse([engineLocale(), { name: 'forge', text: SWORD }, { name: 'forge-es', text: SPANISH }]);
const named = (language: string, grown: boolean): string => carriedName(localizerFor(registry, language), 'item', 'forge.iron-sword', grown);

describe('what a carried thing is called', () => {
  it('calls a stack copy its item’s title, and adds nothing to it', () => {
    expect(named('en', false)).toBe('Iron Sword');
  });

  // c16: the descriptor is the whole of what says a copy is grown.
  it('calls a grown copy the same title under a descriptor', () => {
    expect(named('en', true)).toBe('Modified Iron Sword');
  });

  // Two copies of one base are one name; which is which is the stat summary
  // beneath, so nothing here has an id to be given.
  it('names two copies of one base alike, because it is told nothing that could tell them apart', () => {
    expect(named('en', true)).toBe(named('en', true));
  });

  // c3: the descriptor is the engine's own word, so it is a pattern rather than
  // a prefix — and a language that puts it after the noun may.
  it('calls both in the language being played', () => {
    expect(named('es', false)).toBe('Espada de Hierro');
    expect(named('es', true)).toBe('Espada de Hierro modificada');
  });

  it('shows the key where the played language has no title for it', () => {
    expect(named('fr', false)).toBe('forge.item.iron-sword.title');
  });
});
