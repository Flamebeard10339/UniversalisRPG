import { Registry } from '../../src/content/registry';
import { printDirective, type Directive } from '../../src/content/sections/test';
import { createGameState, GameState } from '../../src/runtime/runtime';
import { sessionOver, testSteps, walkTest, watchSteps } from '../../src/runtime/session';
import { serializeSave } from '../../src/runtime/save';

interface Walked {
  readonly directive: Directive;
  readonly pass: number | null;
  readonly failure: string | null;
}

export interface Moment {
  readonly at: number;
  readonly pass: number | null;
  readonly wrote: string;
  readonly moved: string[];
  readonly failure: string | null;
}

const HEAD = 30;

const TAIL = 20;

type Held = Record<string, unknown>;

const flat = (held: Held, under = ''): Map<string, string> => {
  const rows = new Map<string, string>();
  for (const [key, value] of Object.entries(held)) {
    const path = under === '' ? key : `${under}.${key}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) for (const [deep, held] of flat(value as Held, path)) rows.set(deep, held);
    else rows.set(path, JSON.stringify(value));
  }
  return rows;
};

const NOISE = /^(resourceRateRemainders|rng|instances\.next|log)\b/;

export function moved(before: Held, after: Held): string[] {
  const was = flat(before);
  const now = flat(after);
  const said: string[] = [];
  for (const [key, value] of now) {
    if (NOISE.test(key) || was.get(key) === value) continue;
    said.push(was.has(key) ? `${key} ${was.get(key)!} → ${value}` : `${key} ${value}`);
  }
  for (const key of was.keys()) {
    if (!NOISE.test(key) && !now.has(key)) said.push(`${key} gone`);
  }
  return said.sort();
}

const heading = (step: Walked): string => printDirective(step.directive).split(/\r?\n/)[0]!;

export function tracedRun(registry: Registry, testId: string): { moments: Moment[]; failure: string | null; state: GameState } {
  const state = createGameState();
  const session = sessionOver(registry, state);
  const steps = testSteps(testId, registry);
  const moments: Moment[] = [];
  let before = JSON.parse(serializeSave(state, registry, [])) as Held;
  let at = 0;

  watchSteps(session, (step: Walked) => {
    const after = JSON.parse(serializeSave(state, registry, [])) as Held;
    at += 1;
    moments.push({ at, pass: step.pass, wrote: heading(step), moved: moved(before, after), failure: step.failure });
    before = after;
  });

  const { failure } = walkTest(session, steps);
  return { moments, failure, state };
}

export function traceLines(testId: string, run: { moments: readonly Moment[]; failure: string | null }): string[] {
  const lines = [`${testId} — ${String(run.moments.length)} step(s) walked`];
  const shown = (moment: Moment): string => {
    const where = moment.pass === null ? '' : `pass ${String(moment.pass)}  `;
    const moved = moment.moved.length === 0 ? 'nothing moved' : moment.moved.join(', ');
    return `  ${String(moment.at).padStart(5)}  ${where}${moment.wrote}${moment.failure === null ? '' : '  ← REFUSED'}\n           ${moved}`;
  };
  const held = run.moments;
  if (held.length <= HEAD + TAIL) lines.push(...held.map(shown));
  else {
    lines.push(...held.slice(0, HEAD).map(shown));
    lines.push(`  … ${String(held.length - HEAD - TAIL)} step(s) not printed, between step ${String(HEAD + 1)} and step ${String(held.length - TAIL)}`);
    lines.push(...held.slice(-TAIL).map(shown));
  }
  lines.push(run.failure === null ? `${testId}: PASSED` : `${testId}: FAILED — ${run.failure}`);
  return lines;
}

export const AFTER_A_FAILURE = 6;

const MOVED_SHOWN = 12;

const movedShortly = (moved: readonly string[]): string => {
  if (moved.length === 0) return 'nothing moved';
  if (moved.length <= MOVED_SHOWN) return moved.join(', ');
  return `${moved.slice(0, MOVED_SHOWN).join(', ')}, and ${String(moved.length - MOVED_SHOWN)} more`;
};

export function afterAFailure(registry: Registry, testId: string, count = AFTER_A_FAILURE): string[] {
  let run: { moments: Moment[]; failure: string | null };
  try {
    run = tracedRun(registry, testId);
  } catch {
    return [];
  }
  if (run.moments.length === 0) return [];
  if (run.failure === null) return ['    it walked when it was run again, so what it does depends on something this run did not repeat'];
  const tail = run.moments.slice(-count);
  return [
    `    what the world was doing over the last ${String(tail.length)} of its ${String(run.moments.length)} step(s):`,
    ...tail.map((moment) => `      ${String(moment.at).padStart(4)}  ${moment.pass === null ? '' : `pass ${String(moment.pass)}  `}${moment.wrote}${moment.failure === null ? '' : '  ← REFUSED'}
            ${movedShortly(moment.moved)}`),
  ];
}

export function traceTests(registry: Registry, named: readonly string[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = true;
  for (const id of named) {
    try {
      const run = tracedRun(registry, id);
      lines.push(...traceLines(id, run));
      if (run.failure !== null) ok = false;
    } catch (error) {
      lines.push(`${id}: threw before it could be traced — ${error instanceof Error ? error.message : String(error)}`);
      ok = false;
    }
    lines.push('');
  }
  return { lines, ok };
}
