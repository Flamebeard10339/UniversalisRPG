import type { LocalSection } from '../content/localChanges';
import type { Answer } from './localized';
import { dropLocalSections, noted, refusedLine, stagedSections, stageLocalSections, type CommandContext, type CommandResult } from './command';
import { runAsSections, runSections, RUN_SECTION, startsAtSave, type KeptRun, type RunHeader, type SectionAddress } from './runLog';
import { createGameState } from './runtime';
import { loadSave, savedGameFromSerialized } from './save';

const because = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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

export interface FiledRun {
  readonly id: Answer;
  readonly sections: readonly SectionAddress[];
}

export function filedRuns(staged: readonly LocalSection[]): FiledRun[] {
  const held = new Set(staged.map((section) => `${section.kind} ${section.id}`));
  return staged
    .filter((section) => section.kind === RUN_SECTION)
    .map((run) => ({ id: run.id, sections: runSections(run.id).filter((at) => held.has(`${at.kind} ${at.id}`)) }));
}

export const stagedRuns = (ctx: CommandContext): FiledRun[] => filedRuns(stagedSections(ctx));

export function dropRun(ctx: CommandContext, id: string): CommandResult {
  const run = stagedRuns(ctx).find((each) => each.id === id);
  if (!run) return noted('error', `no run called ${id} is filed here.`);
  return dropLocalSections(ctx, run.sections);
}

const escaped = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function swappedIds(from: string, to: string): (line: string) => string {
  const named = runSections(to);
  const swaps = new Map(runSections(from).map((at, index) => [at.id, named[index].id]));
  const ids = [...swaps.keys()].sort((one, other) => other.length - one.length).map(escaped);
  const naming = new RegExp(`(?<![\\w-])(${ids.join('|')})(?![\\w-])`, 'g');
  return (line) => line.replace(naming, (id) => swaps.get(id) ?? id);
}

function renamedSection(section: LocalSection, swap: (line: string) => string): string {
  const [heading, ...body] = section.text.split('\n');
  return [swap(heading), ...(section.kind === RUN_SECTION ? body.map(swap) : body)].join('\n');
}

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
