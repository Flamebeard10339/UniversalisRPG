import { type EncounterFoe } from '../../src/runtime/encounter';
import { type Localized, type Localizer } from '../../src/runtime/localized';
import { askedOption, type CommandHelp, type CommandOutput, type CommandResult, type MessageTone } from '../../src/runtime/command';
import { partsOf, type NumberedChoice } from '../../src/runtime/modalOption';
import { tidy } from '../../src/runtime/figures';
import { madeOf } from '../../src/runtime/statScreen';
import type { Focus } from '../../src/runtime/modals';
import { sheetOffers, type OfferedChoice, type PlayStatus, type PlayView } from '../../src/runtime/session';
import { grouped } from '../../src/runtime/grouping';
import { formatPlane } from '../planeView';
import { drawnCompass, drawnMap } from './mapText';
import type { Sheet } from '../../src/runtime/map';

export interface PlayerLine {
  readonly words: 'player';
  readonly tone: MessageTone;
  readonly indent: number;
  readonly text: Localized;
}

export interface ToolLine {
  readonly words: 'tool';
  readonly tone: MessageTone;
  readonly indent: number;
  readonly text: string;
}

export type ReplLine = PlayerLine | ToolLine;

export const say = (text: Localized, indent = 0, tone: MessageTone = 'plain'): PlayerLine => ({ words: 'player', tone, indent, text });

export const note = (text: string, indent = 0, tone: MessageTone = 'plain'): ToolLine => ({ words: 'tool', tone, indent, text });

const TONE_GLYPH: Record<MessageTone, string> = { plain: '', ok: '✓ ', warn: '⚠ ', error: '✗ ' };

export const printed = (line: ReplLine): string => `${' '.repeat(line.indent)}${TONE_GLYPH[line.tone]}${line.text}`;

export const oneLine = (localizer: Localizer, parts: readonly Localized[], gap: string): Localized => localizer.identifier(parts.join(gap));

const shownLocations = new Set<string>();

function formatChoices(choices: readonly OfferedChoice[], localizer: Localizer): PlayerLine[] {
  return choices.map((choice) => {
    const numbered = choice.detail
      ? localizer.engine('engine.repl.choice.owned', { index: choice.position, owner: grouped(localizer, choice.group, choice.detail), choice: choice.label })
      : localizer.engine('engine.repl.choice', { index: choice.position, choice: choice.label });
    return say(numbered, 2);
  });
}

const MINIMAL_STAGES = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BAR_WIDTH = 10;

function fillRatio(current: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
}

