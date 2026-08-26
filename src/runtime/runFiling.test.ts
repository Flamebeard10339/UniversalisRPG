import { describe, expect, it } from 'vitest';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { initialLocalChangesModule, listLocalSections, localSectionHeadings } from '../content/localChanges';
import { FIXTURE_WORLD } from '../content/worldFixture';
import type { ModuleSource } from '../content/universe';
import { newContext, stagedSections, type AuthoringContext, type CommandContext, type CommandResult } from './command';
import { dropRun, fileRun, filedRuns, renameRun, stagedRuns } from './runFiling';
import { runAsSections, type KeptRun } from './runLog';
import { serializeSession, startSession, view } from './session';

const WORLD =
  `
# info base
version: 1.0.0
` +
  FIXTURE_WORLD +
  `
# item coin
title: Coin
`;

const PLAYED = { at: '2026-08-25T09:00:00.000Z', built: 'a test' };

interface Standing {
  ctx: CommandContext;
  onDisk: () => string;
}

function standing(): Standing {
  const baseSources: ModuleSource[] = [engineLocale(), { name: 'base', text: WORLD }];
  let held = initialLocalChangesModule(['base']);
  const authoring: AuthoringContext = {
    baseSources,
    dependencies: ['base'],
    localSource: { name: 'local-changes', text: held },
    writeLocalChanges: (text) => void (held = text),
    readLocalChanges: () => held,
  };
  const session = startSession(loadInEnglish(WORLD));
  const ctx = newContext(session, view(session), { recorder: { history: [], startSave: serializeSession(session) }, authoring });
  return { ctx, onDisk: () => held };
}

const keptAs = (id: string, ctx: CommandContext): KeptRun => ({ run: { id, log: [] }, from: { bytes: serializeSession(ctx.session) } });

function file(ctx: CommandContext, id: string): CommandResult {
  const result = fileRun(ctx, keptAs(id, ctx), PLAYED);
  expect(result.output.filter((out) => out.kind === 'message' && out.tone === 'error')).toEqual([]);
  return result;
}

const errors = (result: CommandResult): string[] => result.output.flatMap((out) => (out.kind === 'message' && out.tone === 'error' ? [out.text] : []));

describe('a filed run is the sections filing wrote, and dropping one takes those', () => {
  it('takes exactly what filing writes, derived from the filing rather than named here', () => {
    const kept: KeptRun = { run: { id: 'run-a', log: [] }, from: { bytes: '{"version":0}' }, ends: '{"version":0}' };
    const written = runAsSections(kept).map((block) => block[0]);
    const staged = written.map((heading) => {
      const [, kind, id] = /^# (\S+) (\S+)$/.exec(heading)!;
      return { kind, id, text: heading };
    });

    const [run] = filedRuns(staged);

    expect(run.id).toBe('run-a');
    expect(run.sections.map((at) => `# ${at.kind} ${at.id}`)).toEqual(written);
  });

  it('lists a run whose starting save has already gone by hand, and claims only what is left', () => {
    const kept: KeptRun = { run: { id: 'run-b', log: [] }, from: { bytes: '{"version":0}' } };
    const [, walked] = runAsSections(kept);

    const [run] = filedRuns([{ kind: 'test', id: 'run-b', text: walked.join('\n') }]);

    expect(run.sections).toEqual([{ kind: 'test', id: 'run-b' }]);
  });

  it('files one section for a run walking forward from a save the world already holds, and dropping it leaves that save', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');

    const named: KeptRun = { run: { id: 'run-two', log: [] }, from: { save: 'local-changes.run-one-start' } };
    expect(errors(fileRun(ctx, named, PLAYED))).toEqual([]);
    expect(localSectionHeadings(onDisk())).toEqual(['# save run-one-start', '# test run-one', '# test run-two']);
    expect(stagedRuns(ctx).find((run) => run.id === 'run-two')!.sections).toEqual([{ kind: 'test', id: 'run-two' }]);

    expect(errors(dropRun(ctx, 'run-two'))).toEqual([]);
    expect(localSectionHeadings(onDisk())).toEqual(['# save run-one-start', '# test run-one']);
  });

  it('says so and writes nothing when the run names a save this world does not hold', () => {
    const { ctx, onDisk } = standing();
    const before = onDisk();

    const named: KeptRun = { run: { id: 'run-three', log: [] }, from: { save: 'nowhere' } };

    expect(errors(fileRun(ctx, named, PLAYED))).toEqual(['the save this run walks forward from cannot be read here: this world holds no # save nowhere']);
    expect(onDisk()).toBe(before);
  });

  it('drops both sections of the run asked for and leaves every other section standing', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');
    file(ctx, 'run-two');
    expect(stagedRuns(ctx).map((run) => run.id)).toEqual(['run-one', 'run-two']);

    const dropped = dropRun(ctx, 'run-one');

    expect(errors(dropped)).toEqual([]);
    expect(localSectionHeadings(onDisk())).toEqual(['# save run-two-start', '# test run-two']);
    expect(stagedRuns(ctx).map((run) => run.id)).toEqual(['run-two']);
    expect([...ctx.session.registry.tests.keys()]).toEqual(['local-changes.run-two']);
    expect([...ctx.session.registry.saves.keys()]).toEqual(['local-changes.run-two-start']);
  });

  it('says so and writes nothing when the run named is not filed here', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');
    const before = onDisk();

    expect(errors(dropRun(ctx, 'run-two'))).toEqual(['no run called run-two is filed here.']);
    expect(onDisk()).toBe(before);
  });

  it('reads the staged sections through the same file the commands edit', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');

    expect(stagedSections(ctx)).toEqual(listLocalSections(onDisk()));
  });
});

