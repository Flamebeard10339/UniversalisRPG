import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gripFor, type Carried, type Grip } from './DragSheet';
import { ZOOM_MAX, ZOOM_MIN, type Point } from './viewport';

const here = fileURLToPath(new URL('.', import.meta.url));

const SHEET = 'src/ui/DragSheet.tsx';

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const SOURCES = modulesUnder(here, 'src/ui');

const RIDERS = SOURCES.filter((source) => source.file !== SHEET && /from '\.\/DragSheet'/.test(source.text));

const A_GESTURE = [/onMouseDown\b/, /onTouchStart\b/, /onTouchMove\b/, /onWheel\b/, /onPointer(?:Down|Move|Up)\b/, /addEventListener\(\s*'(?:mousemove|mouseup|touchmove|touchstart|touchend|touchcancel|wheel)'/];

const A_CLAMP = [/\bclampPan\b/, /\bsettled\b/, /\bzoomByWheel\b/, /\bpanAfterZoom\b/, /\bspanBetween\b/, /\bmidpoint\b/];

const THE_GESTURE = [/onMouseDown\b/, /onTouchStart\b/, /onWheel\b/, /addEventListener\(\s*'touchmove'/];
const THE_CLAMP = A_CLAMP.filter((each) => !/clampPan/.test(each.source));

describe('the sheet every pannable surface is drawn on', () => {
  it('reads the tree it is a rule about, and finds surfaces riding on it', () => {
    expect(SOURCES.map((source) => source.file)).toContain(SHEET);
    expect(RIDERS.length).toBeGreaterThan(0);
  });

  it('is the only module under the shell that holds a gesture on a pannable surface', () => {
    for (const rider of RIDERS) {
      for (const gesture of A_GESTURE) expect(rider.text, `${rider.file} holds ${gesture} of its own rather than riding the sheet`).not.toMatch(gesture);
    }
  });

  it('is the only place a sheet is held to its own room', () => {
    for (const rider of RIDERS) {
      for (const clamp of A_CLAMP) expect(rider.text, `${rider.file} works out for itself where the sheet may go`).not.toMatch(clamp);
    }
  });

  it('holds the gesture and the clamp itself, so neither rule is vacuous', () => {
    const sheet = SOURCES.find((source) => source.file === SHEET)!;

    for (const gesture of THE_GESTURE) expect(sheet.text, `${SHEET} does not hold ${gesture}`).toMatch(gesture);
    for (const clamp of THE_CLAMP) expect(sheet.text, `${SHEET} does not hold ${clamp}`).toMatch(clamp);
  });
});

function pressing(x: number, y: number): { clientX: number; clientY: number; stopPropagation(): void; pointerId: number; currentTarget: { setPointerCapture(id: number): void } } {
  return { clientX: x, clientY: y, stopPropagation: () => undefined, pointerId: 1, currentTarget: { setPointerCapture: () => undefined } };
}

function carrying(zoom = 1): { grip: Grip; held: { current: { id: string; from: Point } | null }; drawn: Array<Carried | null>; rested: Array<Carried | null> } {
  const held: { current: { id: string; from: Point } | null } = { current: null };
  const drawn: Array<Carried | null> = [];
  const rested: Array<Carried | null> = [];
  return { grip: gripFor('hall', held, zoom, { hold: (next) => void drawn.push(next), rest: (report) => void rested.push(report) }), held, drawn, rested };
}

const press = (grip: Grip, event: ReturnType<typeof pressing>): void => grip.onPointerDown(event as never);
const move = (grip: Grip, event: ReturnType<typeof pressing>): void => grip.onPointerMove(event as never);
const lift = (grip: Grip, event: ReturnType<typeof pressing>): void => grip.onPointerUp(event as never);

describe('picking a thing up off the sheet and putting it down', () => {
  it('draws it where the finger has taken it, in the sheet own pixels', () => {
    const carried = carrying(2);
    press(carried.grip, pressing(100, 100));
    move(carried.grip, pressing(140, 80));

    expect(carried.drawn).toEqual([{ id: 'hall', by: { x: 0, y: 0 } }, { id: 'hall', by: { x: 20, y: -10 } }]);
  });

  it('reports where it was let go of, once, when the finger has taken it somewhere', () => {
    const carried = carrying();
    press(carried.grip, pressing(0, 0));
    move(carried.grip, pressing(30, 40));
    lift(carried.grip, pressing(30, 40));

    expect(carried.rested).toEqual([{ id: 'hall', by: { x: 30, y: 40 } }]);
    expect(carried.held.current).toBeNull();
  });

  it('reports nothing for a press that went nowhere, and nothing for one inside the slop', () => {
    for (const [x, y] of [[0, 0], [3, 0], [0, -4], [4, 4]]) {
      const carried = carrying();
      press(carried.grip, pressing(50, 50));
      lift(carried.grip, pressing(50 + x, 50 + y));

      expect(carried.rested, `let go ${x},${y} from where it was picked up`).toEqual([null]);
    }
  });

  for (const zoom of [ZOOM_MIN, 1, ZOOM_MAX]) {
    it(`measures the slop where the finger is and not where the sheet is, at ×${zoom}`, () => {
      const near = carrying(zoom);
      press(near.grip, pressing(0, 0));
      lift(near.grip, pressing(5, 0));

      expect(near.rested).toEqual([null]);
    });

    it(`reports a press that travelled at ×${zoom}`, () => {
      const far = carrying(zoom);
      press(far.grip, pressing(0, 0));
      lift(far.grip, pressing(40, 0));

      expect(far.rested).toEqual([{ id: 'hall', by: { x: 40 / zoom, y: 0 } }]);
    });
  }

  it('lets go when the browser takes the pointer away, and reports nothing', () => {
    const carried = carrying();
    press(carried.grip, pressing(0, 0));
    move(carried.grip, pressing(90, 90));
    carried.grip.onPointerCancel(pressing(90, 90) as never);

    expect(carried.rested).toEqual([null]);
    expect(carried.held.current).toBeNull();
  });

  it('ignores a pointer that belongs to something else', () => {
    const carried = carrying();
    carried.held.current = { id: 'beach', from: { x: 0, y: 0 } };

    move(carried.grip, pressing(90, 90));
    lift(carried.grip, pressing(90, 90));
    carried.grip.onPointerCancel(pressing(90, 90) as never);

    expect(carried.drawn).toEqual([]);
    expect(carried.rested).toEqual([]);
    expect(carried.held.current).toEqual({ id: 'beach', from: { x: 0, y: 0 } });
  });
});
