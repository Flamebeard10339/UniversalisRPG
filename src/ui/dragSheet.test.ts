import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
