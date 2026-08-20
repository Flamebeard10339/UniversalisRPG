import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECTION_MAPS } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { tsxCli } from './lib/tsxCli';
import { parseProbeArgs, probe, splitDocuments, type ProbeOptions } from './probe';

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
    for (const [kind] of CONTENT_SECTION_MAPS) {
      const result = report([BASE], { show: [`${kind}.base.nothing-by-this-name`], roundTrip: false });
      expect(result.lines.join('\n'), kind).not.toContain('names nothing the registry holds');
    }
  });

  // The kinds that used to be showable only under their registry map's name.
  // `variable` was the natural wrong guess when the two vocabularies were
  // separate; the row gives every registry map a kind, so there is one
  // vocabulary now and the guess is the right spelling.
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
    for (const [kind] of CONTENT_SECTION_MAPS) expect(lines).toContain(kind);
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

  // Both patch fixtures below own no ids of their own, so a serialization that
  // silently covered only some of the universe would be invisible through them.
  // This one owns content, so dropping it from the set loses that content.
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
    // Its ids are root ids, so the serializer's namespace filter matches
    // nothing. Calling that a difference would read as a serializer defect.
    const result = report([{ name: 'snippet', text: '# item rock\ntitle: Rock\n' }], { show: [], roundTrip: true });
    expect(result.lines.join('\n')).toContain('no # info');
    expect(result.lines.join('\n')).not.toContain('items: missing');
    expect(result.ok).toBe(true);
  });

  // The question the universe form cannot answer, and the reason it did not have
  // to be a trade: a patch module owns none of the ids it edits, so serializing
  // it alone drops them. This is the live contribution-system H1.
  it('asks the per-module question under --round-trip=module, and reports what publishing one alone would lose', () => {
    const result = report([BASE, patch('# item base.bread', 'title: Toast')], { show: [], roundTrip: true, roundTripMode: 'module' });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('items: changed base.bread');
  });

  // 7b16910 fixed exactly this for the universe form; the module form is a
  // second path and the guard has to be on both. A check that could not run is
  // not a check that failed.
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
    const result = report([{ name: 'tutorial-island', text: readFileSync('content/tutorial-island.dsl', 'utf8') }], { show: [], roundTrip: true });
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

  // What the survey exists to answer: which variants load. A document with no
  // `# info` takes its module id from its source name, so `stdin[3]` made
  // every such variant report a refusal about its own name and nothing about
  // the DSL under test.
  it('names a document with an id the loader accepts, so a variant that loads says so', () => {
    const documents = splitDocuments('stdin', '# variable a\nvalue: 1\n---\n# variable b\nvalue: 2\n');
    const report = probe(documents, { show: [], roundTrip: false, each: true });
    expect(report.lines).toEqual(['stdin-1: loads — variable 1', 'stdin-2: loads — variable 1']);
  });
});

describe('probe: arguments', () => {
  it('reads sources, --show and --round-trip', () => {
    const args = parseProbeArgs(['a.dsl', 'b.dsl', '--show', 'entity.base.rat', '--round-trip']);
    expect(args).toEqual({ sources: ['a.dsl', 'b.dsl'], show: ['entity.base.rat'], roundTrip: true, roundTripMode: 'universe', each: false });
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

  it('refuses --each beside --show or --round-trip rather than dropping them', () => {
    // A survey has no single universe to look in, so answering --show against
    // it would be answering a different question than the one asked.
    expect(() => parseProbeArgs(['a.dsl', '--each', '--show', 'entity.a'])).toThrow(/--each/);
    expect(() => parseProbeArgs(['a.dsl', '--each', '--round-trip'])).toThrow(/--each/);
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
    const result = run(['content/tutorial-island.dsl']);
    expect(result.status).toBe(0);
    expect(result.out).toContain('tutorial-island');
  });
});
