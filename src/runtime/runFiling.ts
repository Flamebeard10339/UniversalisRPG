import type { LocalSection } from '../content/localChanges';
import type { Answer } from './localized';
import { dropLocalSections, noted, refusedLine, stagedSections, stageLocalSections, type CommandContext, type CommandResult } from './command';
import { runAsSections, runSections, RUN_SECTION, startsAtSave, type KeptRun, type RunHeader, type SectionAddress } from './runLog';
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
  const { from } = kept;
  const started = startsAtSave(from) ? ctx.session.registry.saves.get(from.save) ?? null : savedGameFromSerialized(from.bytes);
  if (started === null) return startsAtSave(from) ? `this world holds no # save ${from.save}` : 'it does not read as a saved game';
  try {
    loadSave(createGameState(), started, ctx.session.registry);
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
// of that list is actually there. A run that walks forward from a save the world already holds
// filed none of its own and takes none away; one nobody asked a sheet of filed no ending save; and
// a start removed by hand is still a run that drops what remains.
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

const escaped = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The names a rename swaps, derived from what a run of each name is filed as rather than by
// spelling the suffixes a second time: whatever runSections says a run's addresses are, those are
// the words that move.
function swappedIds(from: string, to: string): (line: string) => string {
  const named = runSections(to);
  const swaps = new Map(runSections(from).map((at, index) => [at.id, named[index].id]));
  // Longest first, so the id of a run is not read out of the id of its start.
  const ids = [...swaps.keys()].sort((one, other) => other.length - one.length).map(escaped);
  const naming = new RegExp(`(?<![\\w-])(${ids.join('|')})(?![\\w-])`, 'g');
  return (line) => line.replace(naming, (id) => swaps.get(id) ?? id);
}

// A section under its new name. Every heading names the run; only the `# test` says the names again
// in its body, where it loads the save it walks forward from and expects the one it ends on. A
// saved game's bytes are the world's and are left exactly as they were recorded.
function renamedSection(section: LocalSection, swap: (line: string) => string): string {
  const [heading, ...body] = section.text.split('\n');
  return [swap(heading), ...(section.kind === RUN_SECTION ? body.map(swap) : body)].join('\n');
}

// Renaming a run moves every section it is filed as, because a run minted its name from the instant
// it started and an author reading a list of them wants to know which was which. The renamed
// sections are staged before the old ones are dropped, so a name the language refuses leaves the
// run standing where it was.
export function renameRun(ctx: CommandContext, id: string, to: string): CommandResult {
  const staged = stagedSections(ctx);
  const filed = filedRuns(staged);
  const run = filed.find((each) => each.id === id);
  if (!run) return noted('error', `no run called ${id} is filed here.`);
  if (to === id) return noted('error', `${id} is what it is already called.`);
  if (filed.some((each) => each.id === to)) return noted('error', `a run called ${to} is filed here already.`);

  const swap = swappedIds(id, to);
  const held = new Map(staged.map((section) => [`${section.kind} ${section.id}`, section]));
  const renamed = run.sections.flatMap((at) => {
    const section = held.get(`${at.kind} ${at.id}`);
    return section === undefined ? [] : [renamedSection(section, swap)];
  });

  const written = stageLocalSections(ctx, renamed);
  if (refusedLine(written)) return written;
  const dropped = dropLocalSections(ctx, run.sections);
  return { ...dropped, output: [...written.output, ...dropped.output] };
}
