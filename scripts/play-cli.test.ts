import { RuntimeError } from '../src/runtime/error';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInEnglish, withEngineLocale } from '../src/content/engineLocale';
import { ENGINE_KEYS } from '../src/content/locale';
import { LOCAL_CHANGES_MODULE_ID, renderLocalChangesModule } from '../src/content/localChanges';
import { OPENING_CELLS } from '../src/runtime/openUniverseFixture';
import { loadUniverse } from '../src/content/load';
import { standingSources } from '../src/content/shipped';
import { FIXTURE_WORLD } from '../src/content/worldFixture';
import type { ModuleSource } from '../src/content/universe';
import { localizerFor } from '../src/runtime/localized';
import { asLocalized } from '../src/runtime/localizedFixture';
import { SAVE_VERSION } from '../src/runtime/save';
import { readRoom, serializeSession, sessionStatus, startSession, view } from '../src/runtime/session';
import { COMMANDS, NO_SAVES, NOT_LOADED, newContext, runLine, type CommandContext, type CommandResult, type Recorder, type Ticker } from '../src/runtime/command';
import { AUTOSAVE_SLOT, DEV_SLOT, DEV_SNAPSHOT_SLOT, PLAYER_SLOT, type SaveContext } from '../src/runtime/saveSlots';
import { driveRun, fileAuthoring, fileSaves, formatLive, formatOutput, formatResult, formatTick, loadModportalSources, openRepl, printed, type ReplLine } from './play-cli';

const localizer = localizerFor(loadInEnglish(''), 'en');

const asPrinted = (lines: readonly ReplLine[]): string[] => lines.map(printed);
const shown = (result: CommandResult): string[] => asPrinted(formatResult(result, localizer));
const drawn = (output: Parameters<typeof formatOutput>[0]): string[] => asPrinted(formatOutput(output, localizer));
const live = (progress: Parameters<typeof formatLive>[0]): string => printed(formatLive(progress, localizer));
const ticked = (progress: Parameters<typeof formatTick>[0]): string[] => asPrinted(formatTick(progress, localizer));

const TUTORIAL: readonly ModuleSource[] = standingSources();

const PLANE_SOURCE =
  FIXTURE_WORLD +
  `
# cluster-jewel core
shape: point
open-connections: e

# item blade
title: Blade
slot: mainhand
item-level: 1
origin-cluster: core

# item shield
title: Shield
slot: offhand
item-level: 1
origin-cluster: core

# save stocked
{"version":${SAVE_VERSION},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"core","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"shield","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"core","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save worn
{"version":${SAVE_VERSION},"equipped":{"offhand":"2"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"core","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"shield","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"core","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}
`;

function onPlaneScreen(save: string, item: string): string[] {
  const ctx = driver(PLANE_SOURCE);
  runLine(ctx, `/load ${save}`);
  runLine(ctx, `/inv ${item}`);
  return shown(runLine(ctx, '1'));
}

function driver(text: string | readonly ModuleSource[], speed = 1, driving = false): CommandContext {
  const session = startSession(typeof text === 'string' ? loadInEnglish(text) : loadUniverse(withEngineLocale(text)));
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  return newContext(session, view(session), { recorder, speed, driving });
}

// /look re-reads what the context is holding, so a room read behind its back is read again here.
// Reading one says what it reads, and those lines are drained so what comes next is the room.
function read(ctx: CommandContext): CommandContext {
  readRoom(ctx.session);
  view(ctx.session);
  ctx.view = view(ctx.session);
  return ctx;
}

function armed(ctx: CommandContext, choiceId: string) {
  const index = ctx.view.choices.findIndex((choice) => choice.id === choiceId) + 1;
  expect(index, choiceId).toBeGreaterThan(0);
  const result = runLine(ctx, String(index));
  expect(result.live, choiceId).toBeDefined();
  return result;
}

