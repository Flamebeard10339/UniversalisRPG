import { describe, expect, it } from 'vitest';
import { ClusterReport, PayloadReport, PlaneReport, PositionReport, SlotReport } from '../src/runtime/planeReport';
import { formatPlane, formatPlanes } from './planeView';

const flat = (statId: string, amount: number, scale = 1): PayloadReport => ({ statId, effective: { percent: false, amount: { min: amount, max: amount } }, scale });

const position = (over: Partial<PositionReport> = {}): PositionReport => ({
  position: 1,
  passive: 'hale',
  title: 'Hale',
  standing: 'unreached',
  free: false,
  payloads: [],
  ...over,
});

const slot = (over: Partial<SlotReport> = {}): SlotReport => ({ direction: 'e', standing: 'unreached', beyond: null, ...over });

const cluster = (over: Partial<ClusterReport> = {}): ClusterReport => ({
  hex: '0,0',
  jewel: 'mod.core',
  title: 'Core',
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
  title: 'Blade',
  level: 3,
  maxLevel: 20,
  spent: 1,
  remaining: 2,
  clusters: [],
  contributions: [],
  ...over,
});

const shown = (report: PlaneReport, worn = false): string => formatPlane(report, worn).join('\n');

describe('formatPlane', () => {
  it('heads a plane with the id the verbs take, the level and the points left', () => {
    expect(formatPlane(plane(), false)[0]).toBe('Blade — 1 (blade) — level 3/20, 1 spent, 2 points left');
  });

  it('says a single point in the singular, and marks a plane the player is wearing', () => {
    expect(formatPlane(plane({ remaining: 1 }), true)[0]).toBe('Blade — 1 (blade) — worn — level 3/20, 1 spent, 1 point left');
  });

  it('addresses the origin as an origin and a slotted cluster by the slot it came through', () => {
    const entered = cluster({ hex: '1,-1', jewel: 'mod.junction', shape: 'point', entry: { hex: '0,0', direction: 'ne' } });
    expect(shown(plane({ clusters: [cluster(), entered] }))).toContain('  0,0  core · spindle · origin · mods 0/2');
    expect(shown(plane({ clusters: [entered] }))).toContain('  1,-1  junction · point · via 0,0 ne · mods 0/2');
  });

  it('names every effect a cluster carries against its mod-slot count', () => {
    const carried = cluster({
      modSlots: 2,
      effects: [
        { id: 'mod.orb', title: 'Orb of the Edge', effect: { statId: 'mod.attack', percent: 25 } },
        { id: 'mod.lesser', title: 'Lesser Orb', effect: { statId: 'mod.attack', percent: 10 } },
      ],
    });
    expect(shown(plane({ clusters: [carried] }))).toContain('mods 2/2\n       Orb of the Edge +25% attack, Lesser Orb +10% attack');
  });

  it('spells the four standings a point can be in', () => {
    const positions = [
      position({ position: 1, standing: 'allocated', free: true }),
      position({ position: 2, standing: 'allocated' }),
      position({ position: 3, standing: 'available' }),
      position({ position: 4, standing: 'unreached' }),
    ];
    const rows = formatPlane(plane({ clusters: [cluster({ positions, slots: [slot({ standing: 'blocked', beyond: '1,-1' })] })] }), false);
    expect(rows.map((row) => row.trim().split(/\s+/)[0])).toEqual(['Blade', '', '0,0', 'free', 'spent', 'ready', 'locked', 'dead']);
  });

  it('states the effective payload first and the factor that made it after', () => {
    const scaled = position({ title: 'Honed', standing: 'allocated', payloads: [flat('mod.attack', 4.05, 1.35)] });
    expect(shown(plane({ clusters: [cluster({ positions: [scaled] })] }))).toContain('Honed  +4.05 attack ×1.35');
  });

  it('leaves the factor off a payload nothing scaled', () => {
    const plain = position({ title: 'Honed', standing: 'allocated', payloads: [flat('mod.attack', 3)] });
    expect(shown(plane({ clusters: [cluster({ positions: [plain] })] }))).toContain('Honed  +3 attack');
    expect(shown(plane({ clusters: [cluster({ positions: [plain] })] }))).not.toContain('×');
  });

  it('writes a percent payload as a percent and a negative one with its sign', () => {
    const both = [
      position({ position: 1, title: 'Brutal', payloads: [{ statId: 'mod.attack', effective: { percent: true, amount: 10.8 }, scale: 1.35 }] }),
      position({ position: 2, title: 'Cursed', payloads: [flat('mod.attack', -3)] }),
    ];
    const rows = shown(plane({ clusters: [cluster({ positions: both })] }));
    expect(rows).toContain('+10.8% attack ×1.35');
    expect(rows).toContain('-3 attack');
  });

  it('marks a position the jewel left empty rather than leaving the row bare', () => {
    const empty = position({ passive: null, title: null, standing: 'allocated' });
    expect(shown(plane({ clusters: [cluster({ positions: [empty] })] }))).toContain('spent  pos 1   (empty)');
  });

  it('offers allocate: for a position and a slot that can take the next point', () => {
    const ready = cluster({ hex: '1,-1', positions: [position({ position: 6, standing: 'available' })], slots: [slot({ direction: 'ne', standing: 'available' })] });
    const rows = shown(plane({ clusters: [ready] }));
    expect(rows).toContain('allocate: 1 at 1,-1 position 6');
    expect(rows).toContain('allocate: 1 at 1,-1 slot ne');
  });

  it('offers slot: for an allocated slot still waiting for a jewel', () => {
    const waiting = cluster({ hex: '1,0', slots: [slot({ direction: 'se', standing: 'allocated' })] });
    expect(shown(plane({ clusters: [waiting] }))).toContain('slot: 1 at 1,0 se with <jewel>');
  });

  it('offers nothing to type for a slot that is filled, blocked or out of reach', () => {
    const settled = cluster({
      slots: [
        slot({ direction: 'e', standing: 'allocated', beyond: '1,0' }),
        slot({ direction: 'ne', standing: 'blocked', beyond: '1,-1' }),
        slot({ direction: 'se', standing: 'unreached' }),
      ],
    });
    const rows = formatPlane(plane({ clusters: [settled] }), false);
    expect(rows.slice(3)).toEqual([
      '    spent  slot e  holds 1,0',
      '    dead   slot ne blocked by 1,-1',
      '    locked slot se',
    ]);
  });

  it('aligns what a position pays into one column across a cluster', () => {
    const positions = [
      position({ position: 1, title: 'Hale', standing: 'allocated', payloads: [flat('mod.max-health', 15)] }),
      position({ position: 2, title: 'Swift Hands', standing: 'available', payloads: [flat('mod.attack-rate', 2)] }),
    ];
    const rows = formatPlane(plane({ clusters: [cluster({ positions })] }), false).slice(3);
    expect(rows).toEqual([
      '    spent  pos 1   Hale         +15 max-health',
      '    ready  pos 2   Swift Hands  +2 attack-rate  allocate: 1 at 0,0 position 2',
    ]);
  });

  it('separates one plane from the next with a blank line and shows none at all for nothing grown', () => {
    expect(formatPlanes([plane(), plane({ instance: '2' })], [])[0]).toBe('');
    expect(formatPlanes([], [])).toEqual([]);
  });

  it('marks worn by instance id rather than by template', () => {
    expect(formatPlanes([plane()], ['2'])[1]).not.toContain('worn');
    expect(formatPlanes([plane()], ['1'])[1]).toContain('worn');
  });
});
