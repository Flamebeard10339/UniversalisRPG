import type { ModalOption } from './modalOption';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGameState } from './runtime';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { type Registry } from '../content/registry';
import { loadUniverse } from '../content/load';
import { hasWords, translationOf, TRANSLATED_LANGUAGE } from '../content/translation';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { initialLocalChangesModule, renderLocalChangesModule } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { startSaveId } from './runLog';
import { SAVE_VERSION } from './save';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { runTest, serializeSession, sessionStatus, startSession, view, type PlaySession } from './session';
import {
  COMMANDS,
  createTicker,
  DEV_TOKENS,
  devTokenIn,
  findCommand,
  helpEntries,
  isChoiceLine,
  LIVE_TICK_MS,
  newContext,
  parseLine,
  runCommand,
  runLine,
  type AuthoringContext,
  type Clock,
  type CommandContext,
  type CommandOutput,
  type CommandResult,
  type Recorder,
} from './command';

const CARRYING_MODULE =
  FIXTURE_WORLD +
  `
# skill smithing

# item gauntlet
title: Gauntlet
slot: hand

# save stocked
{"version":${SAVE_VERSION},"inventory":{"gauntlet":1},"xp":{"smithing":5}}

# save armed
{"version":${SAVE_VERSION},"inventory":{"gauntlet":1},"equipped":{"hand":"gauntlet"}}
`;

const SAVE_MODULE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  chest

# item gold
title: Gold

# flag opened

# entity chest
open:
  give: 1 gold
  set: opened

# save empty
{"version":${SAVE_VERSION},"flags":{"camp.discovered":true,"camp.touched":true}}

# test always-passes
assert: time >= 0

# test always-fails
assert: time < 0
`;

const TRAVEL_MODULE =
  FIXTURE_WORLD +
  `
# location camp
adjacent:
  ruins

# location ruins
x: 1, y: 0
`;

const CUT_OFF_MODULE =
  FIXTURE_WORLD +
  `
# location camp

# location island
x: 40, y: 0
adjacent:
  cave

# location cave
x: 41, y: 0
`;

const TALK_MODULE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  guide

# entity guide
title: Guide

# dialogue guide-chat
owner = guide

node greeting:
  always
  Hello there, traveller.
  -> Nod.
`;

interface Fixture {
  session: PlaySession;
  recorder: Recorder;
  ctx: CommandContext;
}

function fixture(text: string, authoring?: AuthoringContext, registry: Registry = loadInEnglish(text)): Fixture {
  const session = startSession(registry);
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  return { session, recorder, ctx: newContext(session, view(session), { recorder, authoring }) };
}

function messages(result: CommandResult): Array<Extract<CommandOutput, { kind: 'message' }>> {
  return result.output.filter((out) => out.kind === 'message');
}

function errors(result: CommandResult): string[] {
  return messages(result).filter((out) => out.tone === 'error').map((out) => out.text);
}

function tones(result: CommandResult): string[] {
  return messages(result).map((out) => out.tone);
}

function statusOf(result: CommandResult): Extract<CommandOutput, { kind: 'status' }> {
  const found = result.output.find((out) => out.kind === 'status');
  if (!found) throw new Error(`no status in ${JSON.stringify(result.output.map((out) => out.kind))}`);
  return found;
}

function kinds(result: CommandResult): string[] {
  return result.output.map((out) => out.kind);
}

function choiceIndex(ctx: CommandContext, id: string): string {
  const index = ctx.view.choices.findIndex((choice) => choice.id === id);
  expect(index, id).toBeGreaterThanOrEqual(0);
  return String(index + 1);
}

const answered = (options: readonly ModalOption[] | undefined) => (options ?? []).map((option) => ({ ...option, values: option.values?.map((choice) => choice.value) ?? null }));
const takes = (option: { values?: readonly { value: string }[] | null } | undefined) => option?.values?.map((choice) => choice.value);


describe('the command table is the one definition of the command set', () => {
  it('names every command once, and every spelling reaches its own entry', () => {
    const names = COMMANDS.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);

    for (const spec of COMMANDS) {
      if (spec.match !== 'name') continue;
      for (const spelling of [spec.name, ...spec.aliases]) {
        expect(findCommand(spelling), spelling).toBe(spec);
      }
    }
  });

  it('dispatches a typed line by looking the leading token up, aliases included', () => {
    const { ctx } = fixture(SAVE_MODULE);
    for (const spec of COMMANDS) {
      if (spec.match !== 'name') continue;
      for (const spelling of [spec.name, ...spec.aliases]) {
        const line = spec.argHint === '' ? spelling : `${spelling} always-passes`;
        const parsed = parseLine(ctx, line);
        if ('problem' in parsed) expect(parsed.problem, line).toContain(spec.name.slice(1));
        else expect(parsed.spec, line).toBe(spec);
      }
    }
  });

  it('spells out in help exactly the argument its shape declares, so neither can drift from the other', () => {
    for (const spec of COMMANDS) {
      if (spec.match !== 'name') continue;
      expect(spec.arg === 'none', spec.name).toBe(spec.argHint === '');
    }
  });

  it('gives a command no argument it does not declare, over every entry that declares none', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    const argumentless = COMMANDS.filter((spec) => spec.match === 'name' && spec.arg === 'none');
    expect(argumentless.map((spec) => spec.name)).toEqual(['/look', '/map', '/state', '/cancel', '/reload', '/export', '/save', '/restore', '/slots', '/help', '/quit']);

    for (const spec of argumentless) {
      for (const spelling of [spec.name, ...spec.aliases]) {
        const result = runLine(ctx, `${spelling} junk`);
        expect(errors(result), spelling).toEqual([`unknown command: ${spelling} junk`]);
        expect(result.quit, spelling).toBe(false);
        expect(result.output, spelling).toHaveLength(1);
      }
    }
    expect(sessionStatus(session).time).toBe(0);
    expect(runLine(ctx, '/quit').quit).toBe(true);
  });

  it('takes a command to be a whole token, so no name can shadow a longer one', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    for (const line of ['/create-valid-testfoo', '/speedxyz', '/loadempty', '/testalways-passes']) {
      expect(errors(runLine(ctx, line)), line).toEqual([`unknown command: ${line}`]);
    }
    expect(sessionStatus(session).time).toBe(0);
    expect(errors(runLine(ctx, '/test always-passes'))).toEqual([]);
  });

  it('routes a blank line, a directive and a choice number to their own entries rather than to a name', () => {
    const { ctx } = fixture(TRAVEL_MODULE);
    const forms = [
      ['', 'blank'],
      ['travel: ruins', 'directive'],
      [choiceIndex(ctx, 'travel:ruins'), 'choice'],
    ] as const;
    for (const [line, match] of forms) {
      const parsed = parseLine(ctx, line);
      expect('problem' in parsed, line).toBe(false);
      if ('problem' in parsed) continue;
      expect(parsed.spec.match, line).toBe(match);
    }
  });

  it('a driver holding typed arguments dispatches without going near the parser', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    const speed = findCommand('/speed')!;
    expect(speed.arg).toBe('number');
    runCommand(ctx, speed, 7);
    expect(ctx.live.speed).toBe(7);

    const test = findCommand('/test')!;
    expect(test.arg).toBe('id');
    expect(messages(runCommand(ctx, test, 'always-passes'))[0].text).toBe(`Test 'always-passes' PASSED`);
    expect(sessionStatus(session).time).toBe(0);
  });
});

describe('help is the table read out', () => {
  it('publishes one entry per command, in table order, with the table’s own words', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const help = runLine(ctx, '/help').output[0];
    expect(help.kind).toBe('help');
    if (help.kind !== 'help') return;

    expect(help.entries).toEqual(
      COMMANDS.map((spec) => ({ name: spec.name, aliases: spec.aliases, argHint: spec.argHint, summary: spec.summary })),
    );
    expect(helpEntries().map((entry) => entry.name)).toEqual(COMMANDS.map((spec) => spec.name));
  });

  it('documents every command a player can type, so no spelling is undocumented', () => {
    const documented = new Set(helpEntries().flatMap((entry) => [entry.name, ...entry.aliases]));
    for (const spec of COMMANDS) {
      for (const spelling of [spec.name, ...spec.aliases]) expect(documented.has(spelling), spelling).toBe(true);
    }
  });
});

