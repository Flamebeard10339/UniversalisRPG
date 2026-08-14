import { describe, expect, it } from 'vitest';
import { initialLocalChangesModule } from '../src/content/localChanges';
import { loadUniverseWithDiagnostics } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { COMMANDS, runLine, UNAVAILABLE, type AuthoringContext, type CommandResult } from '../src/runtime/command';
import { serializeSession } from '../src/runtime/session';
import { createDriver, type Driver } from '../src/ui/driver';
import { SHIPPED_SOURCES } from '../src/ui/shippedContent';
import { appendOutputs, type LogEntry } from '../src/ui/transcript';
import { openRepl, type Repl } from './play-cli';

const refused = (result: CommandResult): boolean => result.output.some((each) => each.kind === 'message' && each.tone === 'error');

// The one capability the two drivers do not share, and so the one divergence
// this proof allows: the REPL is opened with somewhere to write local changes
// and the GUI has none until mod-portal-gui and its siblings give it one. A
// line refused for that reason is counted; every other line is held to the
// same output and the same bytes, which is what makes the count a carve-out
// rather than a hole.
const unavailable = (entries: readonly LogEntry[]): boolean =>
  entries.some((entry) => entry.kind === 'message' && entry.tone === 'error' && entry.text === UNAVAILABLE);

// The three table entries whose names are shapes rather than words, given one
// line each of that shape. Every other line below is the name the table itself
// carries, so a command added tomorrow is replayed here on the day it exists
// and nobody edits this file — or anything under src/ui — to make that happen.
const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

// Both drivers armed the same way. `driving` decides whether a spannable
// action is armed or resolved where it stands, and the GUI always arms, so a
// comparison against a REPL that resolves would compare two different games.
//
// The authoring context is built the way play-cli's main builds it, with no
// file on disk: taking it off the REPL would equalise the two drivers by
// removing the capability they differ on, and a proof that does that cannot
// see capability drift. Nothing writes: main passes a writer and this does
// not, so a staged edit lives and dies inside the context.
function bothDrivers(): { repl: Repl; gui: Driver } {
  const dependencies = loadUniverseWithDiagnostics(SHIPPED_SOURCES).loadedModules;
  const localSource: ModuleSource = { name: 'local-changes.dsl', text: initialLocalChangesModule(dependencies) };
  const authoring: AuthoringContext = { baseSources: [...SHIPPED_SOURCES], dependencies, localSource };
  return { repl: openRepl(SHIPPED_SOURCES, { authoring, driving: true }), gui: createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined }) };
}

// One line through both, held to the two things the clause names: the GUI's
// log gains exactly the REPL's output and nothing else, and the two sessions
// serialize to the same bytes. Per line rather than at the end, because a
// divergence that cancels itself out is still one and only this names the line
// it happened on.
function inStep(repl: Repl, gui: Driver, line: string, dispatch: () => void = () => gui.send(line)): { result: CommandResult; carved: boolean } {
  const before = gui.snapshot().transcript;
  const result = runLine(repl.context, line);
  dispatch();

  const where = `after ${JSON.stringify(line)}`;
  const gained = gui.snapshot().transcript.entries.slice(before.entries.length);
  const carved = unavailable(gained) && !unavailable(appendOutputs(before, result.output).entries.slice(before.entries.length));
  if (!carved) expect(gui.snapshot().transcript.entries, where).toEqual(appendOutputs(before, result.output).entries);
  // The bytes hold either way: a command the GUI cannot reach is one it did
  // not run, so neither driver moved and both must still be standing in the
  // same game.
  expect(gui.serialized(), where).toBe(serializeSession(repl.context.session));
  return { result, carved };
}

// The whole crafting route as the answers a player gives, each of which is a
// value the screen it is given to published. The GUI answers through its own
// gesture and the REPL through the line the shared table parses, so a screen
// only one driver can walk is a step that fails rather than a difference nobody
// measures. It is the route `growing-through-the-inventory-screen` replays over
// shipped content; here it is walked twice at once.
const CRAFTING_ROUTE: ReadonlyArray<readonly [string, string]> = [
  ['verb', 'Grow'],
  ['plane', 'allocate: slot e'],
  ['plane', 'slot: e with Crossroads Jewel'],
  ['plane', "feed: with Master's Whetstone"],
  ['plane', 'Go to 1,0'],
  ['plane', 'allocate: position 1'],
  ['plane', 'allocate: slot ne'],
  ['plane', 'slot: ne with Keen Edge Jewel'],
  ['plane', 'Go to 2,-1'],
  ['plane', 'allocate: position 1'],
  ['plane', 'Back to inventory'],
  ['verb', 'Equip'],
];