describe('renaming a filed run moves every section it is filed as', () => {
  it('carries the run and its saves across, and leaves the world holding the run under the new name alone', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');

    expect(errors(renameRun(ctx, 'run-one', 'run-fishing'))).toEqual([]);

    expect(localSectionHeadings(onDisk())).toEqual(['# save run-fishing-start', '# test run-fishing']);
    expect(stagedRuns(ctx).map((run) => run.id)).toEqual(['run-fishing']);
    expect([...ctx.session.registry.tests.keys()]).toEqual(['local-changes.run-fishing']);
    expect([...ctx.session.registry.saves.keys()]).toEqual(['local-changes.run-fishing-start']);
  });

  it('renames the saves the run names inside itself, so the renamed run still loads where it began', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');

    renameRun(ctx, 'run-one', 'run-fishing');

    const walked = listLocalSections(onDisk()).find((section) => section.kind === 'test')!;
    expect(walked.text).not.toContain('run-one');
    expect(walked.text).toContain('load: run-fishing-start');
  });

  it('leaves every other run standing', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');
    file(ctx, 'run-two');

    renameRun(ctx, 'run-one', 'run-fishing');

    expect(stagedRuns(ctx).map((run) => run.id).sort()).toEqual(['run-fishing', 'run-two']);
    expect(localSectionHeadings(onDisk())).toContain('# save run-two-start');
  });

  it('says so and writes nothing when the run named is not filed here, when the name is its own, or when it is another run’s', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');
    file(ctx, 'run-two');
    const before = onDisk();

    expect(errors(renameRun(ctx, 'run-three', 'run-fishing'))).toEqual(['no run called run-three is filed here.']);
    expect(errors(renameRun(ctx, 'run-one', 'run-one'))).toEqual(['run-one is what it is already called.']);
    expect(errors(renameRun(ctx, 'run-one', 'run-two'))).toEqual(['a run called run-two is filed here already.']);
    expect(onDisk()).toBe(before);
  });

  it('leaves the run standing under its old name when the language refuses the new one', () => {
    const { ctx, onDisk } = standing();
    file(ctx, 'run-one');
    const before = onDisk();

    expect(errors(renameRun(ctx, 'run-one', 'a name with spaces'))).not.toEqual([]);
    expect(onDisk()).toBe(before);
  });
});