describe('a command result says what happened, not how it looks', () => {
  const TERMINAL = ['█', '░', '▁', '▂', '[time:', '✓', '⚠', '[#', '[-'];

  function spoken(result: CommandResult): string[] {
    return result.output.flatMap((out) => {
      switch (out.kind) {
        case 'message':
          return [out.text, ...(out.detail ?? [])];
        case 'source':
          return out.lines;
        case 'authored':
          return out.blocks.flat();
        case 'help':
          return out.entries.flatMap((entry) => [entry.name, entry.argHint, entry.summary]);
        default:
          return [];
      }
    });
  }

  it('emits no bar glyph, no clock suffix and no check or warning mark, over every command', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const lines = [
      '/help', '/state', '/inventory', '/look', '', '/speed 2', '/speed 0', '/wait 3',
      '/assert time >= 0', '/assert time < 0', '/expect empty', '/load empty', '/load nope',
      '/test always-passes', '/test always-fails', '/cancel', 'use: entity.chest.open',
      '/create-test made', '/bogus', '99', '/quit',
    ];
    for (const line of lines) {
      for (const text of spoken(runLine(ctx, line))) {
        for (const glyph of TERMINAL) expect(text, `${line} -> ${text}`).not.toContain(glyph);
      }
    }
  });

  it('says a match and a mismatch by tone rather than by mark', () => {
    const { ctx } = fixture(SAVE_MODULE);
    expect(tones(runLine(ctx, '/assert time >= 0'))).toEqual(['ok']);
    expect(messages(runLine(ctx, '/assert time >= 0'))[0].text).toBe('time >= 0 matches');
    expect(tones(runLine(ctx, '/assert time < 0'))).toEqual(['warn']);
    expect(messages(runLine(ctx, '/assert time < 0'))[0].text).toBe('time < 0');
    expect(tones(runLine(ctx, '/expect empty'))).toEqual(['ok']);
  });

  it('hands the resulting view back rather than a rendering of it', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const result = runLine(ctx, '/wait 30');
    expect(kinds(result)).toEqual(['view']);
    expect(result.view?.time).toBe(30);
    const shown = result.output[0];
    expect(shown.kind === 'view' && shown.view).toBe(result.view);
  });
});

describe('the commands a player plays with', () => {
  it('applies a numeric choice, mutating state and returning its narration', () => {
    const { ctx } = fixture(TALK_MODULE);
    const result = runLine(ctx, choiceIndex(ctx, 'talk:guide'));

    expect(result.quit).toBe(false);
    expect(result.view?.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(result.view?.said.some((line) => line.includes('Hello there, traveller.'))).toBe(true);
  });

  it('/wait <seconds> advances the returned view.time by that amount', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const before = ctx.view.time;
    const result = runLine(ctx, '/wait 30');
    expect(result.quit).toBe(false);
    expect(result.view?.time).toBe(before + 30);
  });

  it('/state reports the current status without advancing it, and produces no view', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    runLine(ctx, '/wait 42');

    const result = runLine(ctx, '/state');
    expect(result.view).toBeUndefined();
    expect(statusOf(result).status.time).toBe(42);
    expect(sessionStatus(session).time).toBe(42);
  });

  it('/inventory opens the screen and prints nothing beside it', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    const opened = runLine(ctx, '/inv');
    expect(kinds(opened)).toEqual(['view']);
    expect(opened.recorded).toEqual(['open-modal: carried-items']);
    expect(opened.view?.modals.map((modal) => ({ ...modal, options: answered(modal.options) }))).toEqual([{ name: 'carried-items', leaving: 'close', options: [{ key: 'item', label: 'Item', values: ['gauntlet', 'close'] }] }]);
  });

  it('/inventory <item> opens the same screen with that item already selected', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    const opened = runLine(ctx, '/inv gauntlet');
    expect(kinds(opened)).toEqual(['view']);
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=gauntlet']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['equip', 'destroy', 'close'] }]);
  });

  it('/inventory <slot> opens the copy that is worn while its stack still stands', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load armed');

    const opened = runLine(ctx, '/inv worn:hand');
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=worn:hand']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['unequip', 'destroy', 'close'] }]);
  });

  it('/inventory <item> still opens the stack the worn copy left, and offers it Equip', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load armed');

    const opened = runLine(ctx, '/inv gauntlet');
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=gauntlet']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['equip', 'destroy', 'close'] }]);
  });

  it('refuses an item the player is not carrying, and opens no screen to say so', () => {
    const { ctx } = fixture(CARRYING_MODULE);

    expect(errors(runLine(ctx, '/inv gauntlet'))).toEqual(['you carry no gauntlet']);
    expect(errors(runLine(ctx, '/inv bracer'))[0]).toContain('bracer');
    expect(ctx.view.modals).toEqual([]);
  });

  it('refuses an empty slot by naming the slot, and never by the spelling for it', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    expect(errors(runLine(ctx, '/inv worn:hand'))).toEqual(['you wear nothing in hand']);
    expect(ctx.view.modals).toEqual([]);
  });

  it('equips what the screen was opened on, through the directive equip: already goes through', () => {
    const { ctx, session } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');
    runLine(ctx, '/inv gauntlet');

    const equipped = runLine(ctx, '1');
    expect(equipped.recorded).toEqual(['submit-modal: verb=equip']);
    expect(sessionStatus(session).equipment).toEqual([{ slot: 'hand', title: 'Hand', item: 'gauntlet', name: 'Gauntlet' }]);
    expect(equipped.view?.modals).toEqual([]);
  });

  it('closes on the value that leaves, from either question, and moves no state', () => {
    const { ctx, session } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    runLine(ctx, '/inv');
    expect(runLine(ctx, 'submit-modal: item=close').view?.modals).toEqual([]);

    runLine(ctx, '/inv gauntlet');
    const left = runLine(ctx, 'submit-modal: verb=close');
    expect(left.view?.modals).toEqual([]);
    expect(sessionStatus(session).equipment).toEqual([]);
    expect(sessionStatus(session).inventory).toEqual({ gauntlet: 1 });
    expect(sessionStatus(session).time).toBe(0);
  });

  it('a blank line re-lists the choices without touching the world', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    const result = runLine(ctx, '');
    const listed = result.output[0];
    expect(listed.kind === 'choices' && listed.choices).toEqual(ctx.view.choices);
    expect(result.view).toBeUndefined();
    expect(sessionStatus(session).time).toBe(0);
  });

  it('/look asks for the location description again', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const result = runLine(ctx, '/look');
    const shown = result.output[0];
    expect(shown.kind === 'view' && shown.reread).toBe(true);
    expect(result.view).toBe(ctx.view);
  });

  it('reports a friendly error for an out-of-range choice number, without throwing or quitting', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const result = runLine(ctx, String(ctx.view.choices.length + 10));
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(errors(result)).toEqual([`invalid choice: ${JSON.stringify(String(ctx.view.choices.length + 10))}`]);
  });

  it('reports a friendly error for an unknown slash command, without throwing or quitting', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const result = runLine(ctx, '/bogus');
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(errors(result)).toEqual(['unknown command: /bogus']);
  });

  it('/quit and /q both signal quit with the final status', () => {
    for (const spelling of ['/quit', '/q']) {
      const { ctx } = fixture(SAVE_MODULE);
      const result = runLine(ctx, spelling);
      expect(result.quit, spelling).toBe(true);
      expect(statusOf(result).status.location.id).toBe('camp');
    }
  });

  it('/speed <n> turns the live dial and rejects a non-positive or unreadable one', () => {
    const { ctx } = fixture(SAVE_MODULE);

    expect(errors(runLine(ctx, '/speed 4'))).toEqual([]);
    expect(ctx.live.speed).toBe(4);

    expect(errors(runLine(ctx, '/speed 0'))).toEqual(['/speed requires a positive number, got "0"']);
    expect(errors(runLine(ctx, '/speed nope'))).toEqual(['/speed requires a positive number, got "nope"']);
    expect(errors(runLine(ctx, '/speed'))).toEqual(['/speed requires a positive number, got ""']);
    expect(ctx.live.speed).toBe(4);
  });

  it('/goto stands the player somewhere no road reaches, and records a line that replays', () => {
    const { ctx, session, recorder } = fixture(CUT_OFF_MODULE);
    expect(ctx.view.choices.some((choice) => choice.leadsTo === 'island')).toBe(false);

    const result = runLine(ctx, '/goto island');

    expect(errors(result)).toEqual([]);
    expect(result.view?.location.id).toBe('island');
    expect(recorder.history).toEqual(['goto: island']);
    expect(sessionStatus(session).flags).toMatchObject({ 'island.discovered': true, 'cave.discovered': true });

    const replayed = fixture(`${CUT_OFF_MODULE}\n# test teleported\ngoto: island\nassert: cave.discovered\n`);
    expect(errors(runLine(replayed.ctx, '/test teleported'))).toEqual([]);
    expect(replayed.ctx.view.location.id).toBe('island');
  });

  it('/goto answers starting-location live, and records the name rather than what it came to', () => {
    const { ctx, session, recorder } = fixture(CUT_OFF_MODULE);
    const starting = [...session.registry.locations.values()].find((place) => place.starting)!.id;

    expect(errors(runLine(ctx, '/goto island'))).toEqual([]);
    expect(errors(runLine(ctx, '/goto starting-location'))).toEqual([]);
    expect(ctx.view.location.id).toBe(starting);
    expect(recorder.history).toEqual(['goto: island', 'goto: starting-location']);

    const replayed = fixture(`${CUT_OFF_MODULE}\n# test sent-home\ngoto: island\ngoto: starting-location\n`);
    expect(errors(runLine(replayed.ctx, '/test sent-home'))).toEqual([]);
    expect(replayed.ctx.view.location.id).toBe(starting);
  });

  it('/goto refuses a place the registry does not hold, and leaves the player where they were', () => {
    const { ctx } = fixture(CUT_OFF_MODULE);

    expect(errors(runLine(ctx, '/goto nowhere'))).toEqual(['typed directive goto: names an unknown location: nowhere']);
    expect(errors(runLine(ctx, '/goto'))).toEqual(['unknown command: /goto']);
    expect(ctx.view.location.id).toBe('camp');
  });

  it('marks the dev-only commands, and the tokens are read off the marks', () => {
    expect(DEV_TOKENS).toEqual(COMMANDS.filter((spec) => spec.audience === 'cheat').flatMap((spec) => [spec.name, ...spec.aliases]));
    expect(DEV_TOKENS).toContain('/goto');

    for (const token of DEV_TOKENS) expect(devTokenIn(`${token} somewhere`), token).toBe(token);
    expect(devTokenIn('/look')).toBeUndefined();
    expect(devTokenIn('  /goto  island  ')).toBe('/goto');
    expect(devTokenIn('/gotofar island')).toBeUndefined();
  });

  it('a typed travel: directive moves the player and records the canonical form', () => {
    const { ctx } = fixture(TRAVEL_MODULE);
    const result = runLine(ctx, 'travel: ruins');
    expect(result.view?.location.id).toBe('ruins');
    expect(result.recorded).toEqual(['travel: ruins']);
  });

  it('a numbered choice records the same canonical directive its typed twin does', () => {
    const { ctx, recorder } = fixture(TRAVEL_MODULE);
    const result = runLine(ctx, choiceIndex(ctx, 'travel:ruins'));
    expect(result.recorded).toEqual(['travel: ruins']);
    expect(recorder.history).toEqual(['travel: ruins']);
    expect(result.view?.location.id).toBe('ruins');
  });

  it('carries the command’s view forward, so the next command reads the world it left', () => {
    const { ctx } = fixture(TRAVEL_MODULE);
    runLine(ctx, choiceIndex(ctx, 'travel:ruins'));
    expect(ctx.view.location.id).toBe('ruins');
  });
});