describe('play-cli renders what a command result says happened', () => {
  it('prints a view as narration, location, occupants, pools, modals, choices and the clock', () => {
    const lines = shown(runLine(read(driver(TUTORIAL)), '/look'));

    expect(lines[0]).toBe('Guide House (first-steps.guide-house)');
    expect(lines[1]).toBe(`A cluttered but cozy cottage. Miki's guide house.`);
    expect(lines[2]).toBe('Here: Miki, Front Door, Stairs, Mirror, Oven, Back Door');
    // A pool is drawn as its name, a bar and what it stands at over its ceiling. Nobody has been
    // hurt yet, so the bar is full and the two figures read alike — which is the shape of the line
    // rather than the figure the sheet of the day puts in it.
    expect(lines[3]).toMatch(/^Health: █{10} (\d+(?:\.\d+)?)\/\1$/);
    expect(lines).toContain('  1) [Presence] Miki: Talk');
    expect(lines).toContain('  2) [Presence] Miki: Examine');
    expect(lines[lines.length - 1]).toBe('[time: 0s]');
  });

  // The mask is written into the view, so a terminal draws it without being taught to: the room
  // arrives as a list of unknowns and the names come out of it one look at a time.
  it('names nothing here the player has not read, and every name once they have', () => {
    const ctx = driver(TUTORIAL);
    const unread = shown(runLine(ctx, '/look'))[2];

    expect(unread).toContain('?');
    expect(unread).not.toContain('Miki');

    expect(shown(runLine(read(ctx), '/look'))[2]).toBe('Here: Miki, Front Door, Stairs, Mirror, Oven, Back Door');
  });

  it('speaks the engine’s own words over a universe nobody named the locale to', () => {
    const opening = openRepl(TUTORIAL).opening.map(printed);

    expect(ENGINE_KEYS.filter((key) => opening.some((line) => line.includes(key)))).toEqual([]);
    expect(opening.length).toBeGreaterThan(5);
  });

  it('answers over content that will not load, rather than stranding on it', () => {
    let taken = 0;

    for (const cell of OPENING_CELLS) {
      const sources = cell.local === '' ? cell.base : [...cell.base, { name: LOCAL_CHANGES_MODULE_ID, text: cell.local }];
      const repl = openRepl(sources);

      expect(repl.opened.problems.length, cell.where).toBeGreaterThan(0);
      expect(shown(runLine(repl.context, '/look')).length, cell.where).toBeGreaterThan(0);
      taken += 1;
    }

    expect(taken).toBe(OPENING_CELLS.length);
  });

  it('prints a location description on first arrival and again only when /look asks', () => {
    const ctx = driver(TUTORIAL);
    const described = `A cluttered but cozy cottage. Miki's guide house.`;

    expect(shown(runLine(ctx, '/look'))).toContain(described);
    expect(shown(runLine(ctx, '/wait 1'))).not.toContain(described);
    expect(shown(runLine(ctx, '/look'))).toContain(described);
  });

  it('marks a match, a mismatch and a refusal with this driver’s own glyphs', () => {
    const ctx = driver(
      FIXTURE_WORLD +
        `
# save empty
{"version":${SAVE_VERSION},"flags":{"camp.discovered":true,"camp.touched":true}}
`,
    );
    expect(shown(runLine(ctx, '/assert time >= 0'))).toEqual(['✓ time >= 0 matches']);
    expect(shown(runLine(ctx, '/assert time < 0'))).toEqual(['⚠ time < 0']);
    expect(shown(runLine(ctx, '/expect empty'))).toEqual(['✓ empty matches']);
    expect(shown(runLine(ctx, '/bogus'))).toEqual(['✗ unknown command: /bogus']);
  });

  it('indents the diagnostics under the error that carries them', () => {
    const ctx = driver('# location camp\nx: 0, y: 0\nstarting\n');
    const failed = drawn({ kind: 'message', words: 'tool', tone: 'error', text: 'local changes did not load.', detail: ['first', 'second'] });
    expect(failed).toEqual(['✗ local changes did not load.', '  first', '  second']);
    expect(shown(runLine(ctx, '/state'))[0]).toBe('Location: camp');
  });

  it('prints the status readout /state and /quit both produce', () => {
    const ctx = driver(TUTORIAL);
    runLine(ctx, '/wait 7');
    const sheet = JSON.stringify(Object.fromEntries(sessionStatus(ctx.session).stats.map((row) => [`${row.title} (${row.id})`, row.value])));
    const state = shown(runLine(ctx, '/state'));
    // Every line the readout is made of, and no other. What the world holds beyond the one room
    // stood in here is its size rather than this readout's shape, so the line that counts it is
    // read for its form.
    expect(state).toHaveLength(9);
    expect(state.slice(0, 4)).toEqual([
      'Location: first-steps.guide-house',
      'Elapsed simulated time: 7s',
      'Flags: {"first-steps.guide-house.touched":true,"first-steps.guide-house.discovered":true}',
      'Inventory: {}',
    ]);
    // Under the name the world gives a thing as well as the id it is addressed by: an id-only
    // readout was the whole of what a player at this terminal ever saw of a skill or a stat. The
    // shape is the claim rather than the list, so a skill the player picks up next month is drawn
    // the same way with nothing edited here — and every skill they hold has to be on the line.
    expect(state[4]).toMatch(/^XP: \{("[^"]+ \([a-z][a-z0-9.-]*\)":\d+,?)+\}$/);
    for (const row of sessionStatus(ctx.session).xp) expect(state[4]).toContain(`(${row.id})":0`);
    expect(state.slice(5, 7)).toEqual([
      'Equipped: {"Head (head)":null,"Main Hand (mainhand)":null,"Body (body)":null,"Off Hand (offhand)":null,"Gloves (gloves)":null,"Legs (legs)":null}',
      `stats: ${sheet}`,
    ]);
    // The readout draws a pool the same way the room does: nobody has been hurt, so the bar is full
    // and the two figures read alike. What they come to is the sheet's business and not this one's.
    expect(state[7]).toMatch(/^Health: █{10} (\d+(?:\.\d+)?)\/\1$/);
    expect(state[8]).toMatch(/^discovered: 1 of \d+ found; not yet found: /);
    expect(state[8]).toContain('tulsa.market-square');
    expect(shown(runLine(ctx, '/quit'))[0]).toBe('Location: first-steps.guide-house');
  });

  // A road whose condition does not hold is still a road, and a map that drew it the same as an
  // open one would be telling an author they can walk somewhere they cannot. The corpus has no
  // shut road between two discovered places, so this branch is only reachable from a fixture.
  it('marks a road the map draws but the world will not let anyone walk', () => {
    const ctx = driver(
      FIXTURE_WORLD +
        `
# flag gate-open

# location camp
adjacent:
  vault while gate-open

# location vault
x: 1, y: 0

# save both-found
{"version":${SAVE_VERSION},"flags":{"camp.discovered":true,"vault.discovered":true}}
`,
    );
    runLine(ctx, '/load both-found');
    const drawn = shown(runLine(ctx, '/map')).join(' ');

    expect(drawn).toContain('a road that is shut');
    expect(drawn).not.toContain('─');
    expect(shown(runLine(ctx, '/state'))).toContain('discovered: 2 of 2 found');
  });

  it('names grown copies on a line of their own, above the stack counts’ neighbours', () => {
    const ctx = driver(TUTORIAL);
    const status = runLine(ctx, '/state').output.find((out) => out.kind === 'status')!.status;

    expect(drawn({ kind: 'status', status })).not.toContain('Grown: {}');
    expect(drawn({ kind: 'status', status: { ...status, grown: { '1': 'core.iron-sword' } } })).toContain(
      'Grown: {"1":"core.iron-sword"}',
    );
  });

  it('draws the inventory screen /inv opens and nothing beside it', () => {
    const ctx = driver(TUTORIAL);
    const lines = shown(runLine(ctx, '/inv'));

    expect(lines).toContain('[carried-items] item');
    expect(lines).toContain('Item:');
    expect(lines).toContain('  1) Close');
    expect(lines.some((line) => line.startsWith('Inventory:'))).toBe(false);
  });

  it('draws the plane a screen has in hand above the question it is asking', () => {
    const lines = onPlaneScreen('stocked', '1');

    expect(lines).toContain('[item-plane] plane');
    expect(lines).toContain('Modified Blade — level 1, 0 spent, 1 point left');
    expect(lines.indexOf('> 0,0  Core · point · origin · mods 0/2')).toBeGreaterThan(lines.indexOf('[item-plane] plane'));
    expect(lines.indexOf('Modified Blade at 0,0:')).toBeGreaterThan(lines.indexOf('> 0,0  Core · point · origin · mods 0/2'));
  });

  it('draws the plane the focus names rather than the first one published', () => {
    const lines = onPlaneScreen('stocked', '2');

    expect(lines).toContain('Modified Shield — level 1, 0 spent, 1 point left');
    expect(lines.some((line) => line.startsWith('Modified Blade —'))).toBe(false);
  });

  it('says the plane in hand is one the player is wearing', () => {
    expect(onPlaneScreen('worn', '2')).toContain('Modified Shield — worn — level 1, 0 spent, 1 point left');
  });

  it('draws no plane for a screen with none in hand', () => {
    const ctx = driver(PLANE_SOURCE);
    runLine(ctx, '/load stocked');

    expect(shown(runLine(ctx, '/inv'))).not.toContain('Modified Blade — level 1, 0 spent, 1 point left');
  });

  it('separates each authored block with a blank line, so the emission pastes into a module', () => {
    expect(drawn({ kind: 'authored', words: 'tool', blocks: [['# save foo-start', '{}'], ['# test foo', 'wait: 1']] })).toEqual([
      '',
      '# save foo-start',
      '{}',
      '',
      '# test foo',
      'wait: 1',
    ]);
  });

  it('lays the help out from the table alone, one line per entry, plus this driver’s own startup argv', () => {
    const ctx = driver(TUTORIAL);
    const lines = shown(runLine(ctx, '/help'));

    expect(lines[0]).toBe('Commands:');
    expect(lines).toContain('  <N>          choose option N');
    const wait = COMMANDS.find((spec) => spec.name === '/wait')!;
    expect(lines).toContain(`  ${wait.name} ${wait.argHint}${' '.repeat(4)}${wait.summary}`);
    expect(lines).toContain('  /quit, /q    show final state and exit');
    const dsl = COMMANDS.find((spec) => spec.name === '/dsl')!;
    expect(lines).toContain(`  ${dsl.name} ${dsl.argHint} ${dsl.summary}`);

    const startup = lines.filter((line) => line.includes('at startup'));
    expect(lines).toHaveLength(1 + COMMANDS.length + startup.length);
    for (const spec of COMMANDS) expect(lines.some((line) => line.trimStart().startsWith(spec.name)), spec.name).toBe(true);
  });
});

const LIVE_MODULE =
  FIXTURE_WORLD +
  `
# stat tap
base: 0.2

# stat taps-per-minute
base: 60

# location camp
entities:
  oven
  anvil
  bell
  kiln

# item roasted-chestnut

# item ingot

# entity oven
roast:
  continuous
  time: 4
  give: 1 roasted-chestnut

# entity anvil
strike:
  time: 3
  give: 1 ingot

# entity kiln
fire:
  time: 2
  on success:
    say: The kiln settles with a crack.

# entity bell
title: Bell
ring:
  continuous
  rate: taps-per-minute
  damage: tap
`;

describe('play-cli renders the live clock', () => {
  function liveLines(choiceId: string, ticks: number, elapsedMs: number, speed = 1): string[] {
    const started = armed(driver(LIVE_MODULE, speed, true), choiceId);
    const lines: string[] = [];
    for (let i = 0; i < ticks; i++) {
      const progress = started.live!.tick(elapsedMs);
      lines.push(live(progress));
      if (!progress.active) break;
    }
    return lines;
  }

  it('draws the bar and the clock from the numbers the tick publishes', () => {
    expect(liveLines('use:entity.anvil.strike', 5, 700)).toEqual([
      'Strike... [#####---------------]  [time: 0.7s]',
      'Strike... [#########-----------]  [time: 1.4s]',
      'Strike... [##############------]  [time: 2.1s]',
      'Strike... [###################-]  [time: 2.8s]',
      'Strike: done.  [time: 3.5s]',
    ]);
  });

  it('counts an untargeted action’s swings down to its completion instead of a foe’s pool, and fills the bar as it goes', () => {
    expect(liveLines('use:entity.bell.ring', 4, 1000)).toEqual([
      'Ring... [####----------------] hits:1 completion:0.8  [time: 1.0s]',
      'Ring... [########------------] hits:2 completion:0.6  [time: 2.0s]',
      'Ring... [############--------] hits:3 completion:0.4  [time: 3.0s]',
      'Ring... [################----] hits:4 completion:0.2  [time: 4.0s]',
    ]);
  });

  it('prints what the world said as a tick passed, above the bar and not over it', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');

    const before = ticked(started.live!.tick(1000));
    const landing = ticked(started.live!.tick(1000));

    expect(before).toEqual(['Fire... [##########----------]  [time: 1.0s]']);
    expect(landing).toEqual(['The kiln settles with a crack.', 'Fire: done.  [time: 2.0s]']);
  });

  it('leaves nothing for the closing result to print, which is why the tick must', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');
    started.live!.tick(2000);

    const closing = shown(started.live!.end(false));

    expect(closing).not.toContain('The kiln settles with a crack.');
  });

  it('reports no output at all when it arms, so the arming view is the only place a say is', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');

    expect(started.output).toEqual([]);
    expect(shown(started)).toEqual([]);
  });

  it('scales elapsed real time by the speed dial before it draws anything', () => {
    expect(liveLines('use:entity.oven.roast', 2, 1000, 4)).toEqual([
      'Roast... [--------------------]  [time: 4.0s]',
      'Roast... [--------------------]  [time: 8.0s]',
    ]);
  });

  it('narrates the pools of a fight in place of the completion countdown, and says the one rat still standing', () => {
    const ctx = driver(`
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
`, 1, true);
    const started = armed(ctx, 'fight:swing:rat');
    expect(live(started.live!.tick(900))).toBe('Swing... [##################--] Health 30/30 Rat 12/12  ×1  [time: 0.9s]');
    expect(live(started.live!.tick(900))).toBe('Swing... [################----] Health 30/30 Rat 6/12  ×1  [time: 1.8s]');
  });

  it('prefers the pools to the countdown when a run has both, so a fight is never narrated as a tally', () => {
    const both = {
      label: asLocalized('Ring'),
      active: true,
      time: 2,
      progress: 0.5,
      pools: [{ title: asLocalized('Health'), current: 21, max: 30, remaining: null }],
      implicit: { attempts: 3, completion: 0.4 },
      view: undefined as never,
    };
    expect(live(both)).toBe('Ring... [##########----------] Health 21/30  [time: 2.0s]');
    expect(live({ ...both, pools: [] })).toBe('Ring... [##########----------] hits:3 completion:0.4  [time: 2.0s]');
  });

  it('prints the stop and the world it left when a run is cancelled', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.oven.roast');
    expect(shown(started)).toEqual([]);

    started.live!.tick(1000);
    const lines = shown(started.live!.end(true));
    expect(lines[0]).toBe('Stopped.');
    expect(lines[lines.length - 1]).toBe('[time: 1s]');
  });
});

