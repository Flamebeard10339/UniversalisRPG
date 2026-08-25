import { type EncounterFoe } from '../../src/runtime/encounter';
import { type Localized, type Localizer } from '../../src/runtime/localized';
import { askedOption, type CommandHelp, type CommandOutput, type CommandResult, type MessageTone } from '../../src/runtime/command';
import { type PlayChoice, type PlayStatus, type PlayView } from '../../src/runtime/session';
import { type GroupRow } from '../../src/runtime/grouping';
import { onActionList } from '../../src/runtime/waysOut';
import { formatPlane } from '../planeView';

// What a command answered with, written out as lines a player reads. Both drivers that put words
// in front of a player one line at a time — the terminal in scripts/play-cli.ts and the model in
// scripts/playbot.ts — say it through here, so a command cannot answer one of them and go silent
// at the other.

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

// A colour is not a word, so a terminal says the group instead of drawing it. The words are the
// group's own `title:`, which is the same string the screen fills a cell for, rather than a second
// name for the same thing kept here.
export const grouped = (localizer: Localizer, group: GroupRow | undefined, said: Localized): Localized =>
  group === undefined ? said : localizer.engine('engine.repl.grouped', { group: group.title, said });

// A choice is answered by where it sits in the view's own list, so what is skipped here still
// counts: the numbers a reader sees are the numbers the engine takes, with the ways out missing
// from among them rather than renumbered away.
function formatChoices(choices: PlayChoice[], localizer: Localizer): PlayerLine[] {
  return choices.flatMap((choice, index) => {
    if (!onActionList(choice)) return [];
    const numbered = choice.detail
      ? localizer.engine('engine.repl.choice.owned', { index: index + 1, owner: grouped(localizer, choice.group, choice.detail), choice: choice.label })
      : localizer.engine('engine.repl.choice', { index: index + 1, choice: choice.label });
    return [say(numbered, 2)];
  });
}

const MINIMAL_STAGES = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const BAR_WIDTH = 10;

function fillRatio(current: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
}

