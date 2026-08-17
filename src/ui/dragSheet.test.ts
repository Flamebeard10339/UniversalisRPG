import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gripFor, type Carried, type Grip } from './DragSheet';
import { ZOOM_MAX, ZOOM_MIN, type Point } from './viewport';

const here = fileURLToPath(new URL('.', import.meta.url));

// The sheet, as the file it is. Everything below is a rule about what may name
// what this one names.
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

// Whoever draws on the sheet, derived rather than listed: a surface written
// next month is held to this without anyone adding it here.
const RIDERS = SOURCES.filter((source) => source.file !== SHEET && /from '\.\/DragSheet'/.test(source.text));

// A gesture, in the two forms a component could write one: React's own handler
// props, and the window listeners a drag has to keep going after the finger
// leaves the element it started on.
const A_GESTURE = [/onMouseDown\b/, /onTouchStart\b/, /onTouchMove\b/, /onWheel\b/, /onPointer(?:Down|Move|Up)\b/, /addEventListener\(\s*'(?:mousemove|mouseup|touchmove|touchstart|touchend|touchcancel|wheel)'/];

// The other half of what a second implementation would look like: a rider
// working out for itself where the sheet may be dragged to.
const A_CLAMP = [/\bclampPan\b/, /\bsettled\b/, /\bzoomByWheel\b/, /\bpanAfterZoom\b/, /\bspanBetween\b/, /\bmidpoint\b/];

// What the sheet is held to holding, so neither refusal above is vacuous.
// `clampPan` is not among them: `settled` is the door onto it, and a sheet
// reaching past that door would be the second implementation this file exists
// to refuse. The gestures are the three devices a phone and a desk between them
// have, plus the window listener a drag survives on.
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

// A pointer as the handlers read one. The two effects a press has on the DOM —
// stopping the event reaching the sheet, and capturing the pointer — are
// recorded rather than performed, because they are the wiring and what is under
// test is the decision.
function pressing(x: number, y: number): { clientX: number; clientY: number; stopPropagation(): void; pointerId: number; currentTarget: { setPointerCapture(id: number): void } } {
  return { clientX: x, clientY: y, stopPropagation: () => undefined, pointerId: 1, currentTarget: { setPointerCapture: () => undefined } };
}

// What one press did: what the sheet was told to draw, and what it was told to
// report when the gesture ended.
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

    // Halved, because the sheet is drawn at twice the size: what the finger
    // moved on the screen is half that much of the sheet.
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

  // The whole of what a tap is: a press that ended where it started. Reporting
  // one would stage a section edit restating coordinates nothing moved.
  it('reports nothing for a press that went nowhere, and nothing for one inside the slop', () => {
    for (const [x, y] of [[0, 0], [3, 0], [0, -4], [4, 4]]) {
      const carried = carrying();
      press(carried.grip, pressing(50, 50));
      lift(carried.grip, pressing(50 + x, 50 + y));

      expect(carried.rested, `let go ${x},${y} from where it was picked up`).toEqual([null]);
    }
  });

  // The same slop the pan is held to, measured on the screen rather than on the
  // sheet, and at both ends of the zoom the sheet allows. Zoomed in, five
  // pixels of finger is less of the sheet and still a tap; zoomed out it is
  // more of the sheet and still a tap, which is the half a single zoom hides.
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
    // The sheet can be panned again: a grip left held stands off every press.
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
