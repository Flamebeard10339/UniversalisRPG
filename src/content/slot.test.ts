import { describe, expect, it } from 'vitest';
import { localeKey, missingTranslations } from './locale';
import { loadModule, loadUniverse } from './load';
import { roundTripModule } from './serialize';
import { type Registry } from './registry';
import { loadUniverseWithDiagnostics } from './load';
import { parseModuleSource, type ModuleSource } from './universe';
import { declaredGlobalIds } from './serialize';

const NL = String.fromCharCode(10);

const lines = (...body: string[]): string => body.join(NL);

const ISLAND = lines('# info island', 'version: 1.0.0', '', '# entity player', 'title: You', 'equipment-slots: mainhand, offhand', '', '# item sword', 'title: Sword', 'slot: mainhand');

const titleOf = (registry: Registry, slot: string): string | undefined => registry.locales.base.get(localeKey(null, 'slot', slot, 'title'))?.text;

describe('a slot is a word with a key (c10)', () => {
  it('keys every slot the vocabulary holds, declared or not', () => {
    const registry = loadModule(ISLAND);

    expect(titleOf(registry, 'mainhand')).toBe('Mainhand');
    expect(titleOf(registry, 'offhand')).toBe('Offhand');
    expect(registry.locales.addressable.has('slot.mainhand.title')).toBe(true);
  });

  it('takes the words a # slot declares, and keeps the id the vocabulary named', () => {
    const registry = loadModule(lines(ISLAND, '', '# slot mainhand', 'title: Main Hand'));

    expect(titleOf(registry, 'mainhand')).toBe('Main Hand');
    expect(registry.slots.get('mainhand')?.title).toBe('Main Hand');
    // The declaration is words and not vocabulary: what an item may name is
    // still what an entity wears.
    expect(() => loadModule(lines(ISLAND, '', '# slot head', 'title: Head', '', '# item hat', 'slot: head'))).toThrow(/# item island.hat slot: names head, which no # entity declares among its equipment-slots:/);
  });

  // The whole reason the key is not hung on the entity that declares the slot:
  // two entities wearing `mainhand` are one slot, and one slot is one key.
  it('gives one slot one key however many entities declare it', () => {
    const shared = lines(ISLAND, '', '# entity guard', 'title: Guard', 'equipment-slots: mainhand');

    expect([...loadModule(shared).locales.addressable].filter((key) => key.startsWith('slot.mainhand.'))).toEqual(['slot.mainhand.title']);
  });

  it('reaches a # locale, which is the whole of what the finding asked for', () => {
    const spanish: ModuleSource = {
      name: 'es',
      text: lines('# info island-es', 'version: 1.0.0', 'dependencies:', '  island', '', '# locale es', 'slot.mainhand.title: Mano principal'),
    };
    const registry = loadUniverse([{ name: 'island', text: ISLAND }, spanish]);

    expect(registry.locales.declared.get('es')?.get('slot.mainhand.title')).toBe('Mano principal');
    // And an untranslated one is reported, rather than reaching a player as an
    // id nobody can read.
    expect(missingTranslations(registry.locales, 'es')).toContain('slot.offhand.title');
  });

  it('prints a declared slot back out and drops a generated title, the way a stat does', () => {
    const source: ModuleSource = {
      name: 'island',
      text: lines(ISLAND, '', '# slot mainhand', 'title: Main Hand', '', '# slot offhand'),
    };
    const parsed = parseModuleSource(source);
    const trip = roundTripModule(loadUniverse([source]), { info: parsed.info, globals: declaredGlobalIds(parsed) }, (printed) => loadUniverseWithDiagnostics([{ ...source, text: printed }]));

    expect(trip.diagnostics).toEqual([]);
    expect(trip.differences).toEqual([]);
    expect(trip.printed).toContain(lines('# slot mainhand', 'title: Main Hand'));
    expect(trip.printed).toContain('# slot offhand');
    expect(trip.printed).not.toContain('title: Offhand');
  });
});