export function tidy(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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

// A location holds a count of its kind and not a roster, so the foe standing after a kill wears the
// id of the one that fell. `×3` beside the bar is how a reader tells a fresh foe at full health from
// the one they were hitting healing itself back up. It rides in as part of the meter because a
// numeral is the same in every language the pool line is written in, and every meter a fight is
// read off — the encounter view and the live tick both — asks withCount for it.
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

// What the open screen is reading, where the view publishes it beside the question rather than in
// it. Every focus the engine can publish is drawn here, so a screen that is about something is not
// reached and then found to say nothing.
export function formatFocus(v: PlayView, localizer: Localizer): ReplLine[] {
  const focus = v.focus;
  if (focus === null) return [];
  const blank = localizer.identifier('');
  if (focus.kind === 'quest') {
    const entry = v.journal.find((each) => each.quest === focus.quest);
    if (!entry) return [];
    const lines = entry.lines.map((line) => say(line.struck ? localizer.engine('engine.repl.journal.struck', { said: line.said }) : line.said, 2));
    return [say(entry.title), ...(lines.length > 0 ? lines : [say(localizer.engine('engine.shell.journal.untouched'), 2)])];
  }
  const plane = v.planes.find((each) => each.instance === focus.instance);
  if (!plane) return [];
  // What is being grown, named before the diagram of it: a plane drawn with nothing above it left
  // a reader with a lattice and no word for the thing it belongs to.
  return [blank, plane.title, ...formatPlane(plane, v.equipment.some((row) => row.item === plane.instance), focus.hex, localizer), blank].map((line) => say(line));
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
  if (asking.values) asking.values.forEach((choice, index) => lines.push(say(localizer.engine('engine.repl.choice', { index: index + 1, choice: choice.shown }), 2)));
  else lines.push(note(localizer.engine('engine.repl.modal.free', { option: localizer.identifier(asking.key) }), 2));
  return lines;
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
  lines.push(...formatChoices(v.choices, localizer));
  lines.push(say(localizer.engine('engine.repl.clock', { time: v.time })));
  return lines;
}

type DumpKey = 'engine.repl.state.flags' | 'engine.repl.state.inventory' | 'engine.repl.state.grown' | 'engine.repl.state.xp' | 'engine.repl.state.equipped';

const dumped = (localizer: Localizer, key: DumpKey, held: unknown): ToolLine =>
  note(localizer.engine(key, { [key.split('.').pop()!]: localizer.identifier(JSON.stringify(held)) }));

// A /state line for a field the engine locale has no sentence of its own for is labelled with
// that field's name out of PlayStatus, never with a second English word for it: the label is then
// the key an author looks the field up under, and renaming the field stops this compiling.
const field = (name: keyof PlayStatus, held: string, indent = 0): ToolLine => note(`${name}: ${held}`, indent);

// Under the name the world gives a thing as well as the id it is addressed by. An id-only readout
// left a player at this terminal never once shown the word `Attack`, which every other surface
// says: what a thing is called is content, and dropping it is dropping half the sheet.
const named = (title: Localized, id: string): string => `${title} (${id})`;

// Who the player is, ahead of everything they are carrying. Each row is labelled with the words the
// engine calls that field by rather than with a second English word for it, so a field the sheet
// grows arrives here named with nothing edited.
const formatSheet = (status: PlayStatus): ToolLine[] => {
  const rows = Object.values(status.player).flatMap((row) => (row === null ? [] : [`${row.label}: ${named(row.title, row.id)}`]));
  return rows.length === 0 ? [] : [field('player', rows.join(', '))];
};

function formatInventory(status: PlayStatus, localizer: Localizer): ToolLine[] {
  const lines = [dumped(localizer, 'engine.repl.state.inventory', status.inventory)];
  if (Object.keys(status.grown).length > 0) lines.push(dumped(localizer, 'engine.repl.state.grown', status.grown));
  if (status.carried.length > 0) lines.push(field('carried', status.carried.map((row) => `${grouped(localizer, row.group, row.shown)}${row.name === row.shown ? '' : ` [${row.name}]`} x${row.count}${row.worn ? ` worn:${row.worn.title}` : ''}`).join(', ')));
  lines.push(dumped(localizer, 'engine.repl.state.xp', Object.fromEntries(status.xp.map((row) => [named(row.title, row.id), row.value]))));
  // Every slot, worn or bare — a slot printed only once something is in it leaves an empty-handed
  // session with nothing to name when it wants to put something on.
  lines.push(dumped(localizer, 'engine.repl.state.equipped', Object.fromEntries(status.equipment.map((row) => [named(row.title, row.slot), row.name]))));
  lines.push(field('stats', JSON.stringify(Object.fromEntries(status.stats.map((row) => [named(row.title, row.id), row.value])))));
  return lines;
}

// What the player is in the middle of. The only other place a terminal names an action under way
// is the live tick sheet, which exists only while a TTY is ticking one, so without this row a
// session that is not ticking has no way to ask what it is doing.
function formatUnderWay(action: PlayStatus['action']): ToolLine[] {
  if (action === null) return [];
  const counting = action.completion === null ? '' : `, ${tidy(action.completion)} to count`;
  return [field('action', `${action.label} ${tidy(action.progress)} after ${action.attempts}${counting}`)];
}

// Coordinates put a location on an integer lattice, but what can be walked is `adjacent`, and
// neither implies the other: two places one step apart on the grid need not be joined, and a road
// may run the width of the map. So the roads are what is drawn, with each place's coordinates
// named beside it — a grid would make its own visual neighbours a claim the world never makes.
function formatMap(status: PlayStatus): ToolLine[] {
  const found = new Set(status.discovered.map((place) => place.id));
  const roadsOf = (place: PlayStatus['discovered'][number]): string =>
    place.adjacent.map((edge) => (edge.open ? String(edge.to) : `${edge.to} (shut)`)).join(', ');
  const unfound = status.locations.flatMap((each) => (found.has(each.id) ? [] : [String(each.id)]));
  return [
    field('discovered', String(status.discovered.length)),
    ...status.discovered.map((place) => {
      const roads = roadsOf(place);
      return note(`${place.title} (${place.id}) at ${place.x},${place.y},${place.z}${roads === '' ? '' : ` -> ${roads}`}`, 2);
    }),
    field('locations', `${found.size} of ${status.locations.length} found${unfound.length === 0 ? '' : `; not yet found: ${unfound.join(', ')}`}`),
  ];
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
      return formatChoices(output.choices, localizer);
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