describe('/test, /load, /expect, /assert, /cancel', () => {
  it('/load <id> loads a save by id, erroring cleanly (not throwing) on an unknown one', () => {
    const { ctx } = fixture(SAVE_MODULE);
    runLine(ctx, '/wait 99');

    const ok = runLine(ctx, '/load empty');
    expect(ok.recorded).toEqual(['load: empty']);
    expect(ok.view?.time).toBe(0);

    expect(errors(runLine(ctx, '/load badsave'))).toEqual(['typed directive load: names an unknown save: badsave']);
  });

  it('/expect <id> confirms a match and warns on a mismatch, recording neither', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const match = runLine(ctx, '/expect empty');
    expect(tones(match)).toEqual(['ok']);
    expect(match.recorded).toEqual([]);

    runLine(ctx, 'use: entity.chest.open');
    expect(tones(runLine(ctx, '/expect empty'))).toEqual(['warn']);
  });

  it('/test <id> reports PASSED or FAILED and shows the world the replay left', () => {
    const { ctx } = fixture(SAVE_MODULE);
    const pass = runLine(ctx, '/test always-passes');
    expect(messages(pass)[0].text).toBe(`Test 'always-passes' PASSED`);
    expect(kinds(pass)).toEqual(['message', 'view']);

    const fail = runLine(ctx, '/test always-fails');
    expect(messages(fail)[0].text).toBe(`Test 'always-fails' FAILED: time < 0`);

    expect(errors(runLine(ctx, '/test'))).toEqual(['/test requires an id']);
    expect(errors(runLine(ctx, '/test nosuch'))).toEqual(['unknown test: nosuch']);
  });

  it('/cancel clears an in-flight spannable action and records "cancel"', () => {
    const { ctx } = fixture(LIVE_MODULE);
    runLine(ctx, 'begin: use entity.oven.roast');
    expect(ctx.view.action).not.toBeNull();

    const result = runLine(ctx, '/cancel');
    expect(result.view?.action).toBeNull();
    expect(result.recorded).toEqual(['cancel']);
  });
});

const MODAL_MODULE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  mirror
  sage

# flag greeted

# entity mirror
look in:
  instant
  open modal: choose-race
  open modal: name-yourself

# race human

# race elf

# race dwarf

# race orc

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  -> Ask the way.
  -> Say nothing.

# save fresh
{"version":${SAVE_VERSION}}

# test crosses-a-modal
load: fresh
use: entity.mirror.look-in
submit-modal: name=Rowan
submit-modal: race=elf
`;

const STACKED_MODAL_MODULE =
  FIXTURE_WORLD +
  `
# race human

# race elf

# race dwarf

# race orc
# location camp
entities:
  sage

# flag greeted

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  open modal: name-yourself
  -> Ask about the mirror.
`;

describe('a modal is driven by its published name and options', () => {
  it('publishes the open modal and the option it is waiting on', () => {
    const { ctx } = fixture(MODAL_MODULE);

    const opened = runLine(ctx, 'use: entity.mirror.look-in');
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['choose-race', 'name-yourself']);
    expect(opened.view?.modals[1].options.map((option) => option.key)).toEqual(['name']);
    expect(opened.view?.modals[1].options[0].values).toBeNull();

    const named = runLine(ctx, 'submit-modal: name=Rowan');
    expect(named.view?.modals.map((modal) => modal.name)).toEqual(['choose-race']);
    expect(named.view?.modals[0].options.map((option) => option.key)).toEqual(['race']);
    expect(takes(named.view?.modals[0].options[0])).toEqual(['human', 'elf', 'dwarf', 'orc']);
  });

  it('answers a listed value by number and records the canonical submit-modal: line either way', () => {
    const { ctx, recorder } = fixture(MODAL_MODULE);

    const opened = runLine(ctx, 'talk: sage');
    expect(takes(opened.view?.modals[0].options[0])).toEqual(['0', '1']);

    const answered = runLine(ctx, '2');
    expect(answered.recorded).toEqual(['submit-modal: choice=1']);
    expect(answered.view?.modals).toEqual([]);
    expect(recorder.history).toEqual(['talk: sage', 'submit-modal: choice=1']);
  });

  it('asks for the top of the stack, not the bottom, when one modal sits over another', () => {
    const { ctx } = fixture(STACKED_MODAL_MODULE);

    const opened = runLine(ctx, 'talk: sage');
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['name-yourself', 'dialogue']);

    const answered = runLine(ctx, '1');
    expect(answered.recorded).toEqual(['submit-modal: choice=0']);
    expect(answered.view?.modals.map((modal) => modal.name)).toEqual(['name-yourself']);
  });

  it('refuses a bare line while a modal is open instead of taking it as the field being asked for', () => {
    const { ctx, session, recorder } = fixture(MODAL_MODULE);

    runLine(ctx, 'use: entity.mirror.look-in');
    expect(errors(runLine(ctx, 'Rowan'))).toEqual(['invalid choice: "Rowan"']);
    expect(statusOf(runLine(ctx, '/state')).status.location.id).toBe('camp');

    const still = sessionStatus(session);
    expect(still.player).toEqual({ name: null, race: null });
    expect(still.modals.map((modal) => modal.name)).toEqual(['choose-race', 'name-yourself']);
    expect(recorder.history).toEqual(['use: entity.mirror.look-in']);
  });

  it('never takes a line as a modal field: a command after a /test that crossed a modal is still a command', () => {
    const { ctx } = fixture(MODAL_MODULE);

    const replayed = runLine(ctx, '/test crosses-a-modal');
    expect(messages(replayed)[0].text).toBe(`Test 'crosses-a-modal' PASSED`);
    expect(replayed.view?.modals).toEqual([]);

    expect(statusOf(runLine(ctx, '/state')).status.location.id).toBe('camp');
    expect(kinds(runLine(ctx, '/inventory'))).toEqual(['view']);
  });

  it('emits a replayable # test from a session that crossed a modal, with no hand-editing', () => {
    const { ctx } = fixture(MODAL_MODULE);

    runLine(ctx, 'use: entity.mirror.look-in');
    runLine(ctx, 'submit-modal: name=Rowan');
    const done = runLine(ctx, 'submit-modal: race=elf');
    expect(done.view?.player).toEqual({ name: { id: 'Rowan', label: 'Name', title: 'Rowan' }, race: { id: 'elf', label: 'Race', title: 'Elf' } });

    const created = runLine(ctx, '/create-valid-test crossed');
    const blocks = created.output.find((out) => out.kind === 'authored');
    expect(blocks?.kind).toBe('authored');
    if (blocks?.kind !== 'authored') return;
    expect(blocks.blocks[blocks.blocks.length - 1]).toContain('submit-modal: name=Rowan');
    expect(blocks.blocks[blocks.blocks.length - 1]).toContain('submit-modal: race=elf');

    const pasted = `${MODAL_MODULE}\n${blocks.blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
    expect(runTest('crossed', loadInEnglish(pasted), createGameState())).toEqual({ passed: true });
  });
});

