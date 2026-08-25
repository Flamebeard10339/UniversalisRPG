import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { saidWords } from '../src/content/locale';
import { LIVE_TICK_MS, newContext, runLine, type CommandContext, type LiveRun } from '../src/runtime/command';
import type { Localizer } from '../src/runtime/localized';
import { sessionLocalizer, startSession, view } from '../src/runtime/session';
import { pageStorage } from '../src/ui/agent/pageStorage';
import { asksNothing } from '../src/ui/asking';
import { App } from '../src/ui/App';
import { browserSlots } from '../src/ui/browserStore';
import { createDriver, type Driver } from '../src/ui/driver';
import { LAYERS, OPENING, toLayer, toSubpage } from '../src/ui/nav';
import { SHIPPED_SOURCES } from '../src/ui/shippedContent';
import {
  driftingPaths,
  excusedCommandsAreReal,
  excusedPathsAreReal,
  unansweredCommands,
  type CommandExcuse,
  type PathExcuse,
  type SurfaceAnswers,
  type SurfaceRun,
  type SurfaceStep,
} from './lib/viewCoverage';
import { printed, say } from './lib/replLines';
import { driveRun, formatResult, openRepl } from './play-cli';
import { ANSWER_NOT_SHOWN, answerLines, renderView } from './playbot';

// One question, asked of all three drivers over one engine: no surface may lose a capability the
// others kept. The subjects derive themselves — the leaf paths a live view actually carries, and
// the commands the table marks a player's — so a field a section grows or a command somebody adds
// arrives here on its own, and a driver that draws it while another does not fails naming both.
//
// Nothing here says what ought to be drawn. A path no driver draws is one decision made
// everywhere — a machine name a player never reads, an enum a renderer acts on instead of
// printing — and needs no excuse from anybody. The list below is only for where they genuinely
// differ, which is why it is one list and not one per driver: an excuse for a *difference*
// belongs to no single surface.
const PARITY_EXCUSED: readonly PathExcuse[] = [
  {
    path: 'modals[].options[].label',
    why: 'a screen whose only answer is the one that leaves is not asking anything, so the app draws what it is showing and no question above it. A terminal has no frame around a screen and names the question to say one is open at all',
    // The app's own judgement, asked rather than restated, so this covers the moments it covers and
    // not the path. Every other screen's question is load-bearing — an item's own words, a jewel's —
    // and a driver that dropped one fails here.
    covers: (view) => asksNothing(view.modals),
  },
  {
    path: 'planes[].clusters[].positions[].title',
    why: 'the app names the node the player has picked and nothing on the lattice itself, since a tap is how a node is asked about there; a terminal has nothing to tap and so lays every node out as a table with its passive in a column',
    covers: () => true,
  },
];

const ANSWER_EXCUSED: readonly CommandExcuse[] = [
  {
    command: '/state',
    why: 'every figure a status holds has a page of its own in the app — stats, skills, equipment, inventory, the map — so dumping the same numbers into the command log would be a second and worse copy of what the player is already looking at',
  },
  {
    command: '/quit',
    why: 'a browser tab has nothing to exit to, and the app writes its save continuously rather than on the way out; the terminal prints a closing sheet because closing is a thing that happens there',
  },
  {
    command: '/cancel',
    why: 'with nothing under way there is nothing to stop. The terminal and the model both answer by reprinting the view they already had, which is how a scrollback says nothing happened; a screen that has not changed has said the same thing already',
  },
];

// A field at its freshly-started value can be indistinguishable from noise a renderer prints for
// an unrelated reason — 0 seconds elapsed reads as "0" wherever a digit turns up by coincidence.
// Advancing the clock to a distinctive figure gives every timed field a signature worth searching
// for.
const DISTINCTIVE_SECONDS = 54321;

// A fresh view carries nothing at most of its paths: no fight, no open screen, no quest under way,
// so `encounter.foes[].remaining` and `journal[].lines[].said` are absent and nothing has to draw
// them. Walking a short run instead is what puts those paths in front of every driver. Each line
// is one the engine takes from any of the three.
const SCRIPT: readonly string[] = [
  '/load tutorial-quests.miki-route-end',
  `/wait ${DISTINCTIVE_SECONDS}`,
  '/look',
  '/state',
  '/quests',
  '/quests tutorial-quests.finding-your-feet',
  'submit-modal: close=close',
  '/load tulsa.growing-through-the-inventory-screen-end',
  '/look',
  '/state',
  '/quests',
  '/inventory 1',
  'submit-modal: verb=grow',
  'submit-modal: plane=back',
  'submit-modal: verb=close',
  '/settings',
  '/load tutorial-quests.miki-route-start',
  '/goto tulsa.basement',
  '/state',
  // Picked as a choice rather than typed as the directive behind it, which is the one shape that
  // arms an action instead of applying it: a driver that can advance a run gets one to advance, and
  // the live sheet a terminal draws while it runs is only reachable this way.
  'fight:core.melee-combat:tulsa.giant-rat',
  '/state',
];