describe('play-cli modportal cache loading', () => {
  it('loads synced approved mods with their manifest enablement', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(path.join(dir, '1-approved-mod-1.dsl'), '# info approved-mod-1\nversion: 0.0.0\n', 'utf8');
      writeFileSync(path.join(dir, '2-approved-mod-2.dsl'), '# info approved-mod-2\nversion: 0.0.0\n', 'utf8');
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          version: 2,
          entries: [
            { issue: 1, title: 'One', tier: 'auto-enabled', moduleId: 'approved-mod-1', file: '1-approved-mod-1.dsl', enabled: true },
            { issue: 2, title: 'Two', tier: 'approved', moduleId: 'approved-mod-2', file: '2-approved-mod-2.dsl', enabled: false },
          ],
        }),
        'utf8',
      );

      const loaded = loadModportalSources(dir);

      expect(loaded.warnings).toEqual([]);
      expect(loaded.sources.map((source) => ({ name: source.name, enabled: source.enabled }))).toEqual([
        { name: 'approved-mod-1', enabled: true },
        { name: 'approved-mod-2', enabled: false },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns instead of crashing on a manifest a truncated write left unreadable', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(path.join(dir, 'manifest.json'), '{"version": 1, "entries": [{"issue": 1,', 'utf8');
      expect(loadModportalSources(dir).sources).toEqual([]);
      expect(loadModportalSources(dir).warnings[0]).toMatch(/^Modportal ignored manifest\.json:/);

      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 2 }), 'utf8');
      expect(loadModportalSources(dir).warnings).toEqual(['Modportal ignored manifest.json: it holds no entries array']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns instead of reading manifest files outside the cache directory', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-modportal-'));
    try {
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ version: 2, entries: [{ issue: 1, title: 'One', tier: 'approved', moduleId: 'approved-mod-1', file: '../outside.dsl', enabled: true }] }),
        'utf8',
      );

      const loaded = loadModportalSources(dir);

      expect(loaded.sources).toEqual([]);
      expect(loaded.warnings).toEqual(['Modportal skipped approved-mod-1: file escapes cache directory']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const RELOAD_BASE = ['# info base', 'version: 1.0.0', '', '# location camp', 'x: 0, y: 0', 'starting'].join('\n');
const TOWER_SECTION = ['# location tower', 'title: Tower', 'x: 1, y: 0'].join('\n');
const ROAD_SECTION = ['# location base.camp', 'adjacent:', '  tower'].join('\n');

describe('play-cli reaches its local module through the file rather than a remembered copy', () => {
  function inTempDir(body: (localFile: string) => void): void {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'play-cli-local-'));
    try {
      body(path.join(dir, 'local-changes.dsl'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function opened(localFile: string) {
    const baseSources = withEngineLocale([{ name: 'base', text: RELOAD_BASE } as ModuleSource]);
    const authoring = fileAuthoring(() => baseSources, localFile);
    const repl = openRepl(baseSources, { authoring });
    return { ctx: repl.context, authoring };
  }

  it('picks up a location another process wrote into the file, in the session already running', () => {
    inTempDir((localFile) => {
      const { ctx } = opened(localFile);
      expect(ctx.session.registry.locations.has('local-changes.tower')).toBe(false);

      writeFileSync(localFile, renderLocalChangesModule(['base'], [TOWER_SECTION, ROAD_SECTION]), 'utf8');

      expect(shown(runLine(ctx, '/reload'))).toContain('Reloaded local-changes.');
      expect(ctx.session.registry.locations.get('local-changes.tower')?.title).toBe('Tower');
      expect(ctx.view.choices.map((choice) => choice.id)).toContain('travel:local-changes.tower');
    });
  });

  it('writes and re-reads the same file, so a staged section survives a reload', () => {
    inTempDir((localFile) => {
      const { ctx } = opened(localFile);
      runLine(ctx, '/dsl item local-changes.gem title: Gem');
      expect(readFileSync(localFile, 'utf8')).toContain('# item local-changes.gem');

      expect(shown(runLine(ctx, '/reload'))).toContain('Reloaded local-changes.');
      expect(ctx.session.registry.items.get('local-changes.gem')?.title).toBe('Gem');
    });
  });

  it('stages a section into the file another process wrote, keeping both', () => {
    inTempDir((localFile) => {
      const { ctx } = opened(localFile);
      writeFileSync(localFile, renderLocalChangesModule(['base'], [TOWER_SECTION]), 'utf8');

      expect(shown(runLine(ctx, '/dsl item local-changes.gem title: Gem'))).toContain('Staged # item local-changes.gem in local-changes.');

      const onDisk = readFileSync(localFile, 'utf8');
      expect(onDisk).toContain('# location tower');
      expect(onDisk).toContain('# item local-changes.gem');
      expect(ctx.session.registry.locations.get('local-changes.tower')?.title).toBe('Tower');
    });
  });

  it('refuses the whole of an edit the file cannot load, and goes on playing', () => {
    inTempDir((localFile) => {
      const { ctx } = opened(localFile);
      const before = ctx.session.registry.locations.size;
      writeFileSync(localFile, renderLocalChangesModule(['base'], [TOWER_SECTION, '# item gem\ngrows-into: nothing.at.all']), 'utf8');

      const lines = shown(runLine(ctx, '/reload'));
      expect(lines[0]).toBe(`✗ ${NOT_LOADED}`);
      expect(lines.some((line) => line.includes('nothing.at.all'))).toBe(true);
      expect(ctx.session.registry.locations.size).toBe(before);
      expect(shown(runLine(ctx, '/look')).length).toBeGreaterThan(0);
    });
  });
});

describe('play-cli drives a live run', () => {
  function handTicker(): Ticker & { advance(elapsedMs: number): void; stops: number } {
    let ticking: ((elapsedMs: number) => void) | null = null;
    const ticker = ((tick) => {
      ticking = tick;
      return () => void (ticker.stops += 1);
    }) as Ticker & { advance(elapsedMs: number): void; stops: number };
    ticker.stops = 0;
    ticker.advance = (elapsedMs) => ticking?.(elapsedMs);
    return ticker;
  }

  function driven(choiceId: string) {
    const ctx = driver(LIVE_MODULE, 1, true);
    const ticker = handTicker();
    const written: string[] = [];
    const closed: CommandResult[] = [];
    const stop = driveRun(armed(ctx, choiceId).live!, localizer, (text) => void written.push(text), (result) => void closed.push(result), ticker);
    return { ctx, ticker, written, closed, stop };
  }

  it('advances the run by the elapsed span the ticker hands it, and writes what the tick said', () => {
    const run = driven('use:entity.kiln.fire');

    run.ticker.advance(1000);

    expect(run.ctx.view.time).toBe(1);
    expect(run.written).toEqual([`\r\x1b[KFire... [##########----------]  [time: 1.0s]`]);
    expect(run.closed).toEqual([]);
  });

  it('ends itself when the run completes, and stops the ticker it started', () => {
    const run = driven('use:entity.kiln.fire');

    run.ticker.advance(2000);

    expect(run.ticker.stops).toBe(1);
    expect(run.closed).toHaveLength(1);
    expect(run.written[0]).toContain('The kiln settles with a crack.');
  });

  it('ends once however it ends, so a keypress landing on the closing tick cannot end it twice', () => {
    const run = driven('use:entity.kiln.fire');
    run.ticker.advance(2000);

    run.stop(true);

    expect(run.closed).toHaveLength(1);
    expect(shown(run.closed[0])).not.toContain('Stopped.');
  });

  it('stops the run and the ticker when the player cancels first', () => {
    const run = driven('use:entity.oven.roast');
    run.ticker.advance(1000);

    run.stop(true);

    expect(run.ticker.stops).toBe(1);
    expect(shown(run.closed[0])).toContain('Stopped.');
    expect(run.ctx.view.time).toBe(1);
  });
});

const SAVING_SOURCE =
  FIXTURE_WORLD +
  `
# location camp
entities:
  chest

# item gold
title: Gold

# entity chest
title: Chest
open:
  give: 1 gold
haul:
  continuous
  time: 4
  give: 2 gold

# save stashed
{"version":${SAVE_VERSION},"inventory":{"gold":7},"time":42000}

# save stranger
{"version":${SAVE_VERSION},"inventory":{"gold":5},"flags":{"camp.discovered":true}}

# test replay
load: stranger
`;

const EXPORT_SOURCE =
  `
# info exported
version: 0.0.0
` + FIXTURE_WORLD;

interface Playing {
  ctx: CommandContext;
  dir: string;
  save: SaveContext;
  pass: (ms: number) => void;
  restarted: () => SaveContext;
  reopened: () => CommandContext;
  slot: (name: string) => string | null;
  write: (name: string, payload: string) => void;
}

function playing(text: string = SAVING_SOURCE, driving = false): Playing {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-saves-'));
  let at = 1_000_000;
  const now = (): number => at;
  const save = fileSaves(dir, now);
  const session = startSession(loadInEnglish(text));
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  return {
    ctx: newContext(session, view(session), { recorder, save, driving }),
    dir,
    save,
    pass: (ms) => void (at += ms),
    restarted: () => fileSaves(dir, now),
    reopened: () => {
      const reopenedSession = startSession(loadInEnglish(text));
      return newContext(reopenedSession, view(reopenedSession), { recorder: { history: [], startSave: serializeSession(reopenedSession) }, save: fileSaves(dir, now), driving });
    },
    slot: (name) => {
      const file = path.join(dir, `${name}.slot`);
      if (!existsSync(file)) return null;
      const text = readFileSync(file, 'utf8');
      try {
        return (JSON.parse(text) as { payload: string }).payload;
      } catch {
        return text;
      }
    },
    write: (name, payload) => save.store.write(name, payload),
  };
}

const errorsOf = (result: CommandResult): string[] =>
  result.output.flatMap((each) => (each.kind === 'message' && each.tone === 'error' ? [[each.text, ...(each.detail ?? [])].join(' ')] : []));

const linesOf = (result: CommandResult): string[] => result.output.flatMap((each) => (each.kind === 'source' ? each.lines : []));

describe('export and import use the spelling the DSL already has (c6)', () => {
  it('prints the bytes serializeSession returns and nothing else', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');

    expect(linesOf(runLine(game.ctx, '/export'))).toEqual([serializeSession(game.ctx.session)]);
  });

  it('pastes into /dsl save <id> unchanged, and comes back through /load', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-export-'));
    try {
      const sources: ModuleSource[] = withEngineLocale([{ name: 'exported', text: EXPORT_SOURCE }]);
      const authoring = fileAuthoring(() => sources, path.join(dir, 'local-changes.dsl'));
      const repl = openRepl(sources, { authoring });
      runLine(repl.context, '/wait 5');
      const exported = linesOf(runLine(repl.context, '/export'))[0];

      expect(errorsOf(runLine(repl.context, `/dsl save local-changes.carried ${exported}`))).toEqual([]);
      runLine(repl.context, '/wait 9');
      expect(sessionStatus(repl.context.session).time).toBe(14);

      expect(errorsOf(runLine(repl.context, '/load local-changes.carried'))).toEqual([]);
      expect(sessionStatus(repl.context.session).time).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes its own output back through /import, to the same bytes', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');
    const exported = linesOf(runLine(game.ctx, '/export'))[0];

    runLine(game.ctx, 'use: entity.chest.open');
    expect(serializeSession(game.ctx.session)).not.toBe(exported);

    expect(errorsOf(runLine(game.ctx, `/import ${exported}`))).toEqual([]);
    expect(serializeSession(game.ctx.session)).toBe(exported);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

describe('a save that will not load changes nothing and says why (c7)', () => {
  const REFUSED = [
    ['not a payload at all', /not a # save body/],
    ['[1,2,3]', /not a # save body/],
    [`{"version":${SAVE_VERSION + 900}}`, /version/],
    [`{"version":${SAVE_VERSION},"time":"potato"}`, /save field time/],
    [`{"version":${SAVE_VERSION},"activeAction":{}}`, /save field activeAction/],
    [`{"version":${SAVE_VERSION},"activeAction":{"ownerRef":"entity.chest","actionSlug":"open","repeating":false,"implicitTarget":0,"cadences":{"player":{"progress":0,"attemptsMade":0}},"roster":{"player":3}}}`, /save field activeAction/],
    [`{"version":${SAVE_VERSION},"journey":{"to":"camp"}}`, /save field journey/],
    [`{"version":${SAVE_VERSION},"player":{}}`, /save field player/],
  ] as const;

  for (const [payload, why] of REFUSED) {
    it(`leaves the session standing after ${payload.slice(0, 40)}`, () => {
      const game = playing();
      runLine(game.ctx, 'use: entity.chest.open');
      runLine(game.ctx, '/wait 5');
      const before = serializeSession(game.ctx.session);

      const result = runLine(game.ctx, `/import ${payload}`);

      expect(errorsOf(result)).toHaveLength(1);
      expect(errorsOf(result)[0]).toMatch(why);
      expect(serializeSession(game.ctx.session)).toBe(before);
      expect(sessionStatus(game.ctx.session).time).toBe(5);
      rmSync(game.dir, { recursive: true, force: true });
    });
  }

  it('leaves the session standing when a payload gets past the checks and raises below them', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/wait 5');
    const before = serializeSession(game.ctx.session);

    const locations = game.ctx.session.registry.locations;
    const asking = locations.has.bind(locations);
    locations.has = (id: string) => {
      throw new RuntimeError(`pruning ${id} raised`);
    };
    const result = runLine(game.ctx, `/import {"version":${SAVE_VERSION},"time":9000,"inventory":{"gold":99}}`);
    locations.has = asking;

    expect(errorsOf(result)[0]).toMatch(/pruning camp raised/);
    expect(serializeSession(game.ctx.session)).toBe(before);
    expect(sessionStatus(game.ctx.session).time).toBe(5);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(1);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('says so when the live slot is absent, empty or unreadable, and plays on', () => {
    const game = playing();
    runLine(game.ctx, '/autosave never');
    runLine(game.ctx, 'use: entity.chest.open');
    const before = serializeSession(game.ctx.session);

    expect(errorsOf(runLine(game.ctx, '/restore'))[0]).toMatch(/slot player holds nothing/);

    writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), '', 'utf8');
    expect(errorsOf(runLine(game.ctx, '/restore'))[0]).toMatch(/slot player is empty/);

    writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), '{{{ truncated', 'utf8');
    expect(errorsOf(runLine(game.ctx, '/restore'))[0]).toMatch(/slot player does not parse/);

    runLine(game.ctx, '/save');
    writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), JSON.stringify({ writtenAt: 1, payload: 'rubbish' }), 'utf8');
    expect(errorsOf(runLine(game.ctx, '/restore'))[0]).toMatch(/not a # save body/);

    expect(serializeSession(game.ctx.session)).toBe(before);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('leaves the session standing when a payload loads but cannot be drawn', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');
    const before = serializeSession(game.ctx.session);

    const entities = game.ctx.session.registry.entities;
    const asking = entities.get.bind(entities);
    entities.get = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'indexOf')");
    };
    const result = runLine(game.ctx, `/import {"version":${SAVE_VERSION},"time":9000}`);
    entities.get = asking;

    expect(errorsOf(result)[0]).toMatch(/this save loads but cannot be played/);
    expect(serializeSession(game.ctx.session)).toBe(before);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(1);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('refuses every slot command with one sentence when there is nowhere to keep slots', () => {
    const ctx = driver(SAVING_SOURCE);

    for (const line of ['/save', '/restore', '/slots', '/autosave 5', '/dev on']) {
      expect(errorsOf(runLine(ctx, line)), line).toEqual([NO_SAVES]);
    }
  });
});

describe('autosave writes after every act, and never is a word of its own (c4)', () => {
  it('writes after every act with nobody having asked for anything, and stops on the word', () => {
    const game = playing();

    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));

    runLine(game.ctx, '/autosave never');
    const stopped = game.slot(PLAYER_SLOT);
    for (let each = 0; each < 5; each += 1) {
      runLine(game.ctx, 'use: entity.chest.open');
      game.pass(60_000);
    }

    expect(game.slot(PLAYER_SLOT)).toBe(stopped);
    expect(game.slot(PLAYER_SLOT)).not.toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('takes seconds or the word, and says which when it is given neither', () => {
    const game = playing();

    expect(errorsOf(runLine(game.ctx, '/autosave'))[0]).toMatch(/\/autosave requires seconds or never, got ""/);
    expect(errorsOf(runLine(game.ctx, '/autosave sideways'))[0]).toMatch(/got "sideways"/);
    expect(errorsOf(runLine(game.ctx, '/autosave -1'))[0]).toMatch(/got "-1"/);

    expect(errorsOf(runLine(game.ctx, '/autosave 0'))).toEqual([]);
    expect(linesOf(runLine(game.ctx, '/slots'))[1]).toBe('autosave after every action');
    expect(errorsOf(runLine(game.ctx, '/autosave never'))).toEqual([]);
    expect(linesOf(runLine(game.ctx, '/slots'))[1]).toBe('autosave never');
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('measures real seconds since the slot was written, and is checked after a command that changed state', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 30');
    expect(game.slot(AUTOSAVE_SLOT)).toBe('30');

    runLine(game.ctx, 'use: entity.chest.open');
    const first = game.slot(PLAYER_SLOT);
    expect(first).toBe(serializeSession(game.ctx.session));

    game.pass(29_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(first);

    game.pass(1_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).not.toBe(first);
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('is not checked after a command that changed nothing', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, 'use: entity.chest.open');
    const first = game.slot(PLAYER_SLOT);

    game.pass(60_000);
    for (const line of ['/look', '/state', '/help', '/slots', '/export']) runLine(game.ctx, line);

    expect(game.slot(PLAYER_SLOT)).toBe(first);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('is checked on each live tick, so a long run does not go unsaved until it ends', () => {
    const game = playing(SAVING_SOURCE, true);
    runLine(game.ctx, '/autosave 2');
    const result = armed(game.ctx, 'use:entity.chest.haul');

    const atArming = game.slot(PLAYER_SLOT);
    expect(atArming).not.toBeNull();

    game.pass(1_000);
    result.live!.tick(1_000);
    expect(game.slot(PLAYER_SLOT)).toBe(atArming);

    game.pass(1_000);
    result.live!.tick(1_000);
    const midRun = game.slot(PLAYER_SLOT);
    expect(midRun).not.toBe(atArming);
    expect(result.live!.tick(0).active).toBe(true);
    expect(midRun).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('says what it could not do at the end of a live run, rather than swallowing it for the whole of one', () => {
    const game = playing(SAVING_SOURCE, true);
    runLine(game.ctx, '/autosave 2');
    const result = armed(game.ctx, 'use:entity.chest.haul');
    (game.save.store as { write: (name: string, payload: string) => unknown }).write = (name) => {
      throw new RuntimeError(`slot ${name} cannot be written`);
    };

    for (let tick = 0; tick < 3; tick += 1) {
      game.pass(1_000);
      result.live!.tick(1_000);
    }

    expect(errorsOf(result.live!.end(true))[0]).toMatch(/autosave: slot player cannot be written/);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('stops autosaving and says so only when asked, when the cadence slot holds something that is not one', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 5');
    runLine(game.ctx, 'use: entity.chest.open');
    const written = game.slot(PLAYER_SLOT);
    writeFileSync(path.join(game.dir, `${AUTOSAVE_SLOT}.slot`), JSON.stringify({ writtenAt: 1, payload: 'often' }), 'utf8');
    game.pass(60_000);

    const result = runLine(game.ctx, 'use: entity.chest.open');
    expect(errorsOf(result)).toEqual([]);
    expect(game.slot(PLAYER_SLOT)).toBe(written);
    expect(linesOf(runLine(game.ctx, '/slots'))[1]).toMatch(/the slot the cadence lives in does not hold one/);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(2);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

describe('no load path advances time (c5)', () => {
  it('leaves the clock at what the payload holds, through a # save, an import and a slot', () => {
    const game = playing();
    runLine(game.ctx, '/autosave never');

    runLine(game.ctx, '/load stashed');
    expect(sessionStatus(game.ctx.session).time).toBe(42);

    runLine(game.ctx, '/wait 8');
    runLine(game.ctx, `/import {"version":${SAVE_VERSION},"time":9000}`);
    expect(sessionStatus(game.ctx.session).time).toBe(9);

    runLine(game.ctx, '/save');
    runLine(game.ctx, '/wait 100');
    game.pass(600_000);
    runLine(game.ctx, '/restore');
    expect(sessionStatus(game.ctx.session).time).toBe(9);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

describe('dev mode moves which slot is written, through the same table (c9, c10, c11, c12, c13)', () => {
  it('snapshots the session on the way in and leaves the player slot byte-identical throughout', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT)!;
    const before = serializeSession(game.ctx.session);

    runLine(game.ctx, '/dev on');
    expect(game.slot(DEV_SNAPSHOT_SLOT)).toBe(JSON.stringify({ payload: before, synced: PLAYER_SLOT }));

    runLine(game.ctx, '/autosave 1');
    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');

    expect(game.slot(DEV_SLOT)).toBe(serializeSession(game.ctx.session));
    expect(game.slot(DEV_SLOT)).not.toBe(played);
    expect(game.slot(PLAYER_SLOT)).toBe(played);

    const authored = game.slot(DEV_SLOT);
    runLine(game.ctx, '/dev off');
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    expect(serializeSession(game.ctx.session)).toBe(before);
    expect(game.slot(DEV_SNAPSHOT_SLOT)).toBeNull();
    expect(game.slot(DEV_SLOT)).toBe(authored);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('loses nothing when the process dies in dev, without an orderly exit', () => {
    const game = playing();
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT)!;
    const before = serializeSession(game.ctx.session);

    runLine(game.ctx, '/dev on');
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    const restarted = game.restarted();

    expect(restarted.dev).toBe(false);
    expect(restarted.store.read(PLAYER_SLOT)?.payload).toBe(played);
    expect(restarted.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe(JSON.stringify({ payload: before, synced: PLAYER_SLOT }));
    expect(restarted.synced).toBeNull();
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('creates no dev slot while the mode is off (c12)', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    for (const line of ['use: entity.chest.open', '/save', '/wait 3', '/restore', '/export']) {
      game.pass(5_000);
      runLine(game.ctx, line);
    }

    expect(readdirSync(game.dir).sort()).toEqual([`${AUTOSAVE_SLOT}.slot`, `${PLAYER_SLOT}.slot`]);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('answers which slot is live and whether the mode is on, rather than leaving it to be inferred (c13)', () => {
    const game = playing();

    expect(linesOf(runLine(game.ctx, '/slots'))).toEqual(['writing player, dev mode off', 'autosave after every action']);

    runLine(game.ctx, '/autosave 30');
    runLine(game.ctx, '/dev on');
    const lines = linesOf(runLine(game.ctx, '/slots'));

    expect(lines[0]).toBe('writing dev, dev mode on');
    expect(lines[1]).toBe('autosave every 30s');
    expect(lines.slice(2).map((line) => line.split(' ')[0])).toEqual([AUTOSAVE_SLOT, DEV_SNAPSHOT_SLOT]);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('refuses on and off in the wrong order, and says which', () => {
    const game = playing();

    expect(errorsOf(runLine(game.ctx, '/dev off'))[0]).toMatch(/not in dev mode/);
    runLine(game.ctx, '/dev on');
    expect(errorsOf(runLine(game.ctx, '/dev on'))[0]).toMatch(/already in dev mode/);
    expect(errorsOf(runLine(game.ctx, '/dev sideways'))[0]).toMatch(/on or off/);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

describe('a session writes back only what it came out of (c4, c7, c9)', () => {
  it('does not let a reopened game overwrite the save it never read', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 30');
    for (let each = 0; each < 3; each += 1) {
      runLine(game.ctx, 'use: entity.chest.open');
      game.pass(30_000);
    }
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT);
    expect(played).toBe(serializeSession(game.ctx.session));

    const next = game.reopened();
    game.pass(3_600_000);
    const first = runLine(next, 'use: entity.chest.open');

    expect(game.slot(PLAYER_SLOT)).toBe(played);
    expect(first.output.some((each) => each.kind === 'message' && each.tone === 'warn')).toBe(false);
    expect(linesOf(runLine(next, '/slots'))[0]).toMatch(/writing player, dev mode off — this session did not come out of that slot/);

    expect(errorsOf(runLine(next, '/restore'))).toEqual([]);
    expect(sessionStatus(next.session).inventory.gold).toBe(3);
    game.pass(30_000);
    runLine(next, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(next.session));
    expect(sessionStatus(next.session).inventory.gold).toBe(4);
    rmSync(game.dir, { recursive: true, force: true });
  });

  for (const [how, line, gold] of [
    ['/import', `/import {"version":${SAVE_VERSION},"inventory":{"gold":999},"flags":{"camp.discovered":true}}`, 999],
    ['load:', '/load stashed', 7],
  ] as const) {
    it(`is no slot's game after ${how} brings in a payload that came from no slot`, () => {
      const game = playing();
      runLine(game.ctx, '/autosave 30');
      for (let each = 0; each < 3; each += 1) {
        runLine(game.ctx, 'use: entity.chest.open');
        game.pass(30_000);
      }
      runLine(game.ctx, '/save');
      const played = game.slot(PLAYER_SLOT)!;
      expect(sessionStatus(game.ctx.session).inventory.gold).toBe(3);

      expect(errorsOf(runLine(game.ctx, line))).toEqual([]);
      expect(sessionStatus(game.ctx.session).inventory.gold).toBe(gold);

      game.pass(3_600_000);
      const after = runLine(game.ctx, 'use: entity.chest.open');
      expect(game.slot(PLAYER_SLOT)).toBe(played);
      expect(after.output.some((each) => each.kind === 'message' && each.tone === 'warn')).toBe(false);
      expect(linesOf(runLine(game.ctx, '/slots'))[0]).toMatch(/writing player, dev mode off — this session did not come out of that slot/);

      runLine(game.ctx, '/save');
      expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
      rmSync(game.dir, { recursive: true, force: true });
    });
  }

  it('takes the slot when /save says so, over a session that came from somewhere else', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 30');
    runLine(game.ctx, 'use: entity.chest.open');

    const next = game.reopened();
    game.pass(3_600_000);
    runLine(next, '/save');
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(next.session));

    game.pass(30_000);
    runLine(next, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(next.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('puts the session back with the slot on the way out of dev, so nothing done in dev survives it', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, 'use: entity.chest.open');
    const played = game.slot(PLAYER_SLOT);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(1);

    runLine(game.ctx, '/dev on');
    for (let each = 0; each < 10; each += 1) {
      game.pass(2_000);
      runLine(game.ctx, 'use: entity.chest.open');
    }
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(11);
    expect(game.slot(PLAYER_SLOT)).toBe(played);

    expect(errorsOf(runLine(game.ctx, '/dev off'))).toEqual([]);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(1);
    expect(game.slot(PLAYER_SLOT)).toBe(played);

    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(2);
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('puts the session back to before dev even when there was never a player slot', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, '/dev on');
    for (let each = 0; each < 5; each += 1) {
      game.pass(2_000);
      runLine(game.ctx, 'use: entity.chest.open');
    }
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(5);
    expect(game.slot(PLAYER_SLOT)).toBeNull();

    const left = runLine(game.ctx, '/dev off');
    expect(errorsOf(left)).toEqual([]);
    expect(sessionStatus(game.ctx.session).inventory.gold ?? 0).toBe(0);

    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(1);
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('leaves dev with the session where it is when the snapshot will not load', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT);

    runLine(game.ctx, '/dev on');
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    const authored = game.slot(DEV_SLOT);
    game.write(DEV_SNAPSHOT_SLOT, JSON.stringify({ payload: `{"version":${SAVE_VERSION + 900}}`, synced: PLAYER_SLOT }));

    const left = runLine(game.ctx, '/dev off');
    expect(errorsOf(left)[0]).toMatch(/version/);
    expect(linesOf(runLine(game.ctx, '/slots'))[0]).toMatch(/^writing player, dev mode off —/);
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    expect(game.slot(DEV_SLOT)).toBe(authored);

    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    expect(game.slot(DEV_SLOT)).toBe(authored);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('picks the dev slot back up on a second visit, so authoring carries on where it stopped', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT);

    runLine(game.ctx, '/dev on');
    for (let each = 0; each < 4; each += 1) {
      game.pass(2_000);
      runLine(game.ctx, 'use: entity.chest.open');
    }
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(4);
    runLine(game.ctx, '/dev off');
    expect(sessionStatus(game.ctx.session).inventory.gold ?? 0).toBe(0);
    const authored = game.slot(DEV_SLOT);

    expect(errorsOf(runLine(game.ctx, '/dev on'))).toEqual([]);
    expect(sessionStatus(game.ctx.session).inventory.gold).toBe(4);
    game.pass(2_000);
    const carried = runLine(game.ctx, 'use: entity.chest.open');
    expect(carried.output.some((each) => each.kind === 'message' && each.tone === 'warn')).toBe(false);
    expect(game.slot(DEV_SLOT)).toBe(serializeSession(game.ctx.session));
    expect(game.slot(DEV_SLOT)).not.toBe(authored);
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('goes into dev without picking up a dev slot it cannot read, and will not write it either', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    game.write(DEV_SLOT, 'what the last dev session was doing');

    const entered = runLine(game.ctx, '/dev on');
    expect(entered.output.some((each) => each.kind === 'message' && each.tone === 'warn')).toBe(true);
    game.pass(2_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(DEV_SLOT)).toBe('what the last dev session was doing');

    runLine(game.ctx, '/save');
    expect(game.slot(DEV_SLOT)).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('leaves dev without a snapshot to come back to rather than keeping the session in it', () => {
    const game = playing();
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT);
    runLine(game.ctx, '/dev on');
    runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    writeFileSync(path.join(game.dir, `${DEV_SNAPSHOT_SLOT}.slot`), '{{{ truncated', 'utf8');

    expect(errorsOf(runLine(game.ctx, '/dev off'))).toEqual([]);
    expect(linesOf(runLine(game.ctx, '/slots'))[0]).toMatch(/^writing player, dev mode off —/);
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(PLAYER_SLOT)).toBe(played);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('leaves dev with a store that refuses every write, because leaving writes nothing', () => {
    const game = playing();
    runLine(game.ctx, '/autosave 1');
    runLine(game.ctx, '/save');
    const played = game.slot(PLAYER_SLOT);
    runLine(game.ctx, '/dev on');
    for (let each = 0; each < 5; each += 1) runLine(game.ctx, 'use: entity.chest.open');
    runLine(game.ctx, '/save');
    const authored = game.slot(DEV_SLOT);

    rmSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), { force: true });
    mkdirSync(path.join(game.dir, `${PLAYER_SLOT}.slot`));
    writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`, 'in the way'), 'x', 'utf8');
    expect(played).not.toBeNull();

    expect(errorsOf(runLine(game.ctx, '/dev off'))).toEqual([]);
    expect(game.ctx.save?.dev).toBe(false);
    expect(sessionStatus(game.ctx.session).inventory.gold ?? 0).toBe(0);

    game.pass(60_000);
    runLine(game.ctx, 'use: entity.chest.open');
    expect(game.slot(DEV_SLOT)).toBe(authored);
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('says which it is when asked', () => {
    const game = playing();
    runLine(game.ctx, '/save');
    expect(linesOf(runLine(game.ctx, '/slots'))[0]).toBe('writing player, dev mode off');

    const next = game.reopened();
    expect(linesOf(runLine(next, '/slots'))[0]).toMatch(/writing player, dev mode off — this session did not come out of that slot/);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

const SOMEONE_ELSES_SAVE = `{"version":${SAVE_VERSION},"inventory":{"gold":5},"flags":{"camp.discovered":true}}`;

const DEV_MARK = 999;
const MARKED = `{"version":${SAVE_VERSION},"inventory":{"gold":${DEV_MARK}},"flags":{"camp.discovered":true}}`;

const ENTERED_HOLDING: ReadonlyArray<readonly [string, (game: Playing) => void]> = [
  ['nothing at all', () => undefined],
  ['what this session saved', (game) => void runLine(game.ctx, '/save')],
  ['a game from somewhere else', (game) => game.write(PLAYER_SLOT, SOMEONE_ELSES_SAVE)],
  ['a save this build cannot read', (game) => game.write(PLAYER_SLOT, `{"version":${SAVE_VERSION + 900}}`)],
];

const SHAPED_IN_DEV: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'use: entity.chest.open' };

const ACTS_ON: Record<string, string> = {
  '/inventory': 'gold',
  '/quests': 'a-quest',
  '/stat': 'tap',
  '/goto': 'camp',
  '/place': 'camp 3 4',
  '/link': 'camp isle',
  '/region': 'camps +camp',
  '/unlink': 'camp shore',
  '/wait': '1',
  '/speed': '2',
  '/test': 'replay',
  '/load': 'stranger',
  '/expect': 'stranger',
  '/assert': 'time >= 0',
  '/dsl': `save staged {"version":${SAVE_VERSION}}`,
  '/grammar': 'item',
  '/source': 'camp',
  '/local': 'list',
  '/create-test': 'made',
  '/create-valid-test': 'made-valid',
  '/import': SOMEONE_ELSES_SAVE,
  '/autosave': '1',
  '/settings': 'hardcore on',
  '/dev': 'off',
};

function linesFor(spec: (typeof COMMANDS)[number]): string[] {
  const bare = SHAPED_IN_DEV[spec.name] ?? spec.name;
  const argument = ACTS_ON[spec.name];
  return argument === undefined ? [bare, `${bare} 1`] : [bare, `${bare} ${argument}`];
}

function goldIn(payload: string | null): number | null {
  if (payload === null) return null;
  try {
    return (JSON.parse(payload) as { inventory?: Record<string, number> }).inventory?.gold ?? 0;
  } catch {
    return null;
  }
}

describe('no line leaves this session writing a slot that is not its game (c4)', () => {
  const PLAYED_GOLD = 9;

  for (const spec of COMMANDS) {
    it(`over every line ${spec.name} takes`, () => {
      const leaked: string[] = [];

      for (const line of linesFor(spec)) {
        const game = playing();
        try {
          runLine(game.ctx, '/autosave 1');
          for (let each = 0; each < PLAYED_GOLD; each += 1) {
            game.pass(2_000);
            runLine(game.ctx, 'use: entity.chest.open');
          }
          runLine(game.ctx, '/save');
          const played = game.slot(PLAYER_SLOT);

          runLine(game.ctx, line);
          game.pass(2_000);
          runLine(game.ctx, 'use: entity.chest.open');

          const gold = goldIn(game.slot(PLAYER_SLOT));
          if (game.slot(PLAYER_SLOT) !== played && (gold === null || gold < PLAYED_GOLD + 1)) {
            leaked.push(`${JSON.stringify(line)}: slot holds gold ${gold}, which is not this player's game`);
          }
        } finally {
          rmSync(game.dir, { recursive: true, force: true });
        }
      }

      expect(leaked).toEqual([]);
    });
  }
});

describe('nothing done in dev mode reaches the slot being played (c9)', () => {
  for (const [holding, enter] of ENTERED_HOLDING) {
    for (const spec of COMMANDS) {
      it(`over every line ${spec.name} takes, entering on ${holding}`, () => {
        const leaked: string[] = [];

        for (const line of linesFor(spec)) {
          const game = playing();
          try {
            runLine(game.ctx, '/autosave 1');
            enter(game);
            const atEntry = game.slot(PLAYER_SLOT);

            runLine(game.ctx, '/dev on');
            runLine(game.ctx, `/import ${MARKED}`);
            game.pass(2_000);
            runLine(game.ctx, line);

            game.pass(2_000);
            runLine(game.ctx, '/dev off');
            const atExit = game.slot(PLAYER_SLOT);
            if (atExit !== atEntry) leaked.push(`${JSON.stringify(line)}: slot changed at exit`);

            for (let each = 0; each < 3; each += 1) {
              game.pass(2_000);
              runLine(game.ctx, 'use: entity.chest.open');
              const gold = goldIn(game.slot(PLAYER_SLOT));
              if (gold !== null && gold >= DEV_MARK) leaked.push(`${JSON.stringify(line)}: dev's session in the slot ${each + 1} command(s) later`);
            }
          } finally {
            rmSync(game.dir, { recursive: true, force: true });
          }
        }

        expect(leaked).toEqual([]);
      });
    }
  }

  // An author is shown every place on the floor they are looking at, found or not, so that putting
  // the next place beside the last one is something they can actually see.
  it('draws the whole floor once dev is on, and only what was found before that', () => {
    const game = playing(SAVING_SOURCE + `
# location shed
x: 3, y: 0
`);

    const before = shown(runLine(game.ctx, '/map')).join(' ');
    expect(before).not.toContain('Shed');

    runLine(game.ctx, '/dev on');
    const after = shown(runLine(game.ctx, '/map')).join(' ');

    expect(after).toContain('?Shed');
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('walks the whole command table, twice per entry', () => {
    expect(COMMANDS.length).toBeGreaterThan(20);
  });

  it('hands every command that takes an argument one it acts on', () => {
    const takesOne = COMMANDS.filter((spec) => spec.argHint !== '' && SHAPED_IN_DEV[spec.name] === undefined);
    expect(takesOne.length).toBeGreaterThan(10);
    expect(takesOne.filter((spec) => ACTS_ON[spec.name] === undefined).map((spec) => spec.name)).toEqual([]);

    for (const spec of takesOne) expect(linesFor(spec), spec.name).toContain(`${spec.name} ${ACTS_ON[spec.name]}`);
  });

  it('enters on a slot it cannot read, and touches those bytes at no point', () => {
    const game = playing();
    const corrupt = '{{{ truncated';
    writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), corrupt, 'utf8');
    const reopened = { ...game, ctx: game.reopened() };

    expect(errorsOf(runLine(reopened.ctx, '/autosave 1'))).toEqual([]);
    expect(errorsOf(runLine(reopened.ctx, '/dev on'))).toEqual([]);
    for (let each = 0; each < 3; each += 1) {
      reopened.pass(2_000);
      runLine(reopened.ctx, 'use: entity.chest.open');
    }
    expect(errorsOf(runLine(reopened.ctx, '/dev off'))).toEqual([]);

    reopened.pass(60_000);
    runLine(reopened.ctx, 'use: entity.chest.open');
    expect(readFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`), 'utf8')).toBe(corrupt);
    expect(linesOf(runLine(reopened.ctx, '/slots'))[0]).toMatch(/^writing player, dev mode off — that slot holds bytes nothing here can read/);
    rmSync(game.dir, { recursive: true, force: true });
  });
});

describe('a filesystem that refuses reaches the command table as a message (c7)', () => {
  const LINES = ['/slots', '/save', '/restore', '/dev on', 'use: entity.chest.open'];

  for (const line of LINES) {
    it(`answers ${JSON.stringify(line)} rather than ending the session`, () => {
      const game = playing();
      runLine(game.ctx, '/autosave 1');
      game.pass(2_000);
      mkdirSync(path.join(game.dir, `${PLAYER_SLOT}.slot`));
      writeFileSync(path.join(game.dir, `${PLAYER_SLOT}.slot`, 'in the way'), 'x', 'utf8');

      const result = runLine(game.ctx, line);
      expect(result.output.length).toBeGreaterThan(0);
      expect(shown(runLine(game.ctx, '/look')).length).toBeGreaterThan(0);
      rmSync(game.dir, { recursive: true, force: true });
    });
  }
});

describe('all of it is exercised before src/ui exists (c8)', () => {
  it('keeps the slots as files, which is the store a player would have', () => {
    const game = playing();
    runLine(game.ctx, '/save');

    expect(readdirSync(game.dir)).toEqual([`${PLAYER_SLOT}.slot`]);
    expect(game.slot(PLAYER_SLOT)).toBe(serializeSession(game.ctx.session));
    rmSync(game.dir, { recursive: true, force: true });
  });

  it('reaches no browser adapter, so the CLI stands in its own store', () => {
    const reaching = readdirSync('scripts', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.'))
      .filter((entry) => /from '[^']*\/ui\/[^']*(browserStore|pageStorage)'/.test(readFileSync(path.join(entry.parentPath, entry.name), 'utf8')))
      .map((entry) => entry.name);

    expect(reaching).toEqual([]);
  });
});