const LIVE_MODULE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  oven
  anvil
  bench

# item roasted-chestnut
examine: Split and steaming.

# item ingot
examine: A dull grey bar.

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# entity anvil
strike:
  time: 3
  give: 1 ingot

# entity bench
title: Bench
sit:
  instant
  say: You rest a moment.

# save fresh
{"version":${SAVE_VERSION}}
`;

const FIGHT_MODULE = `
# stat attack
base: 6

# stat defense
base: 0

# stat accuracy
base: 100

# stat evasion
base: 0

# stat attack-rate
base: 60

# stat max-health
base: 30

# stat regeneration

# resource health
rate: regeneration
max: max-health
display: full

# faction world

# faction player

# action swing
title: Swing
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health

# location camp
x: 0, y: 0
starting
entities:
  rat

# entity player
title: You
faction: player
stats: max-health 30, attack 6, defense 0, attack-rate 60, accuracy 100, evasion 0
uses: swing

# entity rat
title: Rat
faction: world
stats: max-health 12, attack 0, defense 0, attack-rate 6, accuracy 0, evasion 0
uses: swing
`;

describe('the live clock', () => {
  function liveFixture(text: string, choiceId: string, speed = 1) {
    const session = startSession(loadInEnglish(text));
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };
    const ctx = newContext(session, view(session), { recorder, speed, driving: true });
    const index = ctx.view.choices.findIndex((choice) => choice.id === choiceId) + 1;
    expect(index).toBeGreaterThan(0);
    return { ctx, recorder, started: runLine(ctx, String(index)) };
  }

  it('advances sim-time by exactly elapsedMs/1000 * the speed dial for one tick', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast', 2);
    const progress = started.live!.tick(500);
    expect(progress.time).toBe(1);
    expect(progress.view.time).toBe(1);
    expect(progress.active).toBe(true);
  });

  it('reads the dial /speed turns, rather than a copy taken when the run began', () => {
    const { ctx, started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');
    expect(started.live!.tick(1000).time).toBe(1);
    runLine(ctx, '/speed 4');
    expect(started.live!.tick(1000).time).toBe(5);
  });

  it('a repeating action stays active across many ticks and eventually produces output', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');

    let last = started.live!.tick(200);
    for (let i = 1; i < 25; i++) {
      last = started.live!.tick(200);
      expect(last.active).toBe(true);
    }
    expect(last.time).toBe(5);
    expect(last.view.inventory['roasted-chestnut']).toBe(1);
    expect(last.view.action).not.toBeNull();
  });

  it('reports active: false once a non-repeating spannable action completes on its own', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    expect(started.live).toBeDefined();

    expect(started.live!.tick(1000).active).toBe(true);
    expect(started.live!.tick(1000).active).toBe(true);

    const done = started.live!.tick(2000);
    expect(done.active).toBe(false);
    expect(done.view.action).toBeNull();
    expect(done.view.inventory.ingot).toBe(1);
  });

  it('names the action a tick finishes from the tick before, since the view that ends it has none', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    started.live!.tick(2000);
    expect(started.live!.tick(2000)).toMatchObject({ active: false, label: 'Strike' });
  });

  it('counts down an untargeted action whose plain damage: reads under 1 — the one shape that publishes a completion', () => {
    const TAPPING_MODULE =
      FIXTURE_WORLD +
      `
# stat tap
base: 0.2

# stat taps-per-minute
base: 60

# location camp
entities:
  bell

# entity bell
title: Bell
ring:
  continuous
  rate: taps-per-minute
  damage: tap
