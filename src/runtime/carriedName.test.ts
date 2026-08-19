import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { carriedName } from './carriedName';
import { localizerFor } from './localized';

const SWORD = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# item iron-sword', 'title: Iron Sword', 'slot: mainhand'].join('\n');
const SPANISH = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.iron-sword.title: Espada de Hierro', 'engine.item.modified: {item} modificada'].join('\n');

// The ordinal minting gave the one grown copy these tests name.
const GROWN = '18273';

const registry = loadUniverse([engineLocale(), { name: 'forge', text: SWORD }, { name: 'forge-es', text: SPANISH }]);
const named = (language: string, copy: string | null): string => carriedName(localizerFor(registry, language), 'item', 'forge.iron-sword', copy);

describe('what a carried thing is called', () => {
  it('calls a stack copy its item’s title, and adds nothing to it', () => {
    expect(named('en', null)).toBe('Iron Sword');
  });

  // c16: the descriptor is the whole of what says a copy is grown.
  it('calls a grown copy the same title under a descriptor', () => {
    expect(named('en', GROWN)).toBe('Modified Iron Sword');
  });

  // Two copies of one base are one name; which is which is the stat summary
  // beneath, so nothing here has an id to be given.
  it('names two copies of one base alike, because the ordinal is what it is referenced by and not what it is called', () => {
    expect(named('en', GROWN)).toBe(named('en', '4'));
  });

  // c3: the descriptor is the engine's own word, so it is a pattern rather than
  // a prefix — and a language that puts it after the noun may.
  it('calls both in the language being played', () => {
    expect(named('es', null)).toBe('Espada de Hierro');
    expect(named('es', GROWN)).toBe('Espada de Hierro modificada');
  });

  it('shows the key where the played language has no title for it', () => {
    expect(named('fr', null)).toBe('forge.item.iron-sword.title');
  });

  // c1: a copy has no key of its own — a locale can address only a template —
  // so where the template has no words the copy is named by what it is a copy
  // of and which one it is, and the two copies above stop being one name.
  it('names a copy by its template and its ordinal where the played language has no title for the template', () => {
    expect(named('fr', GROWN)).toBe('forge.iron-sword#18273');
    expect(named('fr', '4')).toBe('forge.iron-sword#4');
  });
});
