import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGameState } from './runtime';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { loadUniverse, type Registry } from '../content/registry';
import { hasWords, translationOf, TRANSLATED_LANGUAGE } from '../content/translation';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { initialLocalChangesModule } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { SAVE_VERSION } from './save';
import type { ModalOption } from './modals';
import { runTest, serializeSession, sessionStatus, startSession, view, type PlaySession } from './session';
import {
  COMMANDS,
  createTicker,
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

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

// One wearable stack, and a save that puts it in the player's hands, which is the
// smallest world the inventory screen has anything to list.
const CARRYING_MODULE = `
# skill smithing

# location forge
x: 0, y: 0
starting

# item gauntlet
title: Gauntlet
slot: hand

# save stocked
{"version":${SAVE_VERSION},"inventory":{"gauntlet":1},"xp":{"smithing":5}}

# save armed
{"version":${SAVE_VERSION},"inventory":{"gauntlet":1},"equipped":{"hand":"gauntlet"}}
`;

// tutorial-island.dsl has no `# save` section, so /load and /expect need their own.
const SAVE_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  chest

# item gold
title: Gold

# entity chest
open:
  give: 1 gold

# save empty
{"version":${SAVE_VERSION},"flags":{"camp.discovered":true}}

# test always-passes
assert: time >= 0

# test always-fails
assert: time < 0
`;

// Unaliased on purpose: no entity offers a free relocate to `ruins`, so the edge
// surfaces as a genuine kind: 'travel' choice, which tutorial-island never has.
const TRAVEL_MODULE = `
# location camp
x: 0, y: 0
starting
adjacent:
  ruins

# location ruins
x: 1, y: 0
`;

interface Fixture {
  session: PlaySession;
  recorder: Recorder;
  ctx: CommandContext;
}

function fixture(text: string, authoring?: AuthoringContext): Fixture {
  const session = startSession(loadInEnglish(text));
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


// What a screen offers, as the answers alone: the words beside each are asserted
// where the language they are in is the point, and everywhere else they are
// noise between an option and the answers it takes.
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
        // A parse may refuse the argument; what it may never do is reach a
        // different entry than the one the token names.
        if ('problem' in parsed) expect(parsed.problem, line).toContain(spec.name.slice(1));
        else expect(parsed.spec, line).toBe(spec);
      }
    }
  });

  it('spells out in help exactly the argument its shape declares, so neither can drift from the other', () => {
    for (const spec of COMMANDS) {
      if (spec.match !== 'name') continue;
      // The rule that refuses `/quit junk` reads `arg`, and this is what keeps
      // `argHint` -- the half a player reads -- honest about the same thing.
      expect(spec.arg === 'none', spec.name).toBe(spec.argHint === '');
    }
  });

  it('gives a command no argument it does not declare, over every entry that declares none', () => {
    const { ctx, session } = fixture(SAVE_MODULE);
    const argumentless = COMMANDS.filter((spec) => spec.match === 'name' && spec.arg === 'none');
    expect(argumentless.map((spec) => spec.name)).toEqual(['/look', '/state', '/cancel', '/help', '/quit']);

    for (const spec of argumentless) {
      for (const spelling of [spec.name, ...spec.aliases]) {
        const result = runLine(ctx, `${spelling} junk`);
        // Refused as a line, not performed with the argument thrown away: the
        // merge base refused every one of these and `/quit junk` ended nothing.
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
    // The merge base tested `/create-test` with startsWith and had to try
    // `/create-valid-test` first to stay reachable. A token cannot shadow, so
    // the two entries need no order between them -- and the run-on spellings
    // that ordering made meaningful name no command at all.
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
    const { ctx } = fixture(source);
    const result = runLine(ctx, '/wait 30');
    expect(kinds(result)).toEqual(['view']);
    expect(result.view?.time).toBe(30);
    const shown = result.output[0];
    expect(shown.kind === 'view' && shown.view).toBe(result.view);
  });
});

describe('the commands a player plays with', () => {
  it('applies a numeric choice, mutating state and returning its narration', () => {
    const { ctx } = fixture(source);
    const result = runLine(ctx, choiceIndex(ctx, 'talk:tutorial-island.miki'));

    expect(result.quit).toBe(false);
    expect(result.view?.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(result.view?.said.some((line) => line.includes('Greetings, adventurer!'))).toBe(true);
  });

  it('/wait <seconds> advances the returned view.time by that amount', () => {
    const { ctx } = fixture(source);
    const before = ctx.view.time;
    const result = runLine(ctx, '/wait 30');
    expect(result.quit).toBe(false);
    expect(result.view?.time).toBe(before + 30);
  });

  it('/state reports the current status without advancing it, and produces no view', () => {
    const { ctx, session } = fixture(source);
    runLine(ctx, '/wait 42');

    const result = runLine(ctx, '/state');
    expect(result.view).toBeUndefined();
    expect(statusOf(result).status.time).toBe(42);
    expect(sessionStatus(session).time).toBe(42);
  });

  // c1: the screen is the only thing /inv produces, and the line that opens it is
  // recorded, so the route is a directive a `# test` replays and not a gesture.
  it('/inventory opens the screen and prints nothing beside it', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    const opened = runLine(ctx, '/inv');
    expect(kinds(opened)).toEqual(['view']);
    expect(opened.recorded).toEqual(['open-modal: carried-items']);
    expect(opened.view?.modals.map((modal) => ({ ...modal, options: answered(modal.options) }))).toEqual([{ name: 'carried-items', leaving: 'close', options: [{ key: 'item', label: 'Item', values: ['gauntlet', 'close'] }] }]);
  });

  // c1: the argument a GUI row hands over is the same dispatch a player types,
  // and selecting is answering the screen's own first question.
  it('/inventory <item> opens the same screen with that item already selected', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    const opened = runLine(ctx, '/inv gauntlet');
    expect(kinds(opened)).toEqual(['view']);
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=gauntlet']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['grow', 'equip', 'destroy', 'close'] }]);
  });

  // c1 and c18: the equipment row dispatches the same command, and the id it
  // hands over names the copy in the slot rather than the stack that copy left —
  // so the screen opens on the worn one and offers it Unequip.
  it('/inventory <slot> opens the copy that is worn while its stack still stands', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load armed');

    const opened = runLine(ctx, '/inv worn:hand');
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=worn:hand']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['grow', 'unequip', 'destroy', 'close'] }]);
  });

  it('/inventory <item> still opens the stack the worn copy left, and offers it Equip', () => {
    const { ctx } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load armed');

    const opened = runLine(ctx, '/inv gauntlet');
    expect(opened.recorded).toEqual(['open-modal: carried-items', 'submit-modal: item=gauntlet']);
    expect(answered(opened.view?.modals[0].options)).toEqual([{ key: 'verb', label: 'Gauntlet', values: ['grow', 'equip', 'destroy', 'close'] }]);
  });

  it('refuses an item the player is not carrying, and opens no screen to say so', () => {
    const { ctx } = fixture(CARRYING_MODULE);

    expect(errors(runLine(ctx, '/inv gauntlet'))).toEqual(['you carry no gauntlet']);
    expect(errors(runLine(ctx, '/inv bracer'))[0]).toContain('bracer');
    expect(ctx.view.modals).toEqual([]);
  });

  // c16: the slot spelling is the runtime's own and names nothing a player has
  // met, so an empty slot is refused as an empty slot rather than printed back.
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

    const equipped = runLine(ctx, '2');
    expect(equipped.recorded).toEqual(['submit-modal: verb=equip']);
    expect(sessionStatus(session).equipment).toEqual({ hand: 'gauntlet' });
    expect(equipped.view?.modals).toEqual([]);
  });

  // c15: the last listed value of every question this screen asks leaves it, and
  // taking it moves nothing.
  it('closes on the value that leaves, from either question, and moves no state', () => {
    const { ctx, session } = fixture(CARRYING_MODULE);
    runLine(ctx, '/load stocked');

    runLine(ctx, '/inv');
    expect(runLine(ctx, 'submit-modal: item=close').view?.modals).toEqual([]);

    runLine(ctx, '/inv gauntlet');
    const left = runLine(ctx, 'submit-modal: verb=close');
    expect(left.view?.modals).toEqual([]);
    expect(sessionStatus(session).equipment).toEqual({});
    expect(sessionStatus(session).inventory).toEqual({ gauntlet: 1 });
    expect(sessionStatus(session).time).toBe(0);
  });

  it('a blank line re-lists the choices without touching the world', () => {
    const { ctx, session } = fixture(source);
    const result = runLine(ctx, '');
    const listed = result.output[0];
    expect(listed.kind === 'choices' && listed.choices).toEqual(ctx.view.choices);
    expect(result.view).toBeUndefined();
    expect(sessionStatus(session).time).toBe(0);
  });

  it('/look asks for the location description again', () => {
    const { ctx } = fixture(source);
    const result = runLine(ctx, '/look');
    const shown = result.output[0];
    expect(shown.kind === 'view' && shown.reread).toBe(true);
    expect(result.view).toBe(ctx.view);
  });

  it('reports a friendly error for an out-of-range choice number, without throwing or quitting', () => {
    const { ctx } = fixture(source);
    const result = runLine(ctx, String(ctx.view.choices.length + 10));
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(errors(result)).toEqual([`invalid choice: ${JSON.stringify(String(ctx.view.choices.length + 10))}`]);
  });

  it('reports a friendly error for an unknown slash command, without throwing or quitting', () => {
    const { ctx } = fixture(source);
    const result = runLine(ctx, '/bogus');
    expect(result.quit).toBe(false);
    expect(result.view).toBeUndefined();
    expect(errors(result)).toEqual(['unknown command: /bogus']);
  });

  it('/quit and /q both signal quit with the final status', () => {
    for (const spelling of ['/quit', '/q']) {
      const { ctx } = fixture(source);
      const result = runLine(ctx, spelling);
      expect(result.quit, spelling).toBe(true);
      expect(statusOf(result).status.location.id).toBe('tutorial-island.guide-house');
    }
  });

  it('/speed <n> turns the live dial and rejects a non-positive or unreadable one', () => {
    const { ctx } = fixture(source);

    expect(errors(runLine(ctx, '/speed 4'))).toEqual([]);
    expect(ctx.live.speed).toBe(4);

    expect(errors(runLine(ctx, '/speed 0'))).toEqual(['/speed requires a positive number, got "0"']);
    expect(errors(runLine(ctx, '/speed nope'))).toEqual(['/speed requires a positive number, got "nope"']);
    expect(errors(runLine(ctx, '/speed'))).toEqual(['/speed requires a positive number, got ""']);
    expect(ctx.live.speed).toBe(4);
  });

  it('a typed travel: directive moves the player and records the canonical form', () => {
    const { ctx } = fixture(source);
    const result = runLine(ctx, 'travel: basement');
    expect(result.view?.location.id).toBe('tutorial-island.basement');
    expect(result.recorded).toEqual(['travel: tutorial-island.basement']);
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
    runLine(ctx, '/wait 99'); // diverge, so we can observe /load resetting it

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

    runLine(ctx, 'use: entity.chest.open'); // diverge from the empty save
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

// A mirror that opens the shipped multi-field modal and a sage whose menu is
// the other shape one comes in, plus a `# test` that crosses both.
const MODAL_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  mirror
  sage

# flag greeted

# entity mirror
look in: open modal: character-creation

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

// A dialogue whose own effect raises a second modal underneath it, so the
// driver has two open at once and has to pick which it is asking about.
const STACKED_MODAL_MODULE = `
# location camp
x: 0, y: 0
starting
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
  open modal: character-creation
  -> Ask about the mirror.
`;

describe('a modal is driven by its published name and options', () => {
  it('publishes the open modal and the option it is waiting on', () => {
    const { ctx } = fixture(MODAL_MODULE);

    const opened = runLine(ctx, 'use: entity.mirror.look-in');
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['character-creation']);
    expect(opened.view?.modals[0].options.map((option) => option.key)).toEqual(['name', 'race']);
    expect(opened.view?.modals[0].options[0].values).toBeNull();

    const named = runLine(ctx, 'submit-modal: name=Rowan');
    expect(named.view?.modals[0].options.map((option) => option.key)).toEqual(['race']);
    expect(takes(named.view?.modals[0].options[0])).toEqual(['human', 'elf', 'dwarf', 'orc']);
  });

  it('answers a listed value by number and records the canonical submit-modal: line either way', () => {
    const { ctx, recorder } = fixture(MODAL_MODULE);

    const opened = runLine(ctx, 'talk: sage');
    expect(takes(opened.view?.modals[0].options[0])).toEqual(['0', '1']);

    // The second value, not the first: a driver that answered by position but
    // always handed back the head of the list would pass on `1` alone.
    const answered = runLine(ctx, '2');
    expect(answered.recorded).toEqual(['submit-modal: choice=1']);
    expect(answered.view?.modals).toEqual([]);
    expect(recorder.history).toEqual(['talk: sage', 'submit-modal: choice=1']);
  });

  it('asks for the top of the stack, not the bottom, when one modal sits over another', () => {
    const { ctx } = fixture(STACKED_MODAL_MODULE);

    const opened = runLine(ctx, 'talk: sage');
    expect(opened.view?.modals.map((modal) => modal.name)).toEqual(['character-creation', 'dialogue']);

    // The dialogue is on top, so its menu is what a number answers — the bottom
    // modal's first option is free text and takes no number at all.
    const answered = runLine(ctx, '1');
    expect(answered.recorded).toEqual(['submit-modal: choice=0']);
    expect(answered.view?.modals.map((modal) => modal.name)).toEqual(['character-creation']);
  });

  it('refuses a bare line while a modal is open instead of taking it as the field being asked for', () => {
    const { ctx, session, recorder } = fixture(MODAL_MODULE);

    runLine(ctx, 'use: entity.mirror.look-in');
    // The line the old prompt would have swallowed as the name.
    expect(errors(runLine(ctx, 'Rowan'))).toEqual(['invalid choice: "Rowan"']);
    expect(statusOf(runLine(ctx, '/state')).status.location.id).toBe('camp');

    const still = sessionStatus(session);
    expect(still.player).toEqual({ name: '', race: '' });
    expect(still.modals.map((modal) => modal.name)).toEqual(['character-creation']);
    expect(recorder.history).toEqual(['use: entity.mirror.look-in']);
  });

  it('never takes a line as a modal field: a command after a /test that crossed a modal is still a command', () => {
    const { ctx } = fixture(MODAL_MODULE);

    const replayed = runLine(ctx, '/test crosses-a-modal');
    expect(messages(replayed)[0].text).toBe(`Test 'crosses-a-modal' PASSED`);
    expect(replayed.view?.modals).toEqual([]);

    // The two lines that used to be eaten as the name and the race.
    expect(statusOf(runLine(ctx, '/state')).status.location.id).toBe('camp');
    expect(kinds(runLine(ctx, '/inventory'))).toEqual(['view']);
  });

  it('emits a replayable # test from a session that crossed a modal, with no hand-editing', () => {
    const { ctx } = fixture(MODAL_MODULE);

    runLine(ctx, 'use: entity.mirror.look-in');
    runLine(ctx, 'submit-modal: name=Rowan');
    const done = runLine(ctx, 'submit-modal: race=elf');
    expect(done.view?.player).toEqual({ name: 'Rowan', race: 'elf' });

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

// `oven.roast` repeats and never self-completes; `anvil.strike` completes after
// its single attempt. Both shapes a live run's loop has to end for.
const LIVE_MODULE = `
# location camp
x: 0, y: 0
starting
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

// One foe, one two-sided action, deterministic rolls: a run with a named pool
// to whittle down rather than a completion of its own.
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
  // Driven through the table, not around it: a live run is what the `<N>` entry
  // does when the driver says it can advance one.
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
    const progress = started.live!.tick(500); // 0.5s real * 2x = 1 sim-second
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

    // 25 ticks of 200ms at 1x = 5 simulated seconds, clearing the 4s cycle.
    let last = started.live!.tick(200);
    for (let i = 1; i < 25; i++) {
      last = started.live!.tick(200);
      expect(last.active).toBe(true); // repeating: never self-completes
    }
    expect(last.time).toBe(5);
    expect(last.view.inventory['roasted-chestnut']).toBe(1);
    expect(last.view.action).not.toBeNull();
  });

  it('reports active: false once a non-repeating spannable action completes on its own', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    expect(started.live).toBeDefined();

    expect(started.live!.tick(1000).active).toBe(true); // 1s of 3
    expect(started.live!.tick(1000).active).toBe(true); // 2s of 3

    const done = started.live!.tick(2000); // crosses the 3s completion boundary
    expect(done.active).toBe(false);
    expect(done.view.action).toBeNull();
    expect(done.view.inventory.ingot).toBe(1);
  });

  it('names the action a tick finishes from the tick before, since the view that ends it has none', () => {
    const { started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    started.live!.tick(2000);
    expect(started.live!.tick(2000)).toMatchObject({ active: false, label: 'strike' });
  });

  it('publishes progress and the run’s own countdown as numbers, with no target to narrate', () => {
    const TAPPING_MODULE = `
# stat tap
base: 0.2

# stat taps-per-minute
base: 60

# location camp
x: 0, y: 0
starting
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

    // Ten seconds already on the clock before the second run is armed, which is
    // the difference between the elapsed time and the reading.
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
    // Two ticks, because the first lands no blow: a run that has swung is where
    // an untargeted one would start counting, so it is the tick that discriminates.
    const progress = [started.live!.tick(900), started.live!.tick(900)];
    expect(progress[1].pools).toEqual([
      { title: 'Health', current: 30, max: 30 },
      { title: 'Rat', current: 6, max: 12 },
    ]);
    // A fight has a target to narrate, so the run's own countdown is absent
    // rather than merely outranked by the driver that prints one of the two.
    for (const each of progress) expect(each.implicit).toBeNull();
  });

  it('ends once, however it ends: a second end records nothing and a later tick moves nothing', () => {
    const { ctx, recorder, started } = liveFixture(LIVE_MODULE, 'use:entity.oven.roast');
    started.live!.tick(1000);

    const first = started.live!.end(true);
    const history = [...recorder.history];
    expect(history).toEqual(['begin: use entity.oven.roast', 'wait: 1', 'cancel']);

    // The driver owns a timer and a keypress and cannot make both arrive first.
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
    expect(again.label).toBe('strike');
  });

  it('names the action it is driving from its own last tick, not from state another command can move', () => {
    const { ctx, started } = liveFixture(LIVE_MODULE, 'use:entity.anvil.strike');
    started.live!.tick(1000);
    // A second driver can run a command mid-run, and `/load` is the one that
    // takes the in-flight action out of the view the context carries. The run
    // still knows what it was driving, because it kept its own record.
    runLine(ctx, '/load fresh');
    expect(ctx.view.action).toBeNull();
    expect(started.live!.tick(3000)).toMatchObject({ active: false, label: 'strike' });
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

  it('/create-test emits a # test prepended with load: <id>-start and a matching # save, and registers both', () => {
    const { ctx, session } = recorded();
    const result = runLine(ctx, '/create-test foo');

    expect(messages(result)[0].text).toBe(`Created test 'foo' (2 steps).`);
    expect(authoredBlocks(result)).toEqual([
      ['# save foo-start', `{"version":${SAVE_VERSION},"flags":{"camp.discovered":true,"ruins.discovered":true}}`],
      ['# test foo', 'load: foo-start', 'travel: ruins', 'wait: 1'],
    ]);
    expect(session.registry.tests.has('foo')).toBe(true);
    expect(session.registry.saves.has('foo-start')).toBe(true);
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

    // The correctness gate: paste the emitted blocks into a brand-new module,
    // sharing no state with the recording session, and replay them.
    const pasted = `${TRAVEL_MODULE}\n${blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
    expect(runTest('bar', loadInEnglish(pasted), createGameState()).passed).toBe(true);
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
    // What newContext hands a driver that keeps no recorder of its own: an
    // empty start save, which is not a save and is not JSON either.
    const session = startSession(loadInEnglish(TRAVEL_MODULE));
    const ctx = newContext(session, view(session));
    runLine(ctx, choiceIndex(ctx, 'travel:ruins'));

    for (const command of ['/create-test unsaved', '/create-valid-test unsaved']) {
      const result = runLine(ctx, command);
      expect(errors(result), command).toEqual(['no start save was taken when this session began']);
    }
    expect(session.registry.tests.has('unsaved')).toBe(false);
    expect(session.registry.saves.has('unsaved-start')).toBe(false);
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

const AUTHORING_MODULE = `
# info base
version: 1.0.0

# location camp
x: 0, y: 0
starting
entities:
  chest

# entity chest
title: Chest
open:
  say: Empty.

# item coin
title: Coin
`;

describe('local DSL authoring takes its file as an argument, never reaching for one', () => {
  function authoringFixture() {
    const baseSources: ModuleSource[] = [engineLocale(), { name: 'base', text: AUTHORING_MODULE }];
    const writes: string[] = [];
    const authoring: AuthoringContext = {
      baseSources,
      dependencies: ['base'],
      localSource: { name: 'local-changes', text: initialLocalChangesModule(['base']) },
      writeLocalChanges: (text) => writes.push(text),
    };
    return { ...fixture(AUTHORING_MODULE, authoring), authoring, writes };
  }

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
    expect(cleared.view?.said.some((line) => line.includes('Removed inventory local-changes.gem'))).toBe(true);
    expect(cleared.view?.inventory['local-changes.gem']).toBeUndefined();
  });

  it('/dsl can author every DSL section kind that local-changes is allowed to own', () => {
    const { ctx, session } = authoringFixture();
    const commands = [
      '/dsl stat vigor base: 10',
      '/dsl skill focus stat-id: local-changes.vigor',
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
    expect(registry.skills.get('local-changes.focus')?.['stat-id']).toBe('local-changes.vigor');
    expect(registry.items.get('local-changes.token')?.title).toBe('Token');
    expect(registry.entities.get('local-changes.npc')?.actions).toEqual([{ label: 'cheer', results: [{ kind: 'say', text: 'Hello.', key: 'local-changes.entity.npc.say.0' }] }]);
    expect(registry.locations.get('local-changes.grove')).toMatchObject({ x: 1, y: 0, entities: [{ entity: 'local-changes.npc' }] });
    expect(registry.flags.has('local-changes.levered')).toBe(true);
    expect(registry.variables.get('local-knob')?.value).toBe(2);
    expect(registry.resources.get('local-changes.stamina')?.max).toBe('local-changes.vigor');
    expect(registry.recipes.get('local-changes.smelt')).toMatchObject({ in: [{ item: 'local-changes.ore' }], out: [{ item: 'local-changes.ingot' }] });
    expect(registry.dialogues.get('local-changes.npc-chat')?.owner).toBe('local-changes.npc');
    expect(registry.saves.get('local-changes.blank')).toEqual({ version: SAVE_VERSION, diff: {} });
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
  });
});

// A clock a test moves by hand, and a timer a test fires by hand: the two are
// separate because the whole question here is what happens when they disagree.
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
    // The tab was backgrounded: one fire, four seconds of wall clock behind it.
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

// A recording is what a `# test` is authored from, so what it says has to be
// what happened: a growth the plane turned down records as the refusal, and
// the line replays green instead of asserting the opposite of the session.
describe('recording a growth the plane refused', () => {
  const GROWTH_MODULE = `
# location camp
x: 0, y: 0
starting

# stat max-health
base: 30

# passive hale
+10 max-health

# cluster-jewel node
shape: point
open-connections: e
passives: 1 hale

# item blade
title: Blade
slot: hand
origin-cluster: node
max-level: 2

# item whetstone
item-experience: 1000

# save stocked
{"version":${SAVE_VERSION},"inventory":{"blade":1,"whetstone":2}}
`;

  it('records the verb when it was done and the refusal when it was not', () => {
    const { ctx, recorder } = fixture(GROWTH_MODULE);
    runLine(ctx, '/load stocked');

    runLine(ctx, 'feed: blade with whetstone');
    const said = runLine(ctx, 'feed: 1 with whetstone');

    expect(recorder.history).toEqual(['load: stocked', 'feed: blade with whetstone', 'refuse: feed 1 with whetstone']);
    expect(said.view?.said).toContain('Blade is already at level 2, which is its maximum');
  });
});

// c4: whose words a message is. The universe is loaded twice — once as
// authored and once with every word it can address replaced, engine patterns
// included — and the same script is driven through both. A message that moved
// went through the localizer; a message that did not is the tool speaking its
// own language, which is the whole of what the type now says.
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
    // Raised inside the run rather than by the parser, which is the route
    // `refused()` owns.
    const answered = runLine(ctx, 'submit-modal: verb=grow');

    expect(spoken(answered, 'player')).toEqual([]);
    expect(spoken(answered, 'tool')).toEqual(['no modal is open to answer: verb']);
  });

  // The rule the four above are examples of, read off the table rather than
  // listed: every entry twice, bare and with an argument, through both
  // universes at once. Nobody edits this when a command is added.
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

    // A message with no word of its own has nothing a translation could move,
    // and none of these has one; the filter is what keeps that honest.
    const moved = asPlayed.filter((each, at) => each.text !== asAuthored[at].text);
    expect(asPlayed.filter((each) => each.words === 'player' && hasWords(each.text) && !moved.includes(each))).toEqual([]);
    expect(asPlayed.filter((each) => each.words === 'tool' && moved.includes(each))).toEqual([]);
    // And a run in which nothing moved would pass both lines above.
    expect(moved.length).toBeGreaterThan(0);
  });
});