const registry = () => loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry;

// The same script, walked once per driver, so a path is asked of each of them in the same state.
const walkScript = (step: (line: string) => SurfaceStep): SurfaceStep[] => SCRIPT.map(step);

// A bound on a loop that stops itself: driveRun ends the run the tick it goes inactive and clears
// the ticker, so this only decides how long a run that never ends is watched before the next line
// interrupts it — which is what typing one does at the real terminal.
const LIVE_TICKS_WATCHED = 200;

// The terminal's own live loop, on a clock this walk turns by hand. Everything play-cli says while
// an action runs it says through driveRun, so the sheet naming the action under way is reached here
// the same way a player reaches it, rather than described a second time.
function driveHere(run: LiveRun, localizer: Localizer): string[] {
  const written: string[] = [];
  const ticks: Array<(elapsedMs: number) => void> = [];
  const stop = driveRun(
    run,
    localizer,
    (text) => void written.push(text),
    (result) => void written.push(...formatResult(result, localizer).map(printed)),
    (tick) => {
      ticks.push(tick);
      return () => void (ticks.length = 0);
    },
  );
  for (let watched = 0; watched < LIVE_TICKS_WATCHED && ticks.length > 0; watched++) ticks[0](LIVE_TICK_MS);
  stop(true);
  return written;
}

// The lines of the walk that came back with a run to advance, beside the steps themselves. A walk
// where that list is empty puts play-cli in a shape it is never in — every claim below still
// passes and the live sheet is never drawn — so the list is something to assert on, not a detail.
interface TerminalWalk {
  readonly steps: SurfaceStep[];
  readonly armedBy: string[];
}

function cliWalk(driving: boolean): TerminalWalk {
  const { context: ctx } = openRepl(SHIPPED_SOURCES, { driving });
  const { session } = ctx;
  const armedBy: string[] = [];
  const steps = walkScript((line) => {
    const result = runLine(ctx, line);
    const localizer = sessionLocalizer(session);
    if (result.live) armedBy.push(line);
    const running = result.live ? [...(result.view?.said ?? []).map((said) => printed(say(said))), ...driveHere(result.live, localizer)] : [];
    const rendered = [...formatResult(result, localizer).map(printed), ...running].join('\n');
    ctx.view = view(session);
    return { view: ctx.view, rendered };
  });
  return { steps, armedBy };
}

// Both shapes of the one terminal, because `--live` on a TTY is a boolean and a boolean has no
// third value. Driving, a choice arms an action and everything said while it runs is said through
// the live sheet; not driving, the same choice resolves at once and `/state` is the only place an
// action under way is named. Either walk alone leaves whatever only the other draws unproved.
function cliRun(): TerminalWalk {
  const walks = [true, false].map(cliWalk);
  return { steps: walks.flatMap((walk) => walk.steps), armedBy: walks.flatMap((walk) => walk.armedBy) };
}

function botRun(): SurfaceStep[] {
  const session = startSession(registry());
  const ctx = newContext(session, view(session));
  return walkScript((line) => {
    const result = runLine(ctx, line);
    const localizer = sessionLocalizer(session);
    ctx.view = view(session);
    // Both halves of what a turn puts in front of the model: the view it opens with, and what the
    // line it sent answered with.
    return { view: ctx.view, rendered: `${renderView(ctx.view, localizer)}\n${answerLines(result, localizer).join('\n')}` };
  });
}

const EVERY_PAGE = LAYERS.flatMap((layer, at) => layer.subpages.map((subpage) => toSubpage(toLayer(OPENING, at), at, subpage.id)));

// Markup, read back as the words it puts on a screen. React escapes what it draws, so `Smith's
// Chest` reaches the page as `Smith&#x27;s Chest` and a search for the words the world wrote finds
// nothing — a punctuation mark would otherwise read as a whole surface having dropped a line.
const ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&#x27;|&#39;|&apos;/g, "'"],
  [/&quot;|&#34;/g, '"'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&#x2F;/g, '/'],
  [/&amp;/g, '&'],
];

const asWords = (markup: string): string => ESCAPES.reduce((held, [pattern, character]) => held.replace(pattern, character), markup);

