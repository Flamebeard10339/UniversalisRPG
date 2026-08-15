import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../src/content/engineLocale';
import { localizerFor } from '../src/runtime/localized';
import { asLocalized } from '../src/runtime/localizedFixture';
import { ClusterReport, PayloadReport, PlaneReport, PositionReport, SlotReport } from '../src/runtime/planeReport';
import { formatPlane } from './planeView';

// The engine's own English, which is where every word below now comes from: the
// file under test spells none of them (c5).
const localizer = localizerFor(loadInEnglish(''), 'en');

// One stat, keyed and named, so a row that spelled the id instead of the title
// reads differently from one that spelled the title.
const STAT = { statId: 'mod.attack', statTitle: asLocalized('Attack') };

const flat = (amount: number, scale = 1, statTitle = STAT.statTitle): PayloadReport => ({ statId: STAT.statId, statTitle, effective: { percent: false, amount: { min: amount, max: amount } }, scale });

const position = (over: Partial<PositionReport> = {}): PositionReport => ({
  position: 1,
  passive: 'hale',
  title: asLocalized('Hale'),
  standing: 'unreached',
  free: false,
  payloads: [],
  ...over,
});

const slot = (over: Partial<SlotReport> = {}): SlotReport => ({ direction: 'e', standing: 'unreached', beyond: null, ...over });

const cluster = (over: Partial<ClusterReport> = {}): ClusterReport => ({
  hex: '0,0',
  jewel: 'mod.core',
  title: asLocalized('Core'),
  shape: 'spindle',
  entry: null,
  effects: [],
  modSlots: 2,
  positions: [],
  slots: [],
  ...over,
});

const plane = (over: Partial<PlaneReport> = {}): PlaneReport => ({
  instance: '1',
  template: 'mod.blade',
  title: asLocalized('Blade'),
  name: asLocalized('Blade'),
  level: 3,
  maxLevel: 20,
  spent: 1,
  remaining: 2,
  clusters: [],
  contributions: [],
  ...over,
});

const shown = (report: PlaneReport, worn = false): string => formatPlane(report, worn, null, localizer).join('\n');