function fullBar(current: number, max: number): string {
  const filled = Math.round(fillRatio(current, max) * BAR_WIDTH);
  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${tidy(current)}/${tidy(max)}`;
}

function minimalGlyph(current: number, max: number): string {
  const stage = Math.min(MINIMAL_STAGES.length - 1, Math.floor(fillRatio(current, max) * MINIMAL_STAGES.length));
  return MINIMAL_STAGES[stage];
}

const pool = (localizer: Localizer, resource: Localized, meter: string): Localized => localizer.engine('engine.repl.pool', { resource, meter: localizer.identifier(meter) });

function formatResources(resources: PlayView['resources'], localizer: Localizer): PlayerLine[] {
  const lines: PlayerLine[] = [];
  for (const r of resources) if (r.display === 'full') lines.push(say(pool(localizer, r.title, fullBar(r.current, r.max))));
  const minimal = resources.filter((r) => r.display === 'minimal');
  if (minimal.length > 0) lines.push(say(oneLine(localizer, minimal.map((r) => pool(localizer, r.title, minimalGlyph(r.current, r.max))), '   ')));
  return lines;
}

export const withCount = (meter: string, remaining: number | null): string => (remaining === null ? meter : `${meter}  ×${remaining}`);

const meterFor = (foe: EncounterFoe): string => withCount(fullBar(foe.current, foe.max), foe.remaining);

function formatEncounter(encounter: PlayView['encounter'], localizer: Localizer): PlayerLine[] {
  if (!encounter) return [];
  const lines = encounter.foes.map((foe) => say(pool(localizer, foe.title, meterFor(foe))));
  const meters = [localizer.engine('engine.repl.swing', { meter: localizer.identifier(minimalGlyph(encounter.cadence, 1)) })];
  for (const foe of encounter.foes) {
    if (foe.cadence !== null) meters.push(pool(localizer, foe.title, minimalGlyph(foe.cadence, 1)));
  }
  return [...lines, say(oneLine(localizer, meters, '   '))];
}

type Drawn<K extends Focus['kind']> = (focus: Extract<Focus, { kind: K }>, v: PlayView, localizer: Localizer) => ReplLine[];

const FOCUS_LINES: { [K in Focus['kind']]: Drawn<K> } = {
  quest: (focus, v, localizer) => {
    const entry = v.journal.find((each) => each.quest === focus.quest);
    if (!entry) return [];
    const lines = entry.lines.map((line) => say(line.struck ? localizer.engine('engine.repl.journal.struck', { said: line.said }) : line.said, 2));
    return [say(entry.title), ...(lines.length > 0 ? lines : [say(localizer.engine('engine.shell.journal.untouched'), 2)])];
  },
  stat: (focus, v, localizer) => {
    const row = v.stats.find((each) => each.id === focus.stat);
    if (!row) return [];
    return [
      say(localizer.engine('engine.repl.stat', { stat: row.title, value: localizer.identifier(tidy(row.value)) })),
      ...madeOf(row.from).map((share) => say(localizer.engine('engine.repl.stat', { stat: share.title, value: localizer.identifier(share.worth) }), 2)),
    ];
  },
  plane: (focus, v, localizer) => {
    const plane = v.planes.find((each) => each.instance === focus.instance);
    if (!plane) return [];
    const blank = localizer.identifier('');
    return [blank, plane.title, ...formatPlane(plane, v.equipment.some((row) => row.item === plane.instance), focus.hex, localizer), blank].map((line) => say(line));
  },
};

export const FOCUS_KINDS: readonly Focus['kind'][] = Object.keys(FOCUS_LINES) as Focus['kind'][];

export function formatFocus(v: PlayView, localizer: Localizer): ReplLine[] {
  const focus = v.focus;
  return focus === null ? [] : (FOCUS_LINES[focus.kind] as Drawn<Focus['kind']>)(focus, v, localizer);
}

function formatModals(v: PlayView, localizer: Localizer): ReplLine[] {
  const lines: ReplLine[] = [];
  for (const modal of v.modals) {
    const options = modal.options.map((option) => option.key).join(', ');
    const modalId = localizer.identifier(modal.name);
    lines.push(
      note(
        options === ''
          ? localizer.engine('engine.repl.modal.answered', { modal: modalId })
          : localizer.engine('engine.repl.modal', { modal: modalId, options: localizer.identifier(options) }),
      ),
    );
  }
  lines.push(...formatFocus(v, localizer));

  const asking = askedOption(v.modals);
  if (!asking) return lines;
  lines.push(say(localizer.engine('engine.repl.modal.asking', { option: asking.label })));
  lines.push(...formatChosen(asking, localizer));

  const leaving = v.modals[v.modals.length - 1]?.leaving;
  if (asking.values === null && leaving) {
    lines.push(note(localizer.engine('engine.repl.modal.leaving', { option: localizer.identifier(asking.key), leaving: localizer.identifier(leaving) }), 2));
  }
  return lines;
}

function formatChosen(asking: PlayView['modals'][number]['options'][number], localizer: Localizer): ReplLine[] {
  if (!asking.values) return [note(localizer.engine('engine.repl.modal.free', { option: localizer.identifier(asking.key) }), 2)];
  const { parts, loose } = partsOf(asking);
  const numbered = (each: NumberedChoice, indent: number): PlayerLine => say(localizer.engine('engine.repl.choice', { index: each.at + 1, choice: each.choice.shown }), indent);
  return [
    ...parts.flatMap((part) => [say(part.heading, 2), ...part.choices.map((each) => numbered(each, 4))]),
    ...loose.map((each) => numbered(each, 2)),
  ];
}

export function formatView(v: PlayView, localizer: Localizer, reread = false): ReplLine[] {
  if (reread) shownLocations.delete(v.location.id);
  const lines: ReplLine[] = [];
  for (const said of v.said) lines.push(say(said));
  lines.push(say(localizer.engine('engine.repl.place', { location: v.location.title, id: localizer.identifier(v.location.id) })));
  if (!shownLocations.has(v.location.id)) {
    shownLocations.add(v.location.id);
    if (v.location.description) lines.push(say(v.location.description));
  }
  if (v.entities.length > 0) lines.push(say(localizer.engine('engine.repl.here', { entities: oneLine(localizer, v.entities.map((entity) => entity.title), ', ') })));
  lines.push(...formatResources(v.resources, localizer));
  lines.push(...formatEncounter(v.encounter, localizer));
  lines.push(...formatModals(v, localizer));
  lines.push(...formatChoices(sheetOffers(v), localizer));
  lines.push(say(localizer.engine('engine.repl.clock', { time: v.time })));
  return lines;
}

type DumpKey = 'engine.repl.state.flags' | 'engine.repl.state.inventory' | 'engine.repl.state.grown' | 'engine.repl.state.xp' | 'engine.repl.state.equipped';

const dumped = (localizer: Localizer, key: DumpKey, held: unknown): ToolLine =>
  note(localizer.engine(key, { [key.split('.').pop()!]: localizer.identifier(JSON.stringify(held)) }));

const field = (name: keyof PlayStatus, held: string, indent = 0): ToolLine => note(`${name}: ${held}`, indent);

const named = (title: Localized, id: string): string => `${title} (${id})`;

const formatSheet = (status: PlayStatus): ToolLine[] => {
  const rows = Object.values(status.player).flatMap((row) => (row === null ? [] : [`${row.label}: ${named(row.title, row.id)}`]));
  return rows.length === 0 ? [] : [field('player', rows.join(', '))];
};

function formatInventory(status: PlayStatus, localizer: Localizer): ToolLine[] {
  const lines = [dumped(localizer, 'engine.repl.state.inventory', status.inventory)];
  if (Object.keys(status.grown).length > 0) lines.push(dumped(localizer, 'engine.repl.state.grown', status.grown));
  if (status.carried.length > 0) lines.push(field('carried', status.carried.map((row) => `${grouped(localizer, row.group, row.shown)}${row.name === row.shown ? '' : ` [${row.name}]`} x${row.count}${row.worn ? ` worn:${row.worn.title}` : ''}`).join(', ')));
  lines.push(dumped(localizer, 'engine.repl.state.xp', Object.fromEntries(status.xp.map((row) => [named(row.title, row.id), row.value]))));
  lines.push(dumped(localizer, 'engine.repl.state.equipped', Object.fromEntries(status.equipment.map((row) => [named(row.title, row.slot), row.name]))));
  lines.push(field('stats', JSON.stringify(Object.fromEntries(status.stats.map((row) => [named(row.title, row.id), row.value])))));
  return lines;
}

function formatUnderWay(action: PlayStatus['action']): ToolLine[] {
  if (action === null) return [];
  const counting = action.completion === null ? '' : `, ${tidy(action.completion)} to count`;
  const aimedAt = action.detail === undefined ? '' : ` · ${action.detail}`;
  return [field('action', `${action.label}${aimedAt} ${tidy(action.progress)} after ${action.attempts}${counting}`)];
}

function formatMap(status: PlayStatus): ToolLine[] {
  const unfound = status.undiscovered.map((each) => `${each.title} (${each.id})`);
  const every = status.discovered.length + unfound.length;
  return [field('discovered', `${status.discovered.length} of ${every} found${unfound.length === 0 ? '' : `; not yet found: ${unfound.join(', ')}`}`)];
}

function formatState(status: PlayStatus, localizer: Localizer): ReplLine[] {
  return [
    note(localizer.engine('engine.repl.state.location', { location: localizer.identifier(status.location.id) })),
    note(localizer.engine('engine.repl.state.time', { time: status.time })),
    dumped(localizer, 'engine.repl.state.flags', status.flags),
    ...formatSheet(status),
    ...formatInventory(status, localizer),
    ...formatResources(status.resources, localizer),
    ...formatEncounter(status.encounter, localizer),
    ...formatUnderWay(status.action),
    ...formatMap(status),
  ];
}

const HELP_COLUMN = 12;

function formatHelp(entry: CommandHelp): ToolLine {
  const spelling = [entry.name, ...entry.aliases].join(', ');
  const label = entry.argHint ? [spelling, entry.argHint].join(' ') : spelling;
  return note(`${label.padEnd(HELP_COLUMN)} ${entry.summary}`, 2);
}

function formatDrawnMap(sheet: Sheet, localizer: Localizer): ToolLine[] {
  if (sheet.nodes.length === 0) return [note(String(localizer.engine('engine.travel.nowhere')))];
  const floors = sheet.planes.length > 1 ? ` of ${sheet.planes.join(', ')}` : '';
  const titles = new Map(sheet.nodes.map((node) => [String(node.place.id), String(node.place.title)]));
  const indented = (line: string): ToolLine => note(line, line === '' ? 0 : 2);
  return [
    note(`floor: ${sheet.plane}${floors}`),
    ...drawnMap(sheet).map(indented),
    ...(sheet.ways.length === 0 ? [] : [note('')]),
    ...drawnCompass(sheet, (way) => titles.get(String(way.to)) ?? String(way.label)).map(indented),
  ];
}

export function formatOutput(output: CommandOutput, localizer: Localizer): ReplLine[] {
  switch (output.kind) {
    case 'message':
      return output.words === 'player'
        ? [say(output.text, 0, output.tone), ...(output.detail ?? []).map((line) => say(line, 2))]
        : [note(output.text, 0, output.tone), ...(output.detail ?? []).map((line) => note(line, 2))];
    case 'view':
      return formatView(output.view, localizer, output.reread);
    case 'status':
      return formatState(output.status, localizer);
    case 'choices':
      return formatChoices(sheetOffers(output), localizer);
    case 'map':
      return formatDrawnMap(output.map, localizer);
    case 'help':
      return [note('Commands:'), ...output.entries.map(formatHelp)];
    case 'source':
      return output.lines.map((line) => note(line));
    case 'authored':
      return output.blocks.flatMap((block) => [note(''), ...block.map((line) => note(line))]);
    default: {
      const unreached: never = output;
      return unreached;
    }
  }
}

export function formatResult(result: CommandResult, localizer: Localizer): ReplLine[] {
  return result.output.flatMap((output) => formatOutput(output, localizer));
}
