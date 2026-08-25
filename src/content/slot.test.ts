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
    expect(() => loadModule(lines(ISLAND, '', '# slot head', 'title: Head', '', '# item hat', 'slot: head'))).toThrow(/# item island.hat slot: names head, which no # entity declares among its equipment-slots:/);
  });

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
    expect(missingTranslations(registry.locales, 'es')).toContain('slot.offhand.title');
  });

  it('keeps where a slot sits on the body, and prints it back where it was written', () => {
    const source: ModuleSource = { name: 'island', text: lines(ISLAND, '', '# slot mainhand', 'title: Main Hand', 'at: 1 2') };
    const parsed = parseModuleSource(source);
    const trip = roundTripModule(loadUniverse([source]), { info: parsed.info, globals: declaredGlobalIds(parsed) }, (printed) => loadUniverseWithDiagnostics([{ ...source, text: printed }]));

    expect(loadModule(source.text).slots.get('mainhand')?.at).toEqual({ column: 1, row: 2 });
    expect(trip.differences).toEqual([]);
    expect(trip.printed).toContain(lines('# slot mainhand', 'title: Main Hand', 'at: 1 2'));
  });

  it('leaves a slot that says nothing about where it sits without a position, rather than guessing one', () => {
    expect(loadModule(lines(ISLAND, '', '# slot mainhand', 'title: Main Hand')).slots.get('mainhand')?.at).toBeUndefined();
  });

  it('refuses a position that is not a column and a row, both counted from 1', () => {
    expect(() => loadModule(lines(ISLAND, '', '# slot mainhand', 'at: 1'))).toThrow(/expected a row after the column/);
    expect(() => loadModule(lines(ISLAND, '', '# slot mainhand', 'at: 0 1'))).toThrow(/a column is counted from 1/);
    expect(() => loadModule(lines(ISLAND, '', '# slot mainhand', 'at: 1 0'))).toThrow(/a row is counted from 1/);
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