`;
    const { started } = liveFixture(TAPPING_MODULE, 'use:entity.bell.ring');
    const counted = [started.live!.tick(1000), started.live!.tick(1000)].map((progress) => progress.implicit);
    expect(counted).toEqual([
      { attempts: 1, completion: 0.8 },
      { attempts: 2, completion: 0.6 },
    ]);
    expect(started.live!.tick(1000).pools).toEqual([]);
  });

  it('records the begin, the elapsed wait and the cancel, so a live run replays as directives', () => {
    const { recorder, started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');
    expect(recorder.history).toEqual(['begin: use entity.oven.roast']);

    started.live!.tick(3500);
    const ended = started.live!.end(true);
    expect(ended.view?.action).toBeNull();
    expect(recorder.history).toEqual(['begin: use entity.oven.roast', 'wait: 3.5', 'cancel']);
    expect(messages(ended).map((out) => out.text)).toEqual(['Stopped.']);
  });

  it('records a completed run without a cancel, and nothing at all for an instant choice', () => {
    const { recorder, started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    started.live!.tick(4000);
    started.live!.end(false);
    expect(recorder.history).toEqual(['begin: use entity.anvil.strike', 'wait: 4']);

    const instant = liveFixture(LIVE_MODULE, 'use:entity.bench.sit');
    expect(instant.started.live).toBeUndefined();
    expect(instant.recorder.history).toEqual(['use: entity.bench.sit']);
    expect(instant.ctx.view.said).toContain('You rest a moment.');
  });

  it('refuses a choice number no view offers, whether it arrives as a line or as an argument', () => {
    const session = startSession(loadInEnglish(LIVE_MODULE));
    const ctx = newContext(session, view(session), { driving: true });
    const typed = runLine(ctx, '99');
    expect(typed.live).toBeUndefined();
    expect(errors(typed)).toEqual(['invalid choice: "99"']);

    const choice = COMMANDS.find((spec) => spec.match === 'choice')!;
    const dispatched = runCommand(ctx, choice, 99);
    expect(dispatched.live).toBeUndefined();
    expect(errors(dispatched)).toEqual(['invalid choice: "99"']);
  });

  it('the same entry resolves the choice instantly when the driver cannot advance a run', () => {
    const session = startSession(loadInEnglish(LIVE_MODULE));
    const recorder: Recorder = { history: [], startSave: serializeSession(session) };
    const ctx = newContext(session, view(session), { recorder });
    const index = ctx.view.choices.findIndex((choice) => choice.id === 'use:entity.anvil.strike') + 1;

    const result = runLine(ctx, String(index));
    expect(result.live).toBeUndefined();
    expect(recorder.history).toEqual(['use: entity.anvil.strike']);
    expect(result.view?.inventory.ingot).toBe(1);
  });

  it('measures the wait it records from where the run began, not from the clock', () => {
    const { ctx, recorder, started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');
    started.live!.end(false);
    expect(recorder.history).toEqual(['begin: use entity.oven.roast']);

    runLine(ctx, '/wait 10');
    const index = ctx.view.choices.findIndex((choice) => choice.id === 'use:entity.anvil.strike') + 1;
    const second = runLine(ctx, String(index));
    second.live!.tick(2000);
    second.live!.end(true);
    expect(recorder.history).toEqual([
      'begin: use entity.oven.roast',
      'wait: 10',
      'begin: use entity.anvil.strike',
      'wait: 2',
      'cancel',
    ]);
  });

  it('publishes no completion countdown for a run whittling a named pool down', () => {
    const { started } = liveFixture(FIGHT_MODULE, 'fight:swing:rat');
    const progress = [started.live!.tick(900), started.live!.tick(900)];
    expect(progress[1].pools).toEqual([
      { title: 'Health', current: 30, max: 30, remaining: null },
      { title: 'Rat', current: 6, max: 12, remaining: 1 },
    ]);
    for (const each of progress) expect(each.implicit).toBeNull();
  });

  it('ends once, however it ends: a second end records nothing and a later tick moves nothing', () => {
    const { ctx, recorder, started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');
    started.live!.tick(1000);

    const first = started.live!.end(true);
    const history = [...recorder.history];
    expect(history).toEqual(['begin: use entity.oven.roast', 'wait: 1', 'cancel']);

    expect(started.live!.end(true)).toBe(first);
    expect(started.live!.end(false)).toBe(first);
    expect(recorder.history).toEqual(history);

    const after = started.live!.tick(5000);
    expect(after.active).toBe(false);
    expect(after.time).toBe(1);
    expect(sessionStatus(ctx.session).time).toBe(1);
  });

  it('stays finished once the action completes on its own, without a driver watching active', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    expect(started.live!.tick(4000).active).toBe(false);

    const again = started.live!.tick(4000);
    expect(again.active).toBe(false);
    expect(again.time).toBe(4);
    expect(again.label).toBe('Strike');
  });

  it('names the action it is driving from its own last tick, not from state another command can move', () => {
    const { ctx, started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    started.live!.tick(1000);
    runLine(ctx, '/load fresh');
    expect(ctx.view.action).toBeNull();
    expect(started.live!.tick(3000)).toMatchObject({ active: false, label: 'Strike' });
  });

  it('isChoiceLine names the choice a line picks, and nothing else', () => {
    const { ctx } = fixture(TRAVEL_MODULE);
    expect(isChoiceLine(ctx.view, '1')).toBe(1);
    expect(isChoiceLine(ctx.view, ' 1 ')).toBe(1);
    expect(isChoiceLine(ctx.view, '')).toBeNull();
    expect(isChoiceLine(ctx.view, '0')).toBeNull();
    expect(isChoiceLine(ctx.view, String(ctx.view.choices.length + 1))).toBeNull();
    expect(isChoiceLine(ctx.view, '/quit')).toBeNull();
  });
});

describe('the recorder: /create-test and /create-valid-test', () => {
  function recorded(): Fixture {
    const made = fixture(TRAVEL_MODULE);
    runLine(made.ctx, choiceIndex(made.ctx, 'travel:ruins'));
    runLine(made.ctx, 'wait: 1');
    return made;
  }

  function authoredBlocks(result: CommandResult): string[][] {
    const found = result.output.find((out) => out.kind === 'authored');
    if (found?.kind !== 'authored') throw new Error('no authored blocks');
    return found.blocks;
  }

  it('a numbered choice and a typed directive both land in recorder.history in canonical form', () => {
    expect(recorded().recorder.history).toEqual(['travel: ruins', 'wait: 1']);
  });

  it('emits the # save and # test a run is written as, under the name every writer of one reads', () => {
    const { ctx, session } = recorded();
    const result = runLine(ctx, '/create-test foo');

    expect(messages(result)[0].text).toBe(`Created test 'foo' (2 steps).`);
    expect(authoredBlocks(result)).toEqual([
      [`# save ${startSaveId('foo')}`, `{"version":${SAVE_VERSION},"flags":{"camp.touched":true,"camp.discovered":true,"ruins.discovered":true}}`],
      ['# test foo', `load: ${startSaveId('foo')}`, 'travel: ruins', 'wait: 1'],
    ]);
    expect(session.registry.tests.has('foo')).toBe(true);
    expect(session.registry.saves.has(startSaveId('foo'))).toBe(true);
  });

  it('/create-test on an id that already exists errors instead of overwriting', () => {
    const { ctx } = recorded();
    runLine(ctx, '/create-test foo');
    expect(errors(runLine(ctx, '/create-test foo'))).toEqual([`test 'foo' already exists`]);
  });

  it('/create-valid-test appends expect: <id>-end and its # save; the record -> emit -> reload -> replay round trip passes', () => {
    const { ctx, session } = recorded();
    const result = runLine(ctx, '/create-valid-test bar');
    const blocks = authoredBlocks(result);

    expect(blocks[1][0]).toBe('# save bar-end');
    expect(blocks[blocks.length - 1]).toContain('expect: bar-end');
    expect(session.registry.tests.has('bar')).toBe(true);

    const pasted = `${TRAVEL_MODULE}\n${blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
    expect(runTest('bar', loadInEnglish(pasted), createGameState()).passed).toBe(true);
  });

  it('adopts exactly the sections it emits, so nothing lands under a name the written form does not use', () => {
    const { ctx, session } = recorded();
    const written = authoredBlocks(runLine(ctx, '/create-valid-test bar')).map((block) => block[0]);

    const adopted = [...[...session.registry.saves.keys()].map((id) => `# save ${id}`), ...[...session.registry.tests.keys()].map((id) => `# test ${id}`)];

    expect(adopted.filter((heading) => heading.includes(' bar')).sort()).toEqual([...written].sort());
  });

  it('does not prepend a second load:/-start save when the history already begins with load:', () => {
    const { ctx } = fixture(TRAVEL_MODULE);
    ctx.recorder.history.push('load: someplace');
    runLine(ctx, choiceIndex(ctx, 'travel:ruins'));

    const blocks = authoredBlocks(runLine(ctx, '/create-test baz'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual(['# test baz', 'load: someplace', 'travel: ruins']);
  });

  it('says so rather than throwing when the session began without a start save', () => {
    const session = startSession(loadInEnglish(TRAVEL_MODULE));
    const ctx = newContext(session, view(session));
    runLine(ctx, choiceIndex(ctx, 'travel:ruins'));

    for (const command of ['/create-test unsaved', '/create-valid-test unsaved']) {
      const result = runLine(ctx, command);
      expect(errors(result), command).toEqual(['no start save was taken when this session began']);
    }
    expect(session.registry.tests.has('unsaved')).toBe(false);
    expect(session.registry.saves.has(startSaveId('unsaved'))).toBe(false);
    expect(session.registry.saves.has('unsaved-end')).toBe(false);
  });

  it('/create-test with nothing recorded yet, or with no id, errors', () => {
    const { ctx, session } = fixture(TRAVEL_MODULE);
    expect(errors(runLine(ctx, '/create-test empty'))).toEqual(['nothing recorded yet']);
    expect(session.registry.tests.has('empty')).toBe(false);
    expect(errors(runLine(ctx, '/create-test'))).toEqual(['/create-test requires an id']);
    expect(errors(runLine(ctx, '/create-valid-test'))).toEqual(['/create-valid-test requires an id']);
  });
});

const AUTHORING_MODULE =
  `
# info base
version: 1.0.0
` +
  FIXTURE_WORLD +
  `
# location camp
entities:
  chest

# entity chest
title: Chest
open:
  say: Empty.

# item coin
title: Coin
`;

function authoringFixture() {
  const baseSources: ModuleSource[] = [engineLocale(), { name: 'base', text: AUTHORING_MODULE }];
  const writes: string[] = [];
  let onDisk = initialLocalChangesModule(['base']);
  const authoring: AuthoringContext = {
    baseSources,
    dependencies: ['base'],
    localSource: { name: 'local-changes', text: onDisk },
    writeLocalChanges: (text) => {
      writes.push(text);
      onDisk = text;
    },
    readLocalChanges: () => onDisk,
  };
  const elsewhere = (...sections: string[]): void => void (onDisk = renderLocalChangesModule(['base'], sections));
  const elsewhereWholeFile = (text: string): void => void (onDisk = text);
  return { ...fixture(AUTHORING_MODULE, authoring), authoring, writes, elsewhere, elsewhereWholeFile };
}