describe('formatPlane', () => {
  it('heads a plane with its name, the level and the points left', () => {
    expect(formatPlane(plane(), false, null, localizer)[0]).toBe('Blade — level 3/20, 1 spent, 2 points left');
  });

  it('says a single point in the singular, and marks a plane the player is wearing', () => {
    expect(formatPlane(plane({ remaining: 1 }), true, null, localizer)[0]).toBe('Blade — worn — level 3/20, 1 spent, 1 point left');
  });

  it('addresses the origin as an origin and a slotted cluster by the slot it came through', () => {
    const entered = cluster({ hex: '1,-1', jewel: 'mod.junction', title: asLocalized('Junction'), shape: 'point', entry: { hex: '0,0', direction: 'ne' } });
    expect(shown(plane({ clusters: [cluster(), entered] }))).toContain('  0,0  Core · spindle · origin · mods 0/2');
    expect(shown(plane({ clusters: [entered] }))).toContain('  1,-1  Junction · point · via 0,0 ne · mods 0/2');
  });

  it('names every effect a cluster carries against its mod-slot count', () => {
    const carried = cluster({
      modSlots: 2,
      effects: [
        { id: 'mod.orb', title: asLocalized('Orb of the Edge'), statTitle: STAT.statTitle, effect: { statId: 'mod.attack', percent: 25 } },
        { id: 'mod.lesser', title: asLocalized('Lesser Orb'), statTitle: STAT.statTitle, effect: { statId: 'mod.attack', percent: 10 } },
      ],
    });
    expect(shown(plane({ clusters: [carried] }))).toContain('mods 2/2\n       Orb of the Edge +25% Attack, Lesser Orb +10% Attack');
  });

  it('spells the four standings a point can be in', () => {
    const positions = [
      position({ position: 1, standing: 'allocated', free: true }),
      position({ position: 2, standing: 'allocated' }),
      position({ position: 3, standing: 'available' }),
      position({ position: 4, standing: 'unreached' }),
    ];
    const rows = formatPlane(plane({ clusters: [cluster({ positions, slots: [slot({ standing: 'blocked', beyond: '1,-1' })] })] }), false, null, localizer);
    expect(rows.map((row) => row.trim().split(/\s+/)[0])).toEqual(['Blade', '', '0,0', 'Free', 'Spent', 'Ready', 'Locked', 'Dead']);
  });

  it('states the effective payload first and the factor that made it after', () => {
    const scaled = position({ title: asLocalized('Honed'), standing: 'allocated', payloads: [flat(4.05, 1.35)] });
    expect(shown(plane({ clusters: [cluster({ positions: [scaled] })] }))).toContain('Honed  +4.05 Attack ×1.35');
  });

  it('leaves the factor off a payload nothing scaled', () => {
    const plain = position({ title: asLocalized('Honed'), standing: 'allocated', payloads: [flat(3)] });
    expect(shown(plane({ clusters: [cluster({ positions: [plain] })] }))).toContain('Honed  +3 Attack');
    expect(shown(plane({ clusters: [cluster({ positions: [plain] })] }))).not.toContain('×');
  });

  it('writes a percent payload as a percent and a negative one with its sign', () => {
    const both = [
      position({ position: 1, title: asLocalized('Brutal'), payloads: [{ ...STAT, effective: { percent: true, amount: 10.8 }, scale: 1.35 }] }),
      position({ position: 2, title: asLocalized('Cursed'), payloads: [flat(-3)] }),
    ];
    const rows = shown(plane({ clusters: [cluster({ positions: both })] }));
    expect(rows).toContain('+10.8% Attack ×1.35');
    expect(rows).toContain('-3 Attack');
  });

  it('marks a position the jewel left empty rather than leaving the row bare', () => {
    const empty = position({ passive: null, title: null, standing: 'allocated' });
    expect(shown(plane({ clusters: [cluster({ positions: [empty] })] }))).toContain('Spent  Position 1  (empty)');
  });

  // c17: the screen this is drawn above publishes each of these as an option a
  // number answers, so spelling the directive out beside it is the noise the
  // whole surface exists to retire. c4 is untouched — the line stays typeable.
  it('spells no directive beside a node the next point could go to', () => {
    const ready = cluster({ hex: '1,-1', positions: [position({ position: 6, standing: 'available' })], slots: [slot({ direction: 'ne', standing: 'available' })] });
    const waiting = cluster({ hex: '1,0', slots: [slot({ direction: 'se', standing: 'allocated' })] });
    const rows = shown(plane({ clusters: [ready, waiting] }));

    for (const verb of ['allocate:', 'slot:', 'feed:', '<jewel>']) expect(rows).not.toContain(verb);
    expect(rows).toContain('Ready  Position 6');
    expect(rows).toContain('Spent  Slot se');
  });

  it('offers nothing to type for a slot that is filled, blocked or out of reach', () => {
    const settled = cluster({
      slots: [
        slot({ direction: 'e', standing: 'allocated', beyond: '1,0' }),
        slot({ direction: 'ne', standing: 'blocked', beyond: '1,-1' }),
        slot({ direction: 'se', standing: 'unreached' }),
      ],
    });
    const rows = formatPlane(plane({ clusters: [settled] }), false, null, localizer);
    expect(rows.slice(3)).toEqual([
      '    Spent  Slot e      holds 1,0',
      '    Dead   Slot ne     blocked by 1,-1',
      '    Locked Slot se',
    ]);
  });

  it('aligns what a position pays into one column across a cluster', () => {
    const positions = [
      position({ position: 1, title: asLocalized('Hale'), standing: 'allocated', payloads: [flat(15, 1, asLocalized('Max Health'))] }),
      position({ position: 2, title: asLocalized('Swift Hands'), standing: 'available', payloads: [flat(2, 1, asLocalized('Attack Rate'))] }),
    ];
    const rows = formatPlane(plane({ clusters: [cluster({ positions })] }), false, null, localizer).slice(3);
    expect(rows).toEqual([
      '    Spent  Position 1  Hale         +15 Max Health',
      '    Ready  Position 2  Swift Hands  +2 Attack Rate',
    ]);
  });

  // c16: the copy is named the one way every surface names a carried thing, and
  // the ids the verbs take are the frame's business rather than the heading's.
  it('heads a plane with the name the engine published and no id at all', () => {
    expect(formatPlane(plane({ name: asLocalized('Modified Blade') }), false, null, localizer)[0]).toContain('Modified Blade —');
    expect(formatPlane(plane({ name: asLocalized('Modified Blade') }), false, null, localizer)[0]).not.toContain('mod.blade');
  });

  it('marks the hexagon in hand in the margin, and only that one', () => {
    const entered = cluster({ hex: '1,-1', jewel: 'mod.junction', title: asLocalized('Junction'), shape: 'point', entry: { hex: '0,0', direction: 'ne' } });
    const lines = formatPlane(plane({ clusters: [cluster(), entered] }), false, '1,-1', localizer);
    expect(lines).toContain('> 1,-1  Junction · point · via 0,0 ne · mods 0/2');
    expect(lines).toContain('  0,0  Core · spindle · origin · mods 0/2');
  });

  it('marks nothing when the hexagon in hand is not one this plane has', () => {
    expect(formatPlane(plane(), false, '4,4', localizer).filter((line) => line.startsWith('>'))).toEqual([]);
  });
});