const drawEveryPage = (driver: Driver): string => asWords(EVERY_PAGE.map((where) => renderToStaticMarkup(createElement(App, { driver, opening: where }))).join(''));

// The player's pages only. Dev mode opens the authoring map, which draws every location the
// registry holds whether or not anybody has walked to one — an author's sight, and the thing the
// other two drivers are deliberately refused.
function guiRun(): SurfaceStep[] {
  const slots = browserSlots(() => pageStorage());
  const driver = createDriver(SHIPPED_SOURCES, { slots, ticker: () => () => undefined });
  return walkScript((line) => {
    driver.send(line);
    return { view: driver.snapshot().view, rendered: drawEveryPage(driver) };
  });
}

describe('no driver draws less of a live view than the others', () => {
  const runs = (): SurfaceRun[] => [
    { name: 'the playbot', steps: botRun() },
    { name: 'play-cli', steps: cliRun().steps },
    { name: 'the GUI', steps: guiRun() },
  ];

  it('the walk arms an action, so the sheet a terminal draws while one runs is drawn here at all', () => {
    expect(cliRun().armedBy).not.toEqual([]);
  });

  it('every leaf the same short run publishes reaches all three drivers, or none of them', () => {
    const drifting = driftingPaths(runs(), saidWords(registry().locales), PARITY_EXCUSED);
    expect(drifting, `these paths reach some drivers and not others:\n  ${drifting.join('\n  ')}`).toEqual([]);
  });

  it('nothing is excused at a path a live view does not carry, and no excuse is a placeholder', () => {
    expect(excusedPathsAreReal(runs(), PARITY_EXCUSED)).toEqual([]);
  });
});

// The other half of a surface: a player types a line and is answered. The subjects are every
// command the table marks a player's, so one added next month has to be answered everywhere.
describe('no driver meets a command with silence that the others answer', () => {
  const surfaces = (): SurfaceAnswers[] => {
    const botSession = startSession(registry());
    const botCtx = newContext(botSession, view(botSession));
    const cliSession = startSession(registry());
    const cliCtx = newContext(cliSession, view(cliSession));
    const gui = createDriver(SHIPPED_SOURCES, { slots: browserSlots(() => pageStorage()), ticker: () => () => undefined });
    return [
      { name: 'the playbot', answer: (spec) => answerLines(runLine(botCtx, spec.name), sessionLocalizer(botSession)) },
      { name: 'play-cli', answer: (spec) => formatResult(runLine(cliCtx, spec.name), sessionLocalizer(cliSession)).map(printed) },
      {
        // Two channels here, not one: the log a command writes into, and the screen itself. A
        // command that opens a screen has answered the player who is looking at it, and saying so
        // is not the same as saying nothing.
        name: 'the GUI',
        answer: (spec) => {
          const before = gui.snapshot().transcript.entries.length;
          const drawnBefore = drawEveryPage(gui);
          gui.send(spec.name);
          const written = gui.snapshot().transcript.entries.slice(before).map((entry) => String(entry.text));
          return drawEveryPage(gui) === drawnBefore ? written : [...written, 'the screen redrew'];
        },
      },
    ];
  };

  it('every command a player may type is answered by all three drivers, or by none', () => {
    const silent = unansweredCommands(surfaces(), ANSWER_EXCUSED);
    expect(silent, `these commands are answered unevenly:\n  ${silent.join('\n  ')}`).toEqual([]);
  });

  it('nothing is excused that the command table does not declare, and no excuse is a placeholder', () => {
    expect(excusedCommandsAreReal(ANSWER_EXCUSED)).toEqual([]);
  });
});

// The playbot is the one driver that renders a whole view for itself every turn rather than
// logging what changed, so it is the one that can afford to leave an output kind to the next
// turn's render. Whatever it leaves has to say so.
describe('the playbot answers for every kind of output a command can carry', () => {
  it('names a reason for each kind it does not read back to the player', () => {
    for (const excuse of ANSWER_NOT_SHOWN) expect(excuse.why.length, excuse.kind).toBeGreaterThan(20);
  });
});

// Kept beside the parity claims because it is the same question about the terminal itself: the
// startup footnote is this driver's own and rides under the help the engine hands every driver.
describe('a command context is shared, not copied', () => {
  it('the terminal adds its own startup lines to the engine help without editing it', () => {
    const session = startSession(registry());
    const ctx: CommandContext = newContext(session, view(session));
    const help = formatResult(runLine(ctx, '/help'), sessionLocalizer(session)).map(printed).join('\n');
    expect(help).toContain('at startup loads content files');
  });
});
