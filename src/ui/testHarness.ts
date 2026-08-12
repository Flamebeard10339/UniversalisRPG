import { askedOption } from '../runtime/command';
import type { PlayChoice, PlayView } from '../runtime/session';
import type { Driver, DriverSnapshot } from './driver';
import type { TestAction, TestSurface } from './testSurface';
import type { LogEntry } from './transcript';

export interface TestCommand {
  target: string;
  value?: unknown;
}

export interface TestResult {
  target: string;
  ok: boolean;
  state: TestState;
  error?: string;
}

export interface TestChoice {
  id: string;
  position: number;
  kind: PlayChoice['kind'];
  label: string;
  detail?: string;
  leadsTo?: string;
}

export interface TestState {
  fault: string | null;
  location: { id: string; title: string } | null;
  time: number | null;
  choices: TestChoice[];
  modal: { name: string; key: string; label: string; values?: string[] } | null;
  live: { label: string; active: boolean; progress: number; time: number } | null;
  resources: PlayView['resources'];
  discovered: PlayView['discovered'];
  player: PlayView['player'] | null;
  transcript: LogEntry[];
  // What the shell holds that the session does not: where the nav is standing,
  // where the map is looking. Keyed by the component that registered it, so a
  // component that is not mounted contributes no key rather than a stale one.
  surfaces: Record<string, unknown>;
}

export interface BrowserTestHarness {
  actions(): string[];
  state(): TestState;
  batch(commands: readonly TestCommand[]): Promise<TestResult[]>;
}

declare global {
  interface Window {
    __test?: BrowserTestHarness;
  }
}

interface TestHost {
  __test?: BrowserTestHarness;
}

// Where the mounted components put what they own. A surface is read through a
// getter and not stored, because the closures a component registers belong to
// the render that made them and the one an agent calls must be the current one.
export interface SurfaceRegistry {
  register(name: string, read: () => TestSurface): () => void;
  actions(): string[];
  find(target: string): TestAction | undefined;
  state(): Record<string, unknown>;
}

// A surface's action is called by the surface's name and the action's, joined:
// two components may both own a `plane` without one of them having to know that
// the other exists.
const JOIN = '.';

export function createSurfaceRegistry(): SurfaceRegistry {
  const mounted = new Map<string, () => TestSurface>();

  return {
    register(name, read) {
      mounted.set(name, read);
      return () => {
        if (mounted.get(name) === read) mounted.delete(name);
      };
    },
    actions: () => [...mounted].flatMap(([name, read]) => Object.keys(read().actions ?? {}).map((action) => `${name}${JOIN}${action}`)),
    find(target) {
      const at = target.indexOf(JOIN);
      if (at < 0) return undefined;
      return mounted.get(target.slice(0, at))?.().actions?.[target.slice(at + JOIN.length)];
    },
    state: () =>
      Object.fromEntries(
        [...mounted].flatMap(([name, read]) => {
          const held = read().state;
          return held ? [[name, held()]] : [];
        }),
      ),
  };
}

const SURFACES = createSurfaceRegistry();

export function registerTestSurface(name: string, read: () => TestSurface): () => void {
  return SURFACES.register(name, read);
}

export interface InstallOptions {
  settle?: () => Promise<void>;
  surfaces?: SurfaceRegistry;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function choicePosition(snapshot: DriverSnapshot, id: string): number {
  const at = snapshot.view?.choices.findIndex((choice) => choice.id === id) ?? -1;
  if (at < 0) throw new Error(`choice is not visible: ${id}`);
  return at + 1;
}

export function testState(snapshot: DriverSnapshot, surfaces: Record<string, unknown> = {}): TestState {
  const view = snapshot.view;
  const option = view ? askedOption(view.modals) : undefined;
  const modal = view && option ? view.modals[view.modals.length - 1] : undefined;

  return {
    fault: snapshot.fault,
    location: view ? { id: view.location.id, title: view.location.title } : null,
    time: view?.time ?? null,
    choices: (view?.choices ?? []).map((choice, at) => ({ ...choice, position: at + 1 })),
    modal:
      modal && option
        ? {
            name: modal.name,
            key: option.key,
            label: option.label,
            values: option.values ? [...option.values] : undefined,
          }
        : null,
    live: snapshot.live
      ? {
          label: snapshot.live.label,
          active: snapshot.live.active,
          progress: snapshot.live.progress,
          time: snapshot.live.time,
        }
      : null,
    resources: view?.resources ?? [],
    discovered: view?.discovered ?? [],
    player: view?.player ?? null,
    transcript: snapshot.transcript.entries.slice(-20),
    surfaces,
  };
}

export function installTestHarness(driver: Driver, host: TestHost = globalThis as TestHost, options: InstallOptions = {}): BrowserTestHarness {
  const actions = new Map<string, TestAction>();
  const settle = options.settle ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const surfaces = options.surfaces ?? SURFACES;
  const state = (): TestState => testState(driver.snapshot(), surfaces.state());

  actions.set('send', (value) => driver.send(text(value, 'line')));
  actions.set('choose', (value) => driver.choose(number(value, 'position')));
  actions.set('choice', (value) => driver.choose(choicePosition(driver.snapshot(), text(value, 'choice'))));
  actions.set('answer', (value) => {
    const given = record(value, 'answer');
    driver.answer(text(given.key, 'key'), text(given.value, 'value'));
  });
  actions.set('cancel', () => driver.cancel());

  const harness: BrowserTestHarness = {
    actions: () => [...actions.keys(), ...surfaces.actions()].sort(),
    state,
    async batch(commands) {
      const results: TestResult[] = [];
      for (const command of commands) {
        const action = actions.get(command.target) ?? surfaces.find(command.target);
        if (!action) {
          results.push({ target: command.target, ok: false, error: `action is not registered: ${command.target}`, state: state() });
          continue;
        }
        try {
          await action(command.value);
          await settle();
          results.push({ target: command.target, ok: true, state: state() });
        } catch (error) {
          results.push({ target: command.target, ok: false, error: error instanceof Error ? error.message : String(error), state: state() });
        }
      }
      return results;
    },
  };

  host.__test = harness;
  return harness;
}
