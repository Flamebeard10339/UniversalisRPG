import type { LocalSection } from '../content/localChanges';
import type { Answer } from './localized';
import { dropLocalSections, noted, stagedSections, stageLocalSections, type CommandContext, type CommandResult } from './command';
import { runAsSections, runSections, RUN_SECTION, type KeptRun, type RunHeader, type SectionAddress } from './runLog';
import { createGameState } from './runtime';
import { loadSave, savedGameFromSerialized } from './save';

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

// A run standing in the local changes, and which sections it is made of. Nothing else answers
// either question, so what a list shows and what dropping one takes cannot come apart.
export interface FiledRun {
  readonly id: Answer;
  readonly sections: readonly SectionAddress[];
}

// Every filed run among the sections staged, in the order they were filed. A run is what filing one
// writes, so it is picked out by the section runSections says a run is — and it carries whichever
// of that pair is actually there, so a run whose start save has already gone by hand is still a run
// and dropping it still takes only what remains.
export function filedRuns(staged: readonly LocalSection[]): FiledRun[] {
  const held = new Set(staged.map((section) => `${section.kind} ${section.id}`));
  return staged
    .filter((section) => section.kind === RUN_SECTION)
    .map((run) => ({ id: run.id, sections: runSections(run.id).filter((at) => held.has(`${at.kind} ${at.id}`)) }));
}

export const stagedRuns = (ctx: CommandContext): FiledRun[] => filedRuns(stagedSections(ctx));

// Dropping a run takes both its sections in one edit, so the game is never left holding a `# test`
// whose starting save has gone. There is no timer over this: a run the author has not exported yet
// is theirs to keep for as long as they like.
export function dropRun(ctx: CommandContext, id: string): CommandResult {
  const run = stagedRuns(ctx).find((each) => each.id === id);
  if (!run) return noted('error', `no run called ${id} is filed here.`);
  return dropLocalSections(ctx, run.sections);
}