interface SerializedGrowth {
  equipped: Record<string, string>;
  instances: { byId: Record<string, { payload: { plane: Record<string, unknown> } }> };
}

describe('the two drivers cannot drift', () => {
  it('reaches byte-identical state and says the same things, over a scripted sequence', () => {
    const script = ['/look', '/inventory', '/state', '1', '/wait 3', '/speed 2', '/look', '/bogus', '/assert time >= 3', '/expect empty', '/dsl location tutorial-island.guide-house', '/help'];
    const { repl, gui } = bothDrivers();
    expect(gui.serialized()).toBe(serializeSession(repl.context.session));

    const carved: string[] = [];
    for (const line of script) if (inStep(repl, gui, line).carved) carved.push(line);

    // Named, not counted: the script ends with a section edit, which is the
    // one thing in it the GUI has no context to do, and every other line is
    // held to identical output.
    expect(carved).toEqual(['/dsl location tutorial-island.guide-house']);

    // A pair of drivers that both said nothing at every step would pass every
    // line above.
    expect(gui.snapshot().transcript.entries.length).toBeGreaterThan(script.length);
  });

  // The clause's other half, and the half that keeps holding as the table
  // grows: the corpus is read off COMMANDS. Each entry goes through twice,
  // bare and with an argument, so a command that takes one is exercised on the
  // path where it works as well as the path where it complains.
  it('dispatches every entry in the shared table the way the REPL does', () => {
    const { repl, gui } = bothDrivers();
    expect(COMMANDS.length).toBeGreaterThan(10);
    let accepted = 0;

    let carved = 0;

    for (const spec of COMMANDS) {
      const bare = SHAPED[spec.name] ?? spec.name;
      for (const line of [bare, `${bare} 1`]) {
        const step = inStep(repl, gui, line);
        if (step.carved) carved += 1;
        else if (!refused(step.result)) accepted += 1;
      }
    }

    // A table every entry of which was refused would prove nothing about
    // dispatch, only about parsing.
    expect(accepted).toBeGreaterThan(7);
    // And a run that carved nothing out is a run against a REPL with no
    // authoring context, which is the proof this test exists to stop being.
    expect(carved).toBeGreaterThan(0);
  });

  it('answers a modal through the shared table, by the line the table parses', () => {
    const { repl, gui } = bothDrivers();
    const talk = String(gui.snapshot().view!.choices.findIndex((choice) => choice.id === 'talk:tutorial-island.miki') + 1);
    inStep(repl, gui, talk);

    const asked = gui.snapshot().view!.modals[0].options[0];
    // The GUI's own route in, held to the line the REPL would have typed.
    inStep(repl, gui, `submit-modal: ${asked.key}=${asked.values![0]}`, () => gui.answer(asked.key, asked.values![0]));

    expect(gui.snapshot().view!.modals).toEqual([]);
  });

  it('walks the crafting route through both drivers, gesture against typed line', () => {
    const { repl, gui } = bothDrivers();
    inStep(repl, gui, 'use: entity.tutorial-island.smiths-chest.open');
    // The one route onto the screen: a GUI inventory row dispatches the shared
    // command with the item named, so what the row does is a line the REPL types.
    inStep(repl, gui, '/inv tutorial-island.iron-sword', () => gui.open('tutorial-island.iron-sword'));
    for (const [key, value] of CRAFTING_ROUTE) inStep(repl, gui, `submit-modal: ${key}=${value}`, () => gui.answer(key, value));

    expect(gui.snapshot().view!.modals).toEqual([]);
    const grown = JSON.parse(gui.serialized()!) as SerializedGrowth;
    // A route every step of which was refused would leave both drivers standing
    // in the same unmoved game, and every comparison above would pass over it.
    expect(Object.keys(grown.instances.byId['1'].payload.plane)).toEqual(['0,0', '1,0', '2,-1']);
    expect(grown.equipped).toEqual({ mainhand: '1' });
  });
});
