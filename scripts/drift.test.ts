import { describe, expect, it } from 'vitest';
import { COMMANDS, runLine, type CommandResult } from '../src/runtime/command';
import { serializeSession } from '../src/runtime/session';
import { createDriver, type Driver } from '../src/ui/driver';
import { SHIPPED_SOURCES } from '../src/ui/shippedContent';
import { appendOutputs } from '../src/ui/transcript';
import { openRepl, type Repl } from './play-cli';

const refused = (result: CommandResult): boolean => result.output.some((each) => each.kind === 'message' && each.tone === 'error');

// The three table entries whose names are shapes rather than words, given one
// line each of that shape. Every other line below is the name the table itself
// carries, so a command added tomorrow is replayed here on the day it exists
// and nobody edits this file — or anything under src/ui — to make that happen.
const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

// Both drivers armed the same way. `driving` decides whether a spannable
// action is armed or resolved where it stands, and the GUI always arms, so a
// comparison against a REPL that resolves would compare two different games.
function bothDrivers(): { repl: Repl; gui: Driver } {
  return { repl: openRepl(SHIPPED_SOURCES, { driving: true }), gui: createDriver(SHIPPED_SOURCES, { ticker: () => () => undefined }) };
}

// One line through both, held to the two things the clause names: the GUI's
// log gains exactly the REPL's output and nothing else, and the two sessions
// serialize to the same bytes. Per line rather than at the end, because a
// divergence that cancels itself out is still one and only this names the line
// it happened on.
function inStep(repl: Repl, gui: Driver, line: string, dispatch: () => void = () => gui.send(line)): CommandResult {
  const before = gui.snapshot().transcript;
  const result = runLine(repl.context, line);
  dispatch();

  const where = `after ${JSON.stringify(line)}`;
  expect(gui.snapshot().transcript.entries, where).toEqual(appendOutputs(before, result.output).entries);
  expect(gui.serialized(), where).toBe(serializeSession(repl.context.session));
  return result;
}

describe('the two drivers cannot drift', () => {
  it('reaches byte-identical state and says the same things, over a scripted sequence', () => {
    const script = ['/look', '/inventory', '/state', '1', '/wait 3', '/speed 2', '/look', '/bogus', '/assert time >= 3', '/expect empty', '/dsl location tutorial-island.guide-house', '/help'];
    const { repl, gui } = bothDrivers();
    expect(gui.serialized()).toBe(serializeSession(repl.context.session));

    for (const line of script) inStep(repl, gui, line);

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

    for (const spec of COMMANDS) {
      const bare = SHAPED[spec.name] ?? spec.name;
      for (const line of [bare, `${bare} 1`]) {
        if (!refused(inStep(repl, gui, line))) accepted += 1;
      }
    }

    // A table every entry of which was refused would prove nothing about
    // dispatch, only about parsing.
    expect(accepted).toBeGreaterThan(7);
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
});