describe('local DSL authoring takes its file as an argument, never reaching for one', () => {

  it('/dsl stages a section, hands it to the writer it was given, reloads it, and /local can show/delete it', () => {
    const { ctx, session, authoring, writes } = authoringFixture();

    const created = runLine(ctx, '/dsl item gem title: Gem | examine: Cut bright.');
    expect(messages(created)[0].text).toBe('Staged # item gem in local-changes.');
    expect(writes).toHaveLength(1);
    expect(authoring.localSource.text).toContain('# item gem');
    expect(authoring.localSource.text).toContain('dependencies:');
    expect(session.registry.items.get('local-changes.gem')?.title).toBe('Gem');

    const listed = runLine(ctx, '/local').output[0];
    expect(listed.kind === 'source' && listed.lines).toEqual(['# item gem']);

    const shown = runLine(ctx, '/local show').output[0];
    expect(shown.kind).toBe('source');
    if (shown.kind === 'source') {
      expect(shown.lines).toContain('# info local-changes');
      expect(shown.lines).toContain('# item gem');
    }

    const removed = runLine(ctx, '/local delete item gem');
    expect(messages(removed)[0].text).toBe('Deleted local # item gem.');
    expect(session.registry.items.has('local-changes.gem')).toBe(false);
    expect(messages(runLine(ctx, '/local'))[0].text).toBe('No local changes staged.');
  });

  it('writes nothing anywhere when the authoring context supplies no writer', () => {
    const { ctx, session, authoring } = authoringFixture();
    delete authoring.writeLocalChanges;
    const created = runLine(ctx, '/dsl item gem title: Gem');
    expect(errors(created)).toEqual([]);
    expect(session.registry.items.get('local-changes.gem')?.title).toBe('Gem');
  });

  it('/dsl edits existing content by staging a field-granular patch', () => {
    const { ctx, session } = authoringFixture();

    const edited = runLine(ctx, '/dsl entity base.chest title: Treasure Chest');
    expect(messages(edited)[0].text).toBe('Staged # entity base.chest in local-changes.');
    const chest = session.registry.entities.get('base.chest')!;
    expect(chest.title).toBe('Treasure Chest');
    expect(chest.actions.map((action) => action.label)).toEqual(['open']);
  });

  it('/dsl rejects invalid local changes without writing or mutating the live registry', () => {
    const { ctx, session, authoring, writes } = authoringFixture();
    const before = authoring.localSource.text;

    const rejected = runLine(ctx, '/dsl entity base.chest open: |   give: missing-item');
    const failure = messages(rejected)[0];
    expect(failure.tone).toBe('error');
    expect(failure.text).toBe('local changes did not load.');
    expect(failure.detail?.some((line) => line.includes('missing-item'))).toBe(true);
    expect(writes).toEqual([]);
    expect(authoring.localSource.text).toBe(before);
    expect(session.registry.entities.get('base.chest')?.actions[0].results).toEqual([{ kind: 'say', text: 'Empty.', key: 'base.entity.chest.say.0' }]);
  });

  it('/local clear reloads and prunes stale state from removed local content', () => {
    const { ctx } = authoringFixture();

    runLine(ctx, '/dsl item gem title: Gem');
    runLine(ctx, `/dsl save carried {"version":${SAVE_VERSION},"inventory":{"local-changes.gem":1}}`);
    runLine(ctx, '/load local-changes.carried');
    expect(ctx.view.inventory['local-changes.gem']).toBe(1);

    const cleared = runLine(ctx, '/local clear');
    expect(messages(cleared)[0].text).toBe('Cleared local-changes.');
    expect(messages(cleared).some((out) => out.tone === 'warn' && out.text.includes('Removed inventory local-changes.gem'))).toBe(true);
    expect(cleared.view?.said).toEqual([]);
    expect(cleared.view?.inventory['local-changes.gem']).toBeUndefined();
  });

  it('/dsl can author every DSL section kind that local-changes is allowed to own', () => {
    const { ctx, session } = authoringFixture();
    const commands = [
      '/dsl stat vigor base: 10',
      '/dsl skill focus tags: +1 local-changes.vigor per level of local-changes.focus',
      '/dsl item token title: Token',
      '/dsl item ore title: Ore',
      '/dsl item ingot title: Ingot',
      '/dsl item temporary title: Temporary',
      '/dsl entity npc title: NPC | cheer: say: Hello.',
      '/dsl location grove x: 1, y: 0 | entities: local-changes.npc',
      '/dsl flag levered',
      '/dsl variable local-knob value: 2',
      '/dsl resource stamina max: local-changes.vigor',
      '/dsl recipe smelt in: local-changes.ore | out: local-changes.ingot',
      '/dsl dialogue npc-chat owner = local-changes.npc | node greet: |   Hello there.',
      `/dsl save blank {"version":${SAVE_VERSION}}`,
      '/dsl test smoke assert: time >= 0',
      '/dsl remove item.local-changes.temporary',
    ];

    for (const command of commands) expect(errors(runLine(ctx, command)), command).toEqual([]);

    const registry = session.registry;
    expect(registry.stats.get('local-changes.vigor')?.base).toEqual({ min: 10, max: 10 });
    expect(registry.skills.get('local-changes.focus')?.tags).toEqual([{ kind: 'stat-bonus', statId: 'local-changes.vigor', percent: false, amount: { min: 1, max: 1 }, per: { kind: 'level', id: 'local-changes.focus' } }]);
    expect(registry.items.get('local-changes.token')?.title).toBe('Token');
    expect(registry.entities.get('local-changes.npc')?.actions).toEqual([{ label: 'cheer', results: [{ kind: 'say', text: 'Hello.', key: 'local-changes.entity.npc.say.0' }] }]);
    expect(registry.locations.get('local-changes.grove')).toMatchObject({ x: 1, y: 0, entities: [{ entity: 'local-changes.npc' }] });
    expect(registry.flags.has('local-changes.levered')).toBe(true);
    expect(registry.variables.get('local-knob')?.value).toBe(2);
    expect(registry.resources.get('local-changes.stamina')?.max).toBe('local-changes.vigor');
    expect(registry.recipes.get('local-changes.smelt')).toMatchObject({ in: [{ item: 'local-changes.ore' }], out: [{ item: 'local-changes.ingot' }] });
    expect(registry.dialogues.get('local-changes.npc-chat')?.owner).toBe('local-changes.npc');
    expect(registry.saves.get('local-changes.blank')).toMatchObject({ version: SAVE_VERSION, diff: {} });
    expect(registry.tests.get('local-changes.smoke')?.directives).toMatchObject([{ kind: 'assert', condition: { operator: '>=' } }]);
    expect(registry.items.has('local-changes.temporary')).toBe(false);

    expect(runLine(ctx, '/load local-changes.blank').recorded).toEqual(['load: local-changes.blank']);
  });

  it('reports the malformed and the unknown by name', () => {
    const { ctx } = authoringFixture();
    expect(errors(runLine(ctx, '/dsl'))).toEqual(['/dsl requires <kind> <id> [body]']);
    expect(errors(runLine(ctx, '/dsl item'))).toEqual(['/dsl requires <kind> <id> [body]']);
    expect(errors(runLine(ctx, '/local bogus'))).toEqual(['unknown /local command: bogus']);
    expect(errors(runLine(ctx, '/local delete item nosuch'))).toEqual(['no local # item nosuch is staged.']);
  });

  it('reports local authoring commands as unavailable when no authoring context is provided', () => {
    const { ctx } = fixture(AUTHORING_MODULE);
    expect(errors(runLine(ctx, '/dsl item gem'))).toEqual(['local authoring is unavailable.']);
    expect(errors(runLine(ctx, '/local'))).toEqual(['local authoring is unavailable.']);
    expect(errors(runLine(ctx, '/reload'))).toEqual(['local authoring is unavailable.']);
  });
});

const TOWER = ['# location tower', 'title: Tower', 'x: 1, y: 0'].join('\n');
const ROAD_TO_TOWER = ['# location base.camp', 'adjacent:', '  tower'].join('\n');
const BROKEN_CHEST = ['# entity base.chest', 'open:', '  give: missing-item'].join('\n');

function snapshotOf(session: PlaySession) {
  return {
    status: JSON.stringify(sessionStatus(session)),
    save: serializeSession(session),
    locations: [...session.registry.locations.keys()].sort(),
    items: [...session.registry.items.keys()].sort(),
  };
}

