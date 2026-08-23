import { Registry } from '../content/registry';
import { Localized, Localizer, localizerOf } from './localized';
import { diffState, SAVE_FIELD_NAMES, SaveField } from './save';
import { skillLevel } from './skills';
import { GameState } from './state';
import { fromMilliUnits, msToSeconds } from './units';

// What the world did while it ran on the player's behalf. Its subjects are the state's own save
// fields, so a `# resource`, a `# skill` or an item added next month is reported without an edit
// here, and a field added to the state does not compile until it says whether a span mentions it.
export interface SpanStart {
  readonly at: number;
  readonly state: GameState;
}

// Opening a span forgets why the last one ended: what stopped this one is what this one is told by.
export function spanStart(state: GameState): SpanStart {
  state.endedBecause = null;
  return { at: state.time, state: structuredClone({ ...state, log: [] }) };
}

interface Told {
  moved: readonly string[];
  before: GameState;
  after: GameState;
  registry: Registry;
  say: Localizer;
}

type Unsaid = 'nothing a player counts' | 'the span itself' | 'told by what stopped it';

type SpanVoice = ((told: Told) => Localized[]) | Unsaid;

const numbers = (record: Record<string, number>, id: string): number => record[id] ?? 0;

const SPAN_VOICE: Record<SaveField, SpanVoice> = {
  location: ({ after, say }) => [say.engine('engine.span.moved', { location: say.title('location', after.location) })],
  inventory: ({ moved, before, after, say }) =>
    moved.map((id) => {
      const delta = numbers(after.inventory, id) - numbers(before.inventory, id);
      return say.engine(delta > 0 ? 'engine.span.gained' : 'engine.span.spent', { item: say.title('item', id), count: Math.abs(delta) });
    }),
  xp: ({ moved, before, after, say }) =>
    moved.map((id) => {
      const was = numbers(before.xp, id);
      const now = numbers(after.xp, id);
      const level = skillLevel(now);
      const params = { skill: say.title('skill', id), gained: now - was };
      return level === skillLevel(was) ? say.engine('engine.span.xp', params) : say.engine('engine.span.levelled', { ...params, level });
    }),
  resources: ({ moved, before, after, registry, say }) =>
    moved
      .filter((id) => registry.resources.has(id))
      .map((id) =>
        say.engine('engine.span.pool', {
          resource: say.title('resource', id),
          before: fromMilliUnits(numbers(before.resources as Record<string, number>, id)),
          after: fromMilliUnits(numbers(after.resources as Record<string, number>, id)),
        }),
      ),
  time: 'the span itself',
  activeAction: 'told by what stopped it',
  journey: 'told by what stopped it',
  flags: 'nothing a player counts',
  visits: 'nothing a player counts',
  resourceRateRemainders: 'nothing a player counts',
  equipped: 'nothing a player counts',
  buffs: 'nothing a player counts',
  instances: 'nothing a player counts',
  populations: 'nothing a player counts',
  shops: 'nothing a player counts',
  rng: 'nothing a player counts',
  player: 'nothing a player counts',
  modals: 'nothing a player counts',
};

// A span that took no time and moved nothing says nothing: `wait: done` in a world where nothing is
// under way is not an absence anyone was away for.
export function spanSummary(start: SpanStart, state: GameState, registry: Registry, because: Localized): Localized[] {
  const say = localizerOf(registry, state);
  const diff = diffState(state, start.state) as Partial<Record<SaveField, unknown>>;
  const body: Localized[] = [];

  for (const field of SAVE_FIELD_NAMES) {
    const voice = SPAN_VOICE[field];
    if (typeof voice !== 'function' || !(field in diff)) continue;
    const held = diff[field];
    const moved = typeof held === 'object' && held !== null && !Array.isArray(held) ? Object.keys(held) : [];
    body.push(...voice({ moved, before: start.state, after: state, registry, say }));
  }

  const span = state.time - start.at;
  if (span === 0 && body.length === 0) return [];
  return [say.engine('engine.span.ran', { span: msToSeconds(span), reason: because }), ...body];
}
