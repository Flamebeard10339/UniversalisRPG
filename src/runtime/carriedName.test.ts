import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { carriedName } from './carriedName';
import { localizerFor } from './localized';

const SWORD = ['# info forge', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', '', '# item iron-sword', 'title: Iron Sword', 'slot: mainhand'].join('\n');
const SPANISH = ['# info forge-es', 'version: 1.0.0', 'dependencies:', '  forge', '', '# locale es', 'forge.item.iron-sword.title: Espada de Hierro'].join('\n');

const GROWN = '18273';

const registry = loadUniverse([engineLocale(), { name: 'forge', text: SWORD }, { name: 'forge-es', text: SPANISH }]);
const named = (language: string, copy: string | null): string => carriedName(localizerFor(registry, language), 'item', 'forge.iron-sword', copy);

describe('what a carried thing is called', () => {
  it('calls a stack copy its item’s title, and adds nothing to it', () => {
    expect(named('en', null)).toBe('Iron Sword');
  });

  it('calls a grown copy exactly what its base is called, since every one of them is grown', () => {
    expect(named('en', GROWN)).toBe('Iron Sword');
  });

  it('names two copies of one base alike, because the ordinal is what it is referenced by and not what it is called', () => {
    expect(named('en', GROWN)).toBe(named('en', '4'));
  });

  it('calls both alike, in the language being played', () => {
    expect(named('es', null)).toBe('Espada de Hierro');
    expect(named('es', GROWN)).toBe('Espada de Hierro');
  });

  it('shows the key where the played language has no title for it', () => {
    expect(named('fr', null)).toBe('forge.item.iron-sword.title');
  });

  it('names a copy by its template and its ordinal where the played language has no title for the template', () => {
    expect(named('fr', GROWN)).toBe('forge.iron-sword#18273');
    expect(named('fr', '4')).toBe('forge.iron-sword#4');
  });
});