describe('/reload adopts what another process wrote, or refuses the edit whole', () => {
  it('reaches a location a different process added to the local file, with no restart', () => {
    const { ctx, session, elsewhere } = authoringFixture();
    expect(session.registry.locations.has('local-changes.tower')).toBe(false);

    elsewhere(TOWER, ROAD_TO_TOWER);
    const reloaded = runLine(ctx, '/reload');

    expect(errors(reloaded)).toEqual([]);
    expect(messages(reloaded)[0].text).toBe('Reloaded local-changes.');
    expect(session.registry.locations.get('local-changes.tower')?.title).toBe('Tower');
    expect(ctx.view.choices.map((choice) => choice.id)).toContain('travel:local-changes.tower');

    runLine(ctx, 'travel: local-changes.tower');
    expect(sessionStatus(session).location.id).toBe('local-changes.tower');
  });

  it('leaves registry, state, log and clock untouched when the file does not load', () => {
    const { ctx, session, elsewhere } = authoringFixture();
    runLine(ctx, '/wait 5');
    const before = snapshotOf(session);

    elsewhere(TOWER, BROKEN_CHEST);
    const refused = runLine(ctx, '/reload');

    expect(errors(refused)).toEqual(['local changes did not load.']);
    expect(messages(refused)[0].detail?.some((line) => line.includes('missing-item'))).toBe(true);
    expect(snapshotOf(session)).toEqual(before);
    expect(session.registry.locations.has('local-changes.tower')).toBe(false);
    expect(errors(runLine(ctx, '/wait 1'))).toEqual([]);
    expect(sessionStatus(session).time).toBe(6);
  });

  it('prunes state the edit invalidated, reporting each prune, and leaves a state the registry resolves', () => {
    const { ctx, session, elsewhere } = authoringFixture();
    runLine(ctx, '/dsl item gem title: Gem');
    runLine(ctx, `/dsl save carried {"version":${SAVE_VERSION},"inventory":{"local-changes.gem":1}}`);
    runLine(ctx, '/dsl location outpost x: 2, y: 0');
    runLine(ctx, '/dsl location base.camp adjacent: |   outpost');
    runLine(ctx, '/load local-changes.carried');
    runLine(ctx, 'travel: local-changes.outpost');
    expect(sessionStatus(session).location.id).toBe('local-changes.outpost');
    expect(ctx.view.inventory['local-changes.gem']).toBe(1);

    elsewhere();
    const reloaded = runLine(ctx, '/reload');

    expect(errors(reloaded)).toEqual([]);
    const reported = messages(reloaded).filter((out) => out.tone === 'warn').map((out) => out.text);
    expect(reported.some((line) => line.includes('Removed inventory local-changes.gem'))).toBe(true);
    expect(reported.some((line) => line.includes('local-changes.outpost'))).toBe(true);
    expect(reloaded.view?.said).toEqual([]);
    expect(reloaded.view?.inventory['local-changes.gem']).toBeUndefined();
    expect(session.registry.locations.has(sessionStatus(session).location.id)).toBe(true);
  });

  it('says the same thing and leaves the same session however many times it is called', () => {
    const { ctx, session } = authoringFixture();
    runLine(ctx, '/dsl item gem title: Gem');
    runLine(ctx, '/wait 4');
    const before = snapshotOf(session);
    const first = runLine(ctx, '/reload');

    expect(snapshotOf(session)).toEqual(before);
    expect(first.view?.said).toEqual([]);
    for (const each of [runLine(ctx, '/reload'), runLine(ctx, '/reload')]) {
      expect(messages(each).map((out) => out.text)).toEqual(messages(first).map((out) => out.text));
      expect(snapshotOf(session)).toEqual(before);
    }
  });

  it('refuses when the context has no reader, and says so without touching the session', () => {
    const { ctx, session, authoring, elsewhere } = authoringFixture();
    delete authoring.readLocalChanges;
    elsewhere(TOWER);

    expect(errors(runLine(ctx, '/reload'))).toEqual(['local changes cannot be re-read here.']);
    expect(session.registry.locations.has('local-changes.tower')).toBe(false);
  });

  it('reports a reader that threw rather than crashing the session', () => {
    const { ctx, session, authoring } = authoringFixture();
    authoring.readLocalChanges = () => {
      throw new Error('EACCES');
    };

    expect(errors(runLine(ctx, '/reload'))).toEqual(['could not read local changes: EACCES']);
    expect(sessionStatus(session).location.id).toBe('base.camp');
  });

  it('refuses a bad edit identically whichever command carried it, which is the gate being one', () => {
    const staged = authoringFixture();
    const read = authoringFixture();
    read.elsewhere(BROKEN_CHEST);

    const byWrite = runLine(staged.ctx, '/dsl entity base.chest open: |   give: missing-item');
    const byRead = runLine(read.ctx, '/reload');

    const spoken = (result: CommandResult) => messages(result).map((out) => ({ tone: out.tone, text: out.text }));
    expect(spoken(byRead)).toEqual(spoken(byWrite));
    expect(staged.writes).toEqual([]);
  });

  it('composes a staged section against the file, not against what this session last wrote', () => {
    const { ctx, session, authoring, writes, elsewhere } = authoringFixture();
    elsewhere(TOWER);
    expect(authoring.localSource.text).not.toContain('# location tower');

    expect(errors(runLine(ctx, '/dsl item gem title: Gem'))).toEqual([]);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('# location tower');
    expect(writes[0]).toContain('# item gem');
    expect(session.registry.locations.get('local-changes.tower')?.title).toBe('Tower');
    expect(session.registry.items.get('local-changes.gem')?.title).toBe('Gem');
  });

  it('writes nothing over a file that no longer loads, so the other process keeps its text', () => {
    const { ctx, writes, elsewhere } = authoringFixture();
    elsewhere(BROKEN_CHEST);

    expect(errors(runLine(ctx, '/dsl item gem title: Gem'))).toEqual(['local changes did not load.']);
    expect(writes).toEqual([]);
  });

  it('lists, prints and deletes what the file holds rather than what this session remembers', () => {
    const { ctx, writes, elsewhere } = authoringFixture();
    elsewhere(TOWER);

    const listed = runLine(ctx, '/local').output[0];
    expect(listed.kind === 'source' && listed.lines).toEqual(['# location tower']);
    const printed = runLine(ctx, '/local show').output[0];
    expect(printed.kind === 'source' && printed.lines).toContain('# location tower');

    const removed = runLine(ctx, '/local delete location tower');
    expect(messages(removed)[0].text).toBe('Deleted local # location tower.');
    expect(writes[0]).not.toContain('# location tower');
  });

  it('reports a reader that threw rather than staging against a copy it could not check', () => {
    const { ctx, authoring, writes } = authoringFixture();
    authoring.readLocalChanges = () => {
      throw new Error('EACCES');
    };

    for (const line of ['/dsl item gem title: Gem', '/local', '/local show', '/local delete item gem']) {
      expect(errors(runLine(ctx, line)), line).toEqual(['could not read local changes: EACCES']);
    }
    expect(writes).toEqual([]);
  });

  it('keeps the header the other process wrote, not only the sections under it', () => {
    const { ctx, writes, elsewhereWholeFile } = authoringFixture();
    elsewhereWholeFile(['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '', '# item gem', 'title: Gem', ''].join('\n'));

    expect(errors(runLine(ctx, '/dsl item ruby title: Ruby'))).toEqual([]);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('version: 3.2.1');
    expect(writes[0]).toContain('pack: shared');
    expect(writes[0]).toContain('# item gem');
    expect(writes[0]).toContain('# item ruby');
  });

  it('refuses in the local file’s own name when the local file is what will not parse', () => {
    const { ctx, writes, elsewhereWholeFile } = authoringFixture();
    elsewhereWholeFile(['# info local-changes', 'version: 0.0.0', 'pack: local', 'dependencies:', '  base', '', '# item', 'title: Nameless', ''].join('\n'));

    for (const line of ['/dsl item gem title: Gem', '/local', '/local delete item gem']) {
      const refusal = messages(runLine(ctx, line))[0];
      expect(refusal.text, line).toBe('local-changes does not parse: # item requires an id');
      expect(refusal.detail, line).toEqual(['/local clear replaces it.']);
    }
    expect(writes).toEqual([]);

    const printed = runLine(ctx, '/local show').output[0];
    expect(printed.kind === 'source' && printed.lines).toContain('# item');
    expect(messages(runLine(ctx, '/local clear'))[0].text).toBe('Cleared local-changes.');
  });

  it('refuses a bad line in the line’s own name, so the two failures do not sound alike', () => {
    const { ctx } = authoringFixture();
    expect(errors(runLine(ctx, '/dsl nosuchkind gem title: Gem'))).toEqual(['unknown section kind: nosuchkind']);
  });

  it('stages against a header narrower than the session, rather than refusing what a wider one allows', () => {
    const { ctx, session, writes, elsewhereWholeFile } = authoringFixture();
    elsewhereWholeFile(['# info local-changes', 'version: 1.0.0', ''].join('\n'));

    expect(errors(runLine(ctx, '/dsl entity watcher title: Watcher | poke: |   say: Hello.'))).toEqual([]);
    expect(errors(runLine(ctx, '/dsl location depot x: 3, y: 0 | entities: |   base.chest'))).toEqual([]);

    expect(writes[1]).toContain('version: 1.0.0');
    expect(writes[1]).toContain('  base');
    expect(session.registry.locations.get('local-changes.depot')?.entities).toEqual([{ entity: 'base.chest' }]);
  });

  it('stages under local-changes even when the file calls itself something else', () => {
    const { ctx, session, elsewhereWholeFile } = authoringFixture();
    elsewhereWholeFile(['# info some-other-module', 'version: 1.0.0', 'dependencies:', '  base', ''].join('\n'));

    expect(messages(runLine(ctx, '/dsl item ruby title: Ruby'))[0].text).toBe('Staged # item ruby in local-changes.');
    expect(session.registry.items.get('local-changes.ruby')?.title).toBe('Ruby');
    expect(session.registry.items.has('some-other-module.ruby')).toBe(false);
  });

  it('reads the remembered copy in exactly one place, which is the place that consults the file', () => {
    const source = readFileSync('src/runtime/command.ts', 'utf8');
    expect(source.match(/localSource\.text(?!\s*=)/g)).toHaveLength(1);
  });

  it('adopts through the one path /dsl adopts through: the file has exactly one adopt in it', () => {
    expect(readFileSync('src/runtime/command.ts', 'utf8').match(/\badoptRegistry\(/g)).toHaveLength(1);
  });
});

function fakeClock(): Clock & { at: number; cadence: number[]; stops: number; fire(): void } {
  const fires: Array<() => void> = [];
  return {
    at: 1_000,
    cadence: [],
    stops: 0,
    now() {
      return this.at;
    },
    every(ms, fire) {
      this.cadence.push(ms);
      fires.push(fire);
      return () => void (this.stops += 1);
    },
    fire() {
      for (const fire of fires) fire();
    },
  };
}

describe('the ticker a live run is advanced by', () => {
  it('hands over the time that actually passed, not the interval it asked for', () => {
    const clock = fakeClock();
    const spans: number[] = [];
    createTicker(clock, 200)((elapsedMs) => spans.push(elapsedMs));

    clock.at = 1_200;
    clock.fire();
    clock.at = 5_200;
    clock.fire();

    expect(spans).toEqual([200, 4000]);
  });

  it('ticks at the cadence the command surface publishes, so both drivers round the same way', () => {
    const clock = fakeClock();
    createTicker(clock)(() => undefined);

    expect(clock.cadence).toEqual([LIVE_TICK_MS]);
  });

  it('stops the timer it started when the run is over', () => {
    const clock = fakeClock();
    const stop = createTicker(clock)(() => undefined);

    stop();

    expect(clock.stops).toBe(1);
  });
});

describe('recording a growth the plane refused', () => {
  const GROWTH_MODULE =
    FIXTURE_WORLD +
    `
# cluster-jewel node
shape: point
open-connections: e
passives: 1 hale

# item blade
title: Blade
slot: hand
origin-cluster: node
item-level: 1

# save stocked
{"version":${SAVE_VERSION},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"node","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}
`;

  it('records the verb when it was done and the refusal when it was not', () => {
    const { ctx, recorder } = fixture(GROWTH_MODULE);
    runLine(ctx, '/load stocked');

    runLine(ctx, 'allocate: 1 at 0,0 slot e');
    const said = runLine(ctx, 'allocate: 1 at 0,0 slot e');

    expect(recorder.history).toEqual(['load: stocked', 'allocate: 1 at 0,0 slot e', 'refuse: allocate 1 at 0,0 slot e']);
    expect(said.view?.said).toContain('the e slot of 0,0 is already allocated');
  });
});

describe('a command says whose words it answered in (c4)', () => {
  const CAMP = ['# info camp', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting', 'entities:', '  chest', '', '# entity chest', 'title: Chest', 'open:', '  time: 40'].join('\n');

  const sources = [engineLocale(), { name: 'camp', text: CAMP }];
  const english = loadUniverse(sources);
  const translated = loadUniverse([...sources, translationOf(english)]);
  const zz = localizerFor(translated, TRANSLATED_LANGUAGE);

  const playing = (registry: Registry, language: string): CommandContext => {
    const session = startSession(registry, language);
    return newContext(session, view(session), { recorder: { history: [], startSave: serializeSession(session) }, driving: true });
  };

  const played = () => playing(translated, TRANSLATED_LANGUAGE);

  const spoken = (result: CommandResult, words: 'player' | 'tool'): string[] => messages(result).filter((out) => out.words === words).map((out) => out.text);

  it('answers the player from a key, in the language being played', () => {
    const ctx = played();

    expect(spoken(runLine(ctx, '/speed 3'), 'player')).toEqual([zz.engine('engine.command.speed', { speed: 3 })]);
    expect(spoken(runLine(ctx, '99'), 'player')).toEqual([zz.engine('engine.command.invalid-choice', { choice: zz.identifier('"99"') })]);
    expect(spoken(runLine(ctx, 'not a line at all'), 'player')).toEqual([zz.engine('engine.command.invalid-choice', { choice: zz.identifier('"not a line at all"') })]);
  });

  it('refuses a keystroke and a typed line in the one sentence, so neither driver has words the other lacks', () => {
    const ctx = played();
    const beyond = ctx.view.choices.length + 1;
    const numbered = COMMANDS.find((spec) => spec.match === 'choice')!;

    expect(spoken(runCommand(ctx, numbered, beyond), 'player')).toEqual(spoken(runLine(ctx, String(beyond)), 'player'));
  });

  it('stops a live run in the player language, which is the one message that route writes', () => {
    const ctx = played();
    const armed = runLine(ctx, choiceIndex(ctx, 'use:entity.camp.chest.open'));

    expect(spoken(armed.live!.end(true), 'player')).toEqual([zz.engine('engine.command.stopped')]);
  });

  it('relays a fault out of the engine as the tool speaking, never as the player being refused', () => {
    const ctx = played();
    const answered = runLine(ctx, 'submit-modal: verb=grow');

    expect(spoken(answered, 'player')).toEqual([]);
    expect(spoken(answered, 'tool')).toEqual(['no modal is open to answer: verb']);
  });

  it('moves every player message with the language and no authoring message, over the whole table', () => {
    const shaped: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'use: entity.camp.chest.open' };
    const script = COMMANDS.flatMap((spec) => [shaped[spec.name] ?? spec.name, `${shaped[spec.name] ?? spec.name} 1`]);
    const sweep = (registry: Registry, language: string) => {
      const ctx = playing(registry, language);
      return script.flatMap((line) => messages(runLine(ctx, line)).map((out) => ({ line, words: out.words, text: out.text })));
    };

    const asAuthored = sweep(english, BASE_LANGUAGE);
    const asPlayed = sweep(translated, TRANSLATED_LANGUAGE);

    expect(asPlayed.map(({ line, words }) => `${line}: ${words}`)).toEqual(asAuthored.map(({ line, words }) => `${line}: ${words}`));
    expect(new Set(asPlayed.map((each) => each.words))).toEqual(new Set(['player', 'tool']));

    const moved = asPlayed.filter((each, at) => each.text !== asAuthored[at].text);
    expect(asPlayed.filter((each) => each.words === 'player' && hasWords(each.text) && !moved.includes(each))).toEqual([]);
    expect(asPlayed.filter((each) => each.words === 'tool' && moved.includes(each))).toEqual([]);
    expect(moved.length).toBeGreaterThan(0);
  });
});
