import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { runLine } from '../runtime/command';
import { newContext } from '../runtime/command';
import { startSession, view } from '../runtime/session';
import { SHIPPED_SOURCES } from './shippedContent';
import { settingLine, standsAt } from './settingLines';

// The page's only decisions: which line a choice sends, and which choice is the one it stands at.
// Its subjects are every setting the engine publishes, so a preference declared next month is
// covered here with nothing edited.
describe('a settings control writes what a player would have typed', () => {
  const opened = () => {
    const session = startSession(loadUniverseWithDiagnostics(SHIPPED_SOURCES).registry);
    return { session, ctx: newContext(session, view(session)) };
  };

  it('sends a line the command table takes, for every choice of every setting', () => {
    const { ctx } = opened();

    for (const row of ctx.view.settings) {
      for (const choice of row.choices) {
        const result = runLine(ctx, settingLine(row.name, choice.written));
        expect(result.output.some((each) => each.kind === 'message' && each.tone === 'error'), `${row.name} ${choice.written}`).toBe(false);
        expect(ctx.view.settings.find((each) => each.name === row.name)?.standing).toBe(choice.written);
      }
    }
  });

  it('marks exactly the choice the setting stands at', () => {
    const { ctx } = opened();

    for (const row of ctx.view.settings) {
      expect(row.choices.filter((choice) => standsAt(row, choice.written)).length, row.name).toBe(1);
    }
  });
});
