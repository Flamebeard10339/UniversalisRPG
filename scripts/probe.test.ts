import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { contentSectionMaps } from '../src/content/sections';
import { CORPUS_DIR, moduleSource, shippedFiles, shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';
import { tsxCli } from './lib/tsxCli';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { parseProbeArgs, probe, recordedSheetId, sourceFiles, splitDocuments, type ProbeOptions } from './probe';

const BASE: ModuleSource = {
  name: 'base',
  text: ['# info base', 'version: 1.0.0', '', '# stat swing-rate', 'base: 30', '', '# item bread', 'title: Bread', '', '# entity rat', 'title: Rat', 'bite:', '  instant', '  say: It bites.'].join('\n'),
};

const patch = (...body: string[]): ModuleSource => ({ name: 'patch', text: ['# info patch', 'version: 1.0.0', 'dependencies:', '  base', '', ...body].join('\n') });

const bare: ProbeOptions = { show: [], roundTrip: false };

const report = (sources: ModuleSource[], options: ProbeOptions = bare) => probe(sources, options);
const text = (sources: ModuleSource[], options: ProbeOptions = bare) => report(sources, options).lines.join('\n');

describe('probe: what the loader says', () => {
  it('prints the loader diagnostic for a rejected module, and refuses', () => {
    const result = report([{ name: 'm', text: '# info m\nversion: 1.0.0\n\n# item rock\nthrow:\n  instant\n  time: 3\n  say: x\n' }]);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('an instant action takes no time:');
  });

  it('names the source and stage a diagnostic came from', () => {
    expect(text([{ name: 'broken', text: '# info broken\nversion: 1.0.0\n\n# item rock\nwibble: 3\n' }])).toMatch(/broken.*\[broken\]/);
  });

  it('summarises a clean load by section kind', () => {
    const result = report([BASE]);
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('base 1.0.0');
    expect(result.lines.join('\n')).toMatch(/entity 1/);
    expect(result.lines.join('\n')).toMatch(/item 1/);
  });

  it('counts a kind that carries no references, so a variable-only module does not read as empty', () => {
    expect(text([{ name: 'v', text: '# info v\nversion: 1.0.0\n\n# variable travel-seconds-per-unit\nvalue: 5\n' }])).toMatch(/variable 1/);
  });
});

describe('probe: several modules in one invocation', () => {
  it('loads a base and a patch that edits it, and shows the merged record', () => {
    const result = report([BASE, patch('# item base.bread', 'title: Toast')], { show: ['item.base.bread'], roundTrip: false });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('"title": "Toast"');
  });

  it('orders by declared dependency, not by the order the sources were given', () => {
    const result = report([patch('# item base.bread', 'title: Toast'), BASE], { show: ['item.base.bread'], roundTrip: false });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('"title": "Toast"');
  });

  it('reports the module id rather than the source name', () => {
    expect(text([{ ...BASE, name: 'whatever-the-file-was-called' }])).toContain('base 1.0.0');
  });
});

describe('probe: --show', () => {
  it('prints one record as JSON', () => {
    const lines = text([BASE], { show: ['entity.base.rat'], roundTrip: false });
    expect(lines).toContain('entity.base.rat');
    expect(lines).toContain('"label": "bite"');
  });

  it('accepts every kind the loader defines, without naming any of them itself', () => {
    for (const [kind] of contentSectionMaps()) {
      const result = report([BASE], { show: [`${kind}.base.nothing-by-this-name`], roundTrip: false });
      expect(result.lines.join('\n'), kind).not.toContain('names nothing the registry holds');
    }
  });

  it('shows a kind the reference walk finds nothing in, under its own name', () => {
    const source = { name: 'v', text: '# info v\nversion: 1.0.0\n\n# variable travel-seconds-per-unit\nvalue: 5\n' };
    expect(text([source])).toContain('variable 1');
    const shown = report([source], { show: ['variable.travel-seconds-per-unit'], roundTrip: false });
    expect(shown.ok).toBe(true);
    expect(shown.lines.join('\n')).toContain('"value": 5');
  });

  it('refuses an unknown name and lists the one vocabulary there is', () => {
    const result = report([BASE], { show: ['widget.base.rat'], roundTrip: false });
    expect(result.ok).toBe(false);
    const lines = result.lines.join('\n');
    expect(lines).toContain('names nothing the registry holds');
    expect(lines).toMatch(/section kinds: .*\bentity\b/);
    for (const [kind] of contentSectionMaps()) expect(lines).toContain(kind);
  });

  it('refuses an absent id and lists what that kind does define', () => {
    const result = report([BASE], { show: ['entity.base.wolf'], roundTrip: false });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('base.rat');
  });

  it('refuses a spec with no kind, naming the form it wanted', () => {
    const result = report([BASE], { show: ['rat'], roundTrip: false });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('<kind>.<id>');
  });

  it('splits at the first dot, so a namespaced id survives', () => {
    expect(report([BASE], { show: ['entity.base.rat'], roundTrip: false }).ok).toBe(true);
  });

  it('reports every requested record, not only the first failure', () => {
    const result = report([BASE], { show: ['entity.base.wolf', 'item.base.bread'], roundTrip: false });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('"title": "Bread"');
  });
});

describe('probe: --round-trip', () => {
  it('reports a module that survives serialize and reload', () => {
    const result = report([BASE], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toMatch(/base.*round-trips clean/);
  });

  it('carries a declared variable through, so it is not reported as dropped', () => {
    const source = { name: 'v', text: '# info v\nversion: 1.0.0\n\n# variable travel-seconds-per-unit\nvalue: 5\n' };
    const result = report([source], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).not.toContain('variables: missing');
  });

  it('serializes every module, not the first', () => {
    const owning = patch('# item ribbon', 'title: Ribbon', '', '# item lantern', 'title: Lantern');
    const result = report([BASE, owning], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('round-trips clean');
  });

  it('survives a universe whose modules patch each other', () => {
    const result = report([BASE, patch('# item base.bread', 'title: Toast')], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('round-trips clean');
  });

  it('survives a universe holding a # remove, which one-module-at-a-time blamed on the wrong module', () => {
    const result = report([BASE, patch('# remove item.base.bread')], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).not.toContain('does not load');
  });

  it('says a source with no # info cannot be round-tripped, rather than reporting it as dropped', () => {
    const result = report([{ name: 'snippet', text: '# item rock\ntitle: Rock\n' }], { show: [], roundTrip: true });
    expect(result.lines.join('\n')).toContain('no # info');
    expect(result.lines.join('\n')).not.toContain('items: missing');
    expect(result.ok).toBe(true);
  });

  it('asks the per-module question under --round-trip=module, and reports what publishing one alone would lose', () => {
    const result = report([BASE, patch('# item base.bread', 'title: Toast')], { show: [], roundTrip: true, roundTripMode: 'module' });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('items: changed base.bread');
  });

  it('does not blame the serializer for a source with no # info, in module mode either', () => {
    const result = report([{ name: 'snippet', text: '# item rock\ntitle: Rock\n' }], { show: [], roundTrip: true, roundTripMode: 'module' });
    expect(result.lines.join('\n')).toContain('no # info');
    expect(result.lines.join('\n')).not.toContain('items: missing');
    expect(result.ok).toBe(true);
  });

  it('reports a module that does survive publication on its own', () => {
    const result = report([BASE], { show: [], roundTrip: true, roundTripMode: 'module' });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('round-trips clean on its own');
  });

  it('answers the universe question by default, where that same pair is clean', () => {
    const result = report([BASE, patch('# item base.bread', 'title: Toast')], { show: [], roundTrip: true });
    expect(result.ok).toBe(true);
  });

  it('round-trips the shipped content clean', () => {
    const result = report([moduleSource('core')], { show: [], roundTrip: true });
    expect(result.lines.join('\n')).toContain('round-trips clean');
    expect(result.ok).toBe(true);
  });
});

describe('probe: --each, a survey of variants', () => {
  const variant = (name: string, body: string): ModuleSource => ({ name, text: `# info m\nversion: 1.0.0\n\n# item rock\n${body}\n` });

  it('reports one verdict per source and does not stop at the first rejection', () => {
    const result = probe([variant('1', 'throw:\n  instant\n  time: 3\n  say: x'), variant('2', 'throw:\n  time: 3\n  rate: 4\n  say: x'), variant('3', 'title: Rock')], { show: [], roundTrip: false, each: true });
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toContain('an instant action takes no time:');
    expect(result.lines[1]).toMatch(/time:|rate:/);
    expect(result.lines[2]).toContain('loads');
  });

  it('exits satisfied on a table of rejections, because that is a normal thing to ask for', () => {
    const result = probe([variant('1', 'throw:\n  instant\n  time: 3\n  say: x')], { show: [], roundTrip: false, each: true });
    expect(result.ok).toBe(true);
  });

  it('keeps each source in its own universe, so one id can be reused across variants', () => {
    const result = probe([variant('1', 'title: A'), variant('2', 'title: B')], { show: [], roundTrip: false, each: true });
    expect(result.lines.every((line) => line.includes('loads'))).toBe(true);
  });

  it('names each verdict by its source', () => {
    expect(probe([variant('5c', 'throw:\n  time: -3\n  say: x')], { show: [], roundTrip: false, each: true }).lines[0]).toMatch(/^5c: /);
  });
});

describe('probe: stdin carrying several documents', () => {
  it('splits on a line of ---, so one heredoc is a table', () => {
    const documents = splitDocuments('stdin', '# info a\nversion: 1.0.0\n---\n# info b\nversion: 1.0.0\n');
    expect(documents.map((each) => each.name)).toEqual(['stdin-1', 'stdin-2']);
    expect(documents[1].text).toContain('# info b');
  });

  it('leaves a body with no separator as one source under the plain name', () => {
    expect(splitDocuments('stdin', '# info a\nversion: 1.0.0\n')).toEqual([{ name: 'stdin', text: '# info a\nversion: 1.0.0\n' }]);
  });

  it('does not split on --- that is not alone on its line', () => {
    expect(splitDocuments('stdin', '# info a\nversion: 1.0.0\ntitle: a --- b\n')).toHaveLength(1);
  });

  it('tolerates trailing whitespace on the separator line', () => {
    expect(splitDocuments('stdin', 'a\n---  \nb\n')).toHaveLength(2);
  });

  it('drops the blank documents a leading or trailing separator produces', () => {
    expect(splitDocuments('stdin', '---\n# info a\nversion: 1.0.0\n---\n').map((each) => each.name)).toEqual(['stdin-2']);
  });

  it('names a document with an id the loader accepts, so a variant that loads says so', () => {
    const documents = splitDocuments('stdin', '# variable a\nvalue: 1\n---\n# variable b\nvalue: 2\n');
    const report = probe(documents, { show: [], roundTrip: false, each: true });
    expect(report.lines).toEqual(['stdin-1: loads — variable 1', 'stdin-2: loads — variable 1']);
  });
});

const TESTED: ModuleSource = {
  name: 'tested',
  text: ['# info tested', 'version: 1.0.0', '', '# test starts-at-zero', 'assert: time = 0', '', '# test starts-at-five', 'assert: time = 5'].join('\n'),
};

describe('probe: running a # test from a shell', () => {
  const ran = (...specs: string[]) => probe([TESTED], { show: [], test: specs, roundTrip: false });

  it('runs the one test it is named, and says so', () => {
    const result = ran('tested.starts-at-zero');
    expect(result.ok).toBe(true);
    expect(result.lines).toContain('tested.starts-at-zero: PASSED');
    expect(result.lines.join('\n')).not.toContain('starts-at-five');
  });

  it('refuses, and names why, when the test fails', () => {
    const result = ran('tested.starts-at-five');
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toMatch(/tested\.starts-at-five: FAILED — .*time = 5/);
  });

  it('runs every test under an id that names none of its own, which is how a module id reads', () => {
    const result = ran('tested');
    expect(result.lines.filter((line) => line.includes('tested.'))).toEqual(['tested.starts-at-five: FAILED — time = 5', 'tested.starts-at-zero: PASSED']);
  });

  it('names what is defined when an id matches nothing at all', () => {
    const result = ran('tested.no-such-thing');
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('Defined: tested.starts-at-five, tested.starts-at-zero');
  });
});

describe('probe: arguments', () => {
  it('reads sources, --show and --round-trip', () => {
    const args = parseProbeArgs(['a.dsl', 'b.dsl', '--show', 'entity.base.rat', '--round-trip']);
    expect(args).toEqual({ sources: ['a.dsl', 'b.dsl'], show: ['entity.base.rat'], test: [], roundTrip: true, roundTripMode: 'universe', each: false });
  });

  it('takes --show more than once', () => {
    expect(parseProbeArgs(['a.dsl', '--show', 'entity.a', '--show', 'item.b'])).toMatchObject({ show: ['entity.a', 'item.b'] });
  });

  it('refuses --show with nothing after it rather than silently dropping it', () => {
    expect(() => parseProbeArgs(['a.dsl', '--show'])).toThrow(/--show/);
  });

  it('refuses an unknown flag rather than reading it as a filename', () => {
    expect(() => parseProbeArgs(['a.dsl', '--wibble'])).toThrow(/--wibble/);
  });

  it('refuses no sources at all', () => {
    expect(() => parseProbeArgs(['--round-trip'])).toThrow(/source/);
  });

  it('reads --round-trip=module and defaults to universe', () => {
    expect(parseProbeArgs(['a.dsl', '--round-trip'])).toMatchObject({ roundTrip: true, roundTripMode: 'universe' });
    expect(parseProbeArgs(['a.dsl', '--round-trip=module'])).toMatchObject({ roundTrip: true, roundTripMode: 'module' });
    expect(parseProbeArgs(['a.dsl', '--round-trip=universe'])).toMatchObject({ roundTripMode: 'universe' });
  });

  it('refuses a round-trip mode it does not have, naming the two it does', () => {
    expect(() => parseProbeArgs(['a.dsl', '--round-trip=sideways'])).toThrow(/universe or module/);
  });

  it('refuses --each beside --show, --test or --round-trip rather than dropping them', () => {
    expect(() => parseProbeArgs(['a.dsl', '--each', '--show', 'entity.a'])).toThrow(/--each/);
    expect(() => parseProbeArgs(['a.dsl', '--each', '--test', 'm.t'])).toThrow(/--each/);
    expect(() => parseProbeArgs(['a.dsl', '--each', '--round-trip'])).toThrow(/--each/);
  });

  it('takes --test more than once, and refuses it with nothing after it', () => {
    expect(parseProbeArgs(['a.dsl', '--test', 'm.one', '--test', 'm.two'])).toMatchObject({ test: ['m.one', 'm.two'] });
    expect(() => parseProbeArgs(['a.dsl', '--test'])).toThrow(/--test/);
  });

  it('refuses stdin named twice, which would read empty the second time', () => {
    expect(() => parseProbeArgs(['-', '-'])).toThrow(/stdin/);
  });
});

describe('probe: the command seam', () => {
  const repoRoot = path.join(import.meta.dirname, '..');
  const script = path.join(repoRoot, 'scripts/probe.ts');

  const run = (args: string[], input?: string) => {
    try {
      const stdout = execFileSync(process.execPath, [tsxCli, script, ...args], { cwd: repoRoot, encoding: 'utf8', input: input ?? '', stdio: ['pipe', 'pipe', 'pipe'] });
      return { status: 0, out: stdout };
    } catch (error) {
      const failure = error as { status: number; stdout: string; stderr: string };
      return { status: failure.status, out: `${failure.stdout}${failure.stderr}` };
    }
  };

  it('reads a source from stdin and exits 0 on a clean load', () => {
    const result = run(['-'], '# info m\nversion: 1.0.0\n\n# item rock\ntitle: Rock\n');
    expect(result.status).toBe(0);
    expect(result.out).toContain('item 1');
  });

  it('exits non-zero and prints the diagnostic when the loader refuses', () => {
    const result = run(['-'], '# info m\nversion: 1.0.0\n\n# item rock\nthrow:\n  instant\n  time: 3\n  say: x\n');
    expect(result.status).not.toBe(0);
    expect(result.out).toContain('an instant action takes no time:');
  });

  it('reads a file from the repository', () => {
    const result = run([`${CORPUS_DIR}/core.dsl`]);
    expect(result.status).toBe(0);
    expect(result.out).toContain('core');
  });

  // sourceFiles is a generic any-directory reader, one layer above content and unaware of the
  // shipped corpus; shippedFiles is content's own answer, which also excludes an author's local
  // changes. This is the guard that the two agree on what content/ itself holds.
  // What they agree on is which files, not what order: the generic reader sorts by file name and
  // content's own answer sorts by module id, which differ wherever one id is a prefix of another.
  it('reads a directory as the .dsl files in it, so the corpus is nameable where no glob expands', () => {
    expect([...sourceFiles(CORPUS_DIR)].sort()).toEqual(shippedFiles().map((file) => path.join(CORPUS_DIR, file)).sort());
  });

  it('runs one shipped # test by name and exits 0', () => {
    const id = [...loadUniverseWithDiagnostics(shippedSources()).registry.tests.keys()][0];
    const result = run([CORPUS_DIR, '--test', id]);
    expect(result.status).toBe(0);
    expect(result.out).toContain(`${id}: PASSED`);
  });
});

describe('probe: --record, the sheet a route is re-recorded into', () => {
  const REGISTRY = loadUniverseWithDiagnostics(shippedSources()).registry;
  const closing = [...REGISTRY.tests.keys()].flatMap((id) => {
    const sheet = recordedSheetId(REGISTRY, id);
    return sheet === undefined ? [] : [{ id, sheet }];
  });

  // The subjects are every shipped test that closes on a sheet, so a route written next month is
  // covered here with no edit. A name minted from the test id passes this only where the two happen
  // to agree, and in the corpus they do not: `miki-route-full` closes on `miki-route-end`.
  it('names a section the file already writes, for every route that closes on one', () => {
    expect(closing.length).toBeGreaterThan(0);
    const missing = closing.filter(({ id, sheet }) => !REGISTRY.saves.has(`${id.slice(0, id.lastIndexOf('.'))}.${sheet}`));
    expect(missing).toEqual([]);
  });

  it('reads the sheet off the route being recorded, not off one it opened by running', () => {
    const source: ModuleSource = {
      name: 'm',
      text: ['# info m', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# save inner-end', '{"version":13}', '', '# save outer-end', '{"version":13}', '', '# test inner', 'expect only: inner-end', '', '# test outer', 'run: inner', 'expect only: outer-end'].join('\n'),
    };
    const registry = loadUniverseWithDiagnostics([source]).registry;
    expect(recordedSheetId(registry, 'm.outer')).toBe('outer-end');
  });

  it('prints a body that loads back as that sheet and makes the route pass', () => {
    const body = (save: string): string =>
      ['# info m', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# location cave', 'x: 1, y: 0', '', `# save walked-end`, save, '', '# test walked', 'travel: cave', 'expect only: walked-end'].join('\n');
    const stale = report([{ name: 'm', text: body('{"version":13}') }], { show: [], roundTrip: false, record: ['m.walked'] });
    const printed = stale.lines[stale.lines.indexOf('# save walked-end') + 1];

    const rerun = report([{ name: 'm', text: body(printed) }], { show: [], roundTrip: false, test: ['m.walked'] });
    expect(rerun.lines.join('\n')).toContain('m.walked: PASSED');
    expect(rerun.ok).toBe(true);
  });

  // The stale sheet a re-recording exists to replace fails on the route's last directive, so failing
  // is not what tells a short walk apart — how far it got is. A route stopped before its end left the
  // world somewhere the route does not end, and printing that body is the one thing this tool must
  // never do, because pasting it in writes a truncated run into the file as if it were the route.
  it('refuses to print a body from a route that stopped short, and says where it stopped', () => {
    const source: ModuleSource = {
      name: 'm',
      text: ['# info m', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# item rope', 'title: Rope', '', '# save end', '{"version":13}', '', '# test short', 'assert: has m.rope', 'expect only: end'].join('\n'),
    };
    const result = report([source], { show: [], roundTrip: false, record: ['m.short'] });

    expect(result.lines.join('\n')).toContain('m.short: FAILED');
    expect(result.lines.join('\n')).toContain('stopped at step 1 of 2');
    expect(result.lines.some((line) => line.startsWith('# save '))).toBe(false);
    expect(result.ok).toBe(false);
  });

  // Its counterpart, and the reason the refusal is measured rather than read off the verdict: this
  // route also fails, on the sheet that is stale by definition, and its body is the one to paste in.
  it('prints the body of a route that failed only on its closing sheet, which is every re-recording', () => {
    const source: ModuleSource = {
      name: 'm',
      text: ['# info m', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', '', '# location cave', 'x: 1, y: 0', '', '# save end', '{"version":13}', '', '# test walked', 'travel: cave', 'expect: end'].join('\n'),
    };
    const result = report([source], { show: [], roundTrip: false, record: ['m.walked'] });

    expect(result.lines.join('\n')).toContain('m.walked: FAILED');
    expect(result.lines).toContain('# save end');
    expect(result.ok).toBe(true);
  });
});
