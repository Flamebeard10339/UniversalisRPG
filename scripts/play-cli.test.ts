import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadModule } from '../src/content/registry';
import { SAVE_VERSION } from '../src/runtime/save';
import { serializeSession, startSession, view } from '../src/runtime/session';
import { COMMANDS, newContext, runLine, type CommandContext, type Recorder } from '../src/runtime/command';
import { formatLive, formatOutput, formatResult, formatTick, loadModportalSources } from './play-cli';

const source = readFileSync('content/tutorial-island.dsl', 'utf8');

function driver(text: string, speed = 1, driving = false): CommandContext {
  const session = startSession(loadModule(text));
  const recorder: Recorder = { history: [], startSave: serializeSession(session) };
  return newContext(session, view(session), { recorder, speed, driving });
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
    const ctx = driver(source);
    const lines = formatResult(runLine(ctx, '/look'));

    expect(lines[0]).toBe('Guide House (tutorial-island.guide-house)');
    expect(lines[1]).toBe(`A cluttered but cozy cottage. Miki's guide house.`);
    expect(lines[2]).toBe('Here: Miki, Front Door, Stairs, Mirror, Oven');
    expect(lines[3]).toBe('Health: ██████████ 30/30');
    expect(lines).toContain('  1) Talk to Miki');
    expect(lines[lines.length - 1]).toBe('[time: 0s]');
  });

  it('prints a location description on first arrival and again only when /look asks', () => {
    const ctx = driver(source);
    const described = `A cluttered but cozy cottage. Miki's guide house.`;

    expect(formatResult(runLine(ctx, '/look'))).toContain(described);
    expect(formatResult(runLine(ctx, '/wait 1'))).not.toContain(described);
    expect(formatResult(runLine(ctx, '/look'))).toContain(described);
  });

  it('marks a match, a mismatch and a refusal with this driver’s own glyphs', () => {
    const ctx = driver(`
# location camp
x: 0, y: 0
starting

# save empty
{"version":${SAVE_VERSION}}
`);
    expect(formatResult(runLine(ctx, '/assert time >= 0'))).toEqual(['✓ time >= 0 matches']);
    expect(formatResult(runLine(ctx, '/assert time < 0'))).toEqual(['⚠ time < 0']);
    expect(formatResult(runLine(ctx, '/expect empty'))).toEqual(['✓ empty matches']);
    expect(formatResult(runLine(ctx, '/bogus'))).toEqual(['Error: unknown command: /bogus']);
  });

  it('indents the diagnostics under the error that carries them', () => {
    const ctx = driver('# location camp\nx: 0, y: 0\nstarting\n');
    const failed = formatOutput({ kind: 'message', tone: 'error', text: 'local changes did not load.', detail: ['first', 'second'] });
    expect(failed).toEqual(['Error: local changes did not load.', '  first', '  second']);
    expect(formatResult(runLine(ctx, '/state'))[0]).toBe('Location: camp');
  });

  it('prints the status readout /state and /quit both produce', () => {
    const ctx = driver(source);
    runLine(ctx, '/wait 7');
    expect(formatResult(runLine(ctx, '/state'))).toEqual([
      'Location: tutorial-island.guide-house',
      'Elapsed simulated time: 7s',
      'Flags: {}',
      'Inventory: {}',
      'XP: {}',
      'Health: ██████████ 30/30',
    ]);
    expect(formatResult(runLine(ctx, '/quit'))[0]).toBe('Location: tutorial-island.guide-house');
  });

  it('separates each authored block with a blank line, so the emission pastes into a module', () => {
    expect(formatOutput({ kind: 'authored', blocks: [['# save foo-start', '{}'], ['# test foo', 'wait: 1']] })).toEqual([
      '',
      '# save foo-start',
      '{}',
      '',
      '# test foo',
      'wait: 1',
    ]);
  });

  it('lays the help out from the table alone, one line per entry, plus this driver’s own startup argv', () => {
    const ctx = driver(source);
    const lines = formatResult(runLine(ctx, '/help'));

    expect(lines[0]).toBe('Commands:');
    expect(lines).toContain('  <N>          choose option N');
    expect(lines).toContain('  /wait <s>    advance simulated time by <s> seconds');
    expect(lines).toContain('  /quit, /q    show final state and exit');
    expect(lines).toContain('  /dsl <kind> <id> [body] stage or replace one local DSL section; use | for new lines');

    // One line per table entry, and the startup argv after them: nothing in this
    // driver names a command the table does not.
    const startup = lines.filter((line) => line.includes('at startup'));
    expect(lines).toHaveLength(1 + COMMANDS.length + startup.length);
    for (const spec of COMMANDS) expect(lines.some((line) => line.trimStart().startsWith(spec.name)), spec.name).toBe(true);
  });
});

