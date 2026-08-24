import { noted, savedGameFromSerialized, stageLocalSections, type CommandContext, type CommandResult } from './command';
import { runAsSections, type KeptRun, type RunHeader } from './runLog';
import { createGameState } from './runtime';
import { loadSave } from './save';

// A run the author played lands in the game they are playing, so a reload runs through what they
// just did. It lands as the sections runLog writes and through the one load-and-adopt path, which
// refuses a module it cannot leave playable rather than writing one.

const because = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// There is no migration: a run walks forward from a saved game, and a build that has moved on since
// it was played cannot read that game back. Filing it anyway would write a `# test` whose first
// line always fails.
function unreadableStart(kept: KeptRun, ctx: CommandContext): string | null {
  const from = savedGameFromSerialized(kept.from);
  if (from === null) return 'it does not read as a saved game';
  try {
    loadSave(createGameState(), from, ctx.session.registry);
    return null;
  } catch (error) {
    return because(error);
  }
}

export function fileRun(ctx: CommandContext, kept: KeptRun, header: RunHeader): CommandResult {
  const unreadable = unreadableStart(kept, ctx);
  if (unreadable !== null) return noted('error', `the save this run walks forward from cannot be read here: ${unreadable}`);
  return stageLocalSections(
    ctx,
    runAsSections(kept, header).map((block) => block.join('\n')),
  );
}