// `oven.roast` repeats and never self-completes; `anvil.strike` completes after
// its single attempt; `bell.ring` whittles its own completion down instead of a
// foe's pool. `kiln.fire` is the one that speaks when it lands. Every branch of
// the live line.
const LIVE_MODULE = `
# stat tap
base: 0.2

# stat taps-per-minute
base: 60

# location camp
x: 0, y: 0
starting
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
      lines.push(formatLive(progress));
      if (!progress.active) break;
    }
    return lines;
  }

  it('draws the bar and the clock from the numbers the tick publishes', () => {
    expect(liveLines('use:entity.anvil.strike', 5, 700)).toEqual([
      'strike... [#####---------------]  [time: 0.7s]',
      'strike... [#########-----------]  [time: 1.4s]',
      'strike... [##############------]  [time: 2.1s]',
      'strike... [###################-]  [time: 2.8s]',
      // The action is gone from the view that ends it, so its name comes from
      // the one before.
      'strike: done.  [time: 3.5s]',
    ]);
  });

  it('counts an untargeted action’s swings down to its completion instead of a foe’s pool', () => {
    expect(liveLines('use:entity.bell.ring', 4, 1000)).toEqual([
      'ring... [--------------------] hits:1 completion:0.8  [time: 1.0s]',
      'ring... [--------------------] hits:2 completion:0.6  [time: 2.0s]',
      'ring... [--------------------] hits:3 completion:0.4  [time: 3.0s]',
      'ring... [--------------------] hits:4 completion:0.2  [time: 4.0s]',
    ]);
  });

  // The say a completion produces rides on the view that tick hands back and
  // is drained from every view after it, so the bar is the only thing between
  // the world speaking and nobody hearing it.
  it('prints what the world said as a tick passed, above the bar and not over it', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');

    const before = formatTick(started.live!.tick(1000));
    const landing = formatTick(started.live!.tick(1000));

    expect(before).toEqual(['fire... [##########----------]  [time: 1.0s]']);
    expect(landing).toEqual(['The kiln settles with a crack.', 'fire: done.  [time: 2.0s]']);
  });

  it('leaves nothing for the closing result to print, which is why the tick must', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');
    started.live!.tick(2000);

    const closing = formatResult(started.live!.end(false));

    expect(closing).not.toContain('The kiln settles with a crack.');
  });

  // Whatever the world says as an action is armed — a take gate refusing, a
  // relocation — is on the view and in no output, so a caller that formats the
  // result alone prints none of it. runLiveAction takes that list as a
  // parameter for want of a way to test the readline loop it prints inside.
  it('reports no output at all when it arms, so the arming view is the only place a say is', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.kiln.fire');

    expect(started.output).toEqual([]);
    expect(formatResult(started)).toEqual([]);
  });

  it('scales elapsed real time by the speed dial before it draws anything', () => {
    expect(liveLines('use:entity.oven.roast', 2, 1000, 4)).toEqual([
      'roast... [--------------------]  [time: 4.0s]',
      'roast... [--------------------]  [time: 8.0s]',
    ]);
  });

  it('narrates the pools of a fight in place of the completion countdown', () => {
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
    expect(formatLive(started.live!.tick(900))).toBe('Swing... [##################--] Health 30/30 Rat 12/12  [time: 0.9s]');
    expect(formatLive(started.live!.tick(900))).toBe('Swing... [################----] Health 30/30 Rat 6/12  [time: 1.8s]');
  });

  it('prefers the pools to the countdown when a run has both, so a fight is never narrated as a tally', () => {
    const both = {
      label: 'ring',
      active: true,
      time: 2,
      progress: 0.5,
      pools: [{ title: 'Health', current: 21, max: 30 }],
      implicit: { attempts: 3, completion: 0.4 },
      view: undefined as never,
    };
    expect(formatLive(both)).toBe('ring... [##########----------] Health 21/30  [time: 2.0s]');
    expect(formatLive({ ...both, pools: [] })).toBe('ring... [##########----------] hits:3 completion:0.4  [time: 2.0s]');
  });

  it('prints the stop and the world it left when a run is cancelled', () => {
    const started = armed(driver(LIVE_MODULE, 1, true), 'use:entity.oven.roast');
    expect(formatResult(started)).toEqual([]);

    started.live!.tick(1000);
    const lines = formatResult(started.live!.end(true));
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
